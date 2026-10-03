import { bearer,bad,fail,json,newToken,queryInt,text } from './http';
import { PUBLIC_CATALOG,PUBLIC_NOTICE,PUBLIC_POLICY,INTERNAL_IP_HEADER,available,publicAction,utf8Bytes } from './public-contracts';
import type { PublicPolicy,ValidatedOperatorAck,PublicMessage,Bucket,PublicGrantResult } from './public-contracts';
import { publicBody,publicError,publicLimited,publicGuide,cancelUnusedRequestBody } from './public-http';
import {validatePublicPolicy,validatePublicCatalog} from './public-policy';
import {serviceMetadata,messageFields,pageFields} from './public-safety';
import {CoreBudget} from './runtime/budget';
import type {PrivateBudgetPort} from './private-contracts';
interface Grant {expires:number;nextSend:number;join?:{requestId:string;leaseToken:string};}
interface Lease {id:string;token:string;role:'participant'|'watcher';ip:string;nickname:string;grant?:Grant;activity:number;lastRead:number;}
interface IpRate {at:number;nextSend:number;admissions:number[];requests:Bucket;}
interface Waiter {wake:()=>void;lease:Lease;after?:string;deadline:number;}
interface Page {service:ReturnType<typeof serviceMetadata>;messages:PublicMessage[];epoch:string;cursor:string;earliest_cursor:string;history_status:'ok'|'history_gap'|'history_reset';has_more:boolean;initial_window?:{max_age_seconds:number;max_messages:number;truncated:boolean};notice?:string;}
export interface PublicRoomOptions {origin:string;catalog:()=>ReadonlyArray<{slug:string;title:string}>;policy:()=>PublicPolicy;clock?:()=>number;budget?:PrivateBudgetPort;}
export class PublicRoomCore {
 private readonly epoch=crypto.randomUUID();
 private stopped=false;private revision=0;
 private catalog:ReadonlyArray<{slug:string;title:string}>;
 private readonly origin:string;private readonly budget:CoreBudget;
 constructor(options:PublicRoomOptions){this.origin=options.origin;this.catalog=validatePublicCatalog(options.catalog());this.policy=validatePublicPolicy(options.policy());this.clock=options.clock??(()=>Date.now());this.budget=new CoreBudget(options.budget,this.clock);for(const bucket of [this.requests,this.responses,this.bytes])bucket.at=this.clock();}
 configure(revision:number,policy:PublicPolicy,catalog:ReadonlyArray<{slug:string;title:string}>):void {if(!Number.isSafeInteger(revision)||revision<=this.revision)throw new Error('SETTINGS_REVISION');const next=validatePublicPolicy(policy),rooms=validatePublicCatalog(catalog);this.policy=next;this.catalog=rooms;this.revision=revision;this.prune();}
 shutdown():void {this.stopped=true;clearTimeout(this.batchTimer);this.batchTimer=undefined;for(const waiter of this.waiters.values())waiter.wake();}
 private slug?:string;
 private policy:PublicPolicy={...PUBLIC_POLICY};
 private clock=()=>Date.now();
 private sequence=0;
 private ring:PublicMessage[]=[];
 private grants=new Map<string,Grant>();
 private leases=new Map<string,Lease>();
 private ips=new Map<string,IpRate>();
 private sentAt:number[]=[];
 private waiters=new Map<string,Waiter>();
 private batchTimer?:ReturnType<typeof setTimeout>;
 private requests:Bucket={tokens:PUBLIC_POLICY.requestBurst,at:Date.now()};
 private responses:Bucket={tokens:PUBLIC_POLICY.responseBurst,at:Date.now()};
 private bytes:Bucket={tokens:PUBLIC_POLICY.byteBurst,at:Date.now()};
 private activeHandlers=0;private maxHandlers=0;private maxWaits=0;private maxBufferBytes=0;
 private egressBytes=0;private dataResponses=0;private accepted=0;private rateRejected=0;
 private bind(slug:string,admission=false) {
  if((admission||this.slug!==slug)&&!this.catalog.some(r=>r.slug===slug))fail(404,'NOT_FOUND','공개방이 없습니다.');
  if(this.slug&&this.slug!==slug)fail(403,'ROOM_MISMATCH','방이 다릅니다.');this.slug=slug;
 }
 private prune() {
  const now=this.clock();this.ring=this.ring.filter(m=>now-Date.parse(m.created_at)<this.policy.retentionMs).slice(-this.policy.messages);
  for(const [token,l] of this.leases)if(now-l.activity>=this.policy.leaseMs){this.leases.delete(token);this.waiters.get(l.id)?.wake();}
  for(const [token,g] of this.grants)if(g.expires<=now&&(!g.join||!this.leases.has(g.join.leaseToken)))this.grants.delete(token);
  for(const [ip,rate] of this.ips)if(now-rate.at>=this.policy.ipMemoryMs&&![...this.leases.values()].some(l=>l.ip===ip))this.ips.delete(ip);
  this.sentAt=this.sentAt.filter(t=>now-t<this.policy.roomWindowMs);
 }
 private async handler<T>(fn:()=>Promise<T>):Promise<T> {
  if(this.stopped)fail(503,'ROOM_SHUTDOWN','서버가 종료 중입니다. 다시 연결하세요.');
  if(this.activeHandlers>=this.policy.handlers)publicLimited();this.activeHandlers++;this.maxHandlers=Math.max(this.maxHandlers,this.activeHandlers);
  try{return await fn();}finally{this.activeHandlers--;}
 }
 private requestAdmission() {
  if(available(this.requests,this.clock(),this.policy.requestPerSecond,this.policy.requestBurst)<1)publicLimited();this.requests.tokens--;
 }
 private ipRate(ip:string):IpRate {
  if(!/^[a-f0-9]{64}$/.test(ip))fail(403,'TRUSTED_IP_REQUIRED','내부 IP 전달 계약이 필요합니다.');
  let rate=this.ips.get(ip);if(!rate){if(this.ips.size>=this.policy.ipKeys)publicLimited(this.policy.ipMemoryMs);
   rate={at:this.clock(),nextSend:0,admissions:[],requests:{tokens:this.policy.ipRequestBurst,at:this.clock()}};this.ips.set(ip,rate);}return rate;
 }
 private ipRequest(rate:IpRate) {
  const tokens=available(rate.requests,this.clock(),this.policy.ipRequestsPerSecond,this.policy.ipRequestBurst);
  if(tokens<1)publicLimited((1-tokens)*1000/this.policy.ipRequestsPerSecond);rate.requests.tokens--;
 }
 private admissionAvailable(rate:IpRate) {
  const now=this.clock();rate.admissions=rate.admissions.filter(t=>now-t<this.policy.admissionWindowMs);
  if(rate.admissions.length>=this.policy.grantAdmissions)publicLimited(rate.admissions[0]+this.policy.admissionWindowMs-now);
 }
 async issueOperatorGrant(ack:ValidatedOperatorAck):Promise<PublicGrantResult> {
  try{return await this.handler(async()=>{
   this.prune();this.bind(ack.room,true);this.requestAdmission();
   if(ack.checked!==true||ack.risk_ack_version!==PUBLIC_NOTICE)fail(403,'OPERATOR_ACK_REQUIRED','검증된 안내 확인이 필요합니다.');
   const operation=await this.budget.admit();
   const rate=this.ipRate(ack.trustedIpHash);this.ipRequest(rate);this.admissionAvailable(rate);
   if([...this.grants.values()].filter(g=>!g.join||!this.leases.has(g.join.leaseToken)).length>=this.policy.pendingGrants)publicLimited(this.policy.grantMs);
   const token=this.epoch+'.'+newToken(),expires=this.clock()+this.policy.grantMs;
   this.grants.set(token,{expires,nextSend:0});rate.admissions.push(this.clock());rate.at=this.clock();
   const data={operator_grant:token,epoch:this.epoch,expires_at:new Date(expires).toISOString(),notice_version:PUBLIC_NOTICE};await this.budget.reserve(operation,'response_bytes',utf8Bytes(JSON.stringify(data)));return {status:201,data,retry_after_ms:undefined as number|undefined};
  });}catch(error){const response=publicError(error),data=await response.json() as PublicGrantResult['data'];return {status:response.status,data,retry_after_ms:'error' in data?data.error.retry_after_ms:undefined};}
 }
 async fetch(request:Request):Promise<Response> {
  try{return await this.handler(async()=>{const cleanup=request.method==='DELETE'&&new URL(request.url).pathname.endsWith('/lease');const operation=cleanup?undefined:await this.budget.admit();const response=await this.dispatch(request);return operation?this.budget.respond(response,operation):response;});}catch(error){return publicError(error);}finally{cancelUnusedRequestBody(request);}
 }
 private async dispatch(request:Request):Promise<Response> {
  try{return await (async()=>{
   this.prune();const url=new URL(request.url),match=/^\/api\/public\/rooms\/([a-z0-9-]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
   if(!match)fail(404,'NOT_FOUND','경로가 없습니다.');this.bind(match[1]);
   const action=publicAction(match[2]??'',request.method);if(!action)fail(404,'NOT_FOUND','경로가 없습니다.');this.requestAdmission();
   const ip=request.headers.get(INTERNAL_IP_HEADER)??'';if(!/^[a-f0-9]{64}$/.test(ip))fail(403,'TRUSTED_IP_REQUIRED','내부 IP 전달 계약이 필요합니다.');
   if((action==='participants'||action==='watchers')&&!this.catalog.some(r=>r.slug===this.slug))fail(404,'NOT_FOUND','공개방이 비활성화되었습니다.');
   if(action==='guide')return new Response(publicGuide(this.slug!,this.origin,this.catalog.find(r=>r.slug===this.slug)?.title,this.policy),{headers:{'Content-Type':'text/markdown; charset=utf-8'}});
   if(action==='participants'||action==='watchers')return this.join(request,ip,action==='participants');
   const lease=this.lease(bearer(request));
   // Existing read/leave stays usable when the rate map is full; never allocate a new IP key here.
   const knownIp=this.ips.get(ip);if(knownIp)this.ipRequest(knownIp);
   if(action==='leave'){this.leases.delete(lease.token);this.waiters.get(lease.id)?.wake();return new Response(null,{status:204});}
   if(action==='metadata'){lease.activity=this.clock();return json({service:serviceMetadata(['title']),slug:this.slug,title:this.catalog.find(r=>r.slug===this.slug)?.title,epoch:this.epoch,leases:this.leaseCounts(),visibility:'public',retention_mode:'memory',notice_version:PUBLIC_NOTICE});}
   if(action==='send'){if(lease.role!=='participant')fail(403,'CAPABILITY_DENIED','발언 권한이 없습니다.');return this.send(request,lease,ip);}
   const after=url.searchParams.get('after')??undefined,limit=queryInt(url,'limit',this.policy.pageSize,1,this.policy.pageSize);
   this.page(after,limit);return this.read(request,lease,after,limit,action==='wait'?queryInt(url,'timeout',25,0,25)*1000:0);
  })();}catch(error){if((error as {status?:number})?.status===429)this.rateRejected++;return publicError(error);}
 }
 private lease(token:string):Lease {
  if(token.split('.')[0]!==this.epoch)fail(409,'LEASE_EPOCH_RESET','방이 재시작되었습니다. 다시 입장하세요.');
  const lease=this.leases.get(token);if(!lease)fail(403,'CAPABILITY_DENIED','입장 lease가 없거나 만료되었습니다.');return lease;
 }
 private async join(request:Request,ip:string,speaking:boolean):Promise<Response> {
  const rate=this.ipRate(ip);this.ipRequest(rate);this.admissionAvailable(rate);
  const input=await publicBody(request,this.policy,speaking?['operator_grant','client_request_id','nickname','notice_version','visibility','retention_mode']:['notice_version']);
  this.prune();this.bind(this.slug!,true);if(input.notice_version!==PUBLIC_NOTICE)bad();let grant:Grant|undefined,requestId='',nickname='';
  if(speaking){
   if(input.visibility!=='public'||input.retention_mode!=='memory')bad();
   const token=text(input.operator_grant,1,128);requestId=text(input.client_request_id,1,128);nickname=text(input.nickname,1,64);
   grant=this.grants.get(token);if(!grant||grant.expires<=this.clock())fail(403,'OPERATOR_GRANT_EXPIRED','방 승인 grant가 없거나 만료되었습니다.');
   const prior=grant.join&&this.leases.get(grant.join.leaseToken);
   if(prior){if(grant.join!.requestId!==requestId)fail(409,'GRANT_IN_USE','이미 참여 중인 grant입니다.');prior.activity=this.clock();return json(this.leaseView(prior),201);}
  }
  this.admissionAvailable(rate);const role=speaking?'participant':'watcher',all=[...this.leases.values()].filter(l=>l.role===role);
  if(all.length>=(speaking?this.policy.participants:this.policy.watchers)||all.filter(l=>l.ip===ip).length>=(speaking?this.policy.ipParticipants:this.policy.ipWatchers))publicLimited(this.policy.leaseMs);
  const token=this.epoch+'.'+newToken(),lease:Lease={id:crypto.randomUUID(),token,role,ip,nickname,grant,activity:this.clock(),lastRead:-Infinity};
  this.leases.set(token,lease);if(grant)grant.join={requestId,leaseToken:token};rate.admissions.push(this.clock());rate.at=this.clock();return json(this.leaseView(lease),201);
 }
 private leaseView(l:Lease){return {service:serviceMetadata(['sender.nickname']),lease_token:l.token,lease:{id:l.id,role:l.role,epoch:this.epoch,unit:'logical_lease'},sender:l.role==='participant'?{id:l.id,nickname:l.nickname}:undefined};}
 private async send(request:Request,lease:Lease,ip:string):Promise<Response> {
  const rate=this.ipRate(ip),input=await publicBody(request,this.policy,['text','client_message_id']);
  const content=text(input.text,1,this.policy.textBytes),id=text(input.client_message_id,1,128);
  if(utf8Bytes(content)>this.policy.textBytes)fail(413,'MESSAGE_TOO_LARGE','메시지는 최대 UTF-8 2048바이트입니다.');
  this.prune();this.lease(lease.token);const prior=this.ring.find(m=>m.sender.id===lease.id&&m.client_message_id===id);
  if(prior){if(prior.text!==content)fail(409,'IDEMPOTENCY_CONFLICT','같은 메시지 ID로 다른 내용을 보낼 수 없습니다.');lease.activity=this.clock();return json({...prior,service:serviceMetadata(messageFields)});}
  const now=this.clock(),grant=lease.grant!,roomReady=this.sentAt.length>=this.policy.roomMessages?this.sentAt[0]+this.policy.roomWindowMs:now,ready=Math.max(grant.nextSend,rate.nextSend,roomReady);
  if(ready>now)publicLimited(ready-now);
  // No await: all message constraints are checked and recorded in one synchronous section.
  grant.nextSend=now+this.policy.operatorIntervalMs;rate.nextSend=now+this.policy.ipIntervalMs;rate.at=now;this.sentAt.push(now);
  const sequence=++this.sequence,message:PublicMessage={sequence,cursor:this.epoch+':'+sequence,sender:{id:lease.id,nickname:lease.nickname},text:content,client_message_id:id,created_at:new Date(now).toISOString()};
  this.ring.push(message);this.prune();lease.activity=now;this.accepted++;this.maxBufferBytes=Math.max(this.maxBufferBytes,this.bufferBytes());return json({...message,service:serviceMetadata(messageFields)},201);
 }
 private page(after:string|undefined,limit:number):Page {
  const first=this.ring[0]?.sequence??this.sequence+1,earliest=this.epoch+':'+(first-1);let sequence=this.sequence,status:Page['history_status']='ok';
  if(after!==undefined){const match=/^([a-f0-9-]{36}):(0|[1-9][0-9]*)$/.exec(after);if(!match)bad();sequence=Number(match[2]);if(!Number.isSafeInteger(sequence))bad();
   if(match[1]!==this.epoch)status='history_reset';else if(sequence>this.sequence)bad();else if(sequence<first-1)status='history_gap';}
  const initial=after===undefined||status!=='ok';
  const recent=this.ring.filter(m=>this.clock()-Date.parse(m.created_at)<=this.policy.firstWindowMs);
  const rows=initial?recent.slice(-this.policy.firstWindowMessages):this.ring.filter(m=>m.sequence>sequence),messages=rows.slice(0,limit);
  const fallback=initial?(rows[0]?this.epoch+':'+(rows[0].sequence-1):this.epoch+':'+this.sequence):after!;
  return {service:serviceMetadata(pageFields),messages,epoch:this.epoch,cursor:messages.at(-1)?.cursor??fallback,earliest_cursor:earliest,history_status:status,has_more:rows.length>messages.length,
   ...(initial?{initial_window:{max_age_seconds:this.policy.firstWindowMs/1000,max_messages:this.policy.firstWindowMessages,truncated:this.sequence>rows.length}}:{}),
   ...(status!=='ok'?{notice:status==='history_reset'?'메모리 epoch가 변경되어 이전 이력이 소실되었습니다.':'요청 cursor 앞부분이 보관 범위에서 삭제되었습니다.'}:{})};
 }
 private responsePage(lease:Lease,after:string|undefined,limit:number):Response {
  this.prune();this.lease(lease.token);const now=this.clock();if(now-lease.lastRead<this.policy.batchMs)publicLimited(this.policy.batchMs-(now-lease.lastRead));
  const page=this.page(after,limit);let raw=JSON.stringify(page);
  const beforeFirst=page.messages[0]?this.epoch+':'+(page.messages[0].sequence-1):page.cursor;
  while(utf8Bytes(raw)>this.policy.responseBytes&&page.messages.length){page.messages.pop();page.has_more=true;page.cursor=page.messages.at(-1)?.cursor??(page.history_status==='ok'&&after?after:beforeFirst);raw=JSON.stringify(page);}
  const size=utf8Bytes(raw);if(size>this.policy.responseBytes)fail(503,'POLICY_BOUNDS','응답 envelope가 허용된 바이트를 초과합니다.');
  const count=available(this.responses,now,this.policy.responsesPerSecond,this.policy.responseBurst),bytes=available(this.bytes,now,this.policy.bytesPerSecond,this.policy.byteBurst);
  if(count<1||bytes<size)publicLimited(Math.max(count<1?(1-count)*1000/(this.policy.responsesPerSecond||1):0,bytes<size?(size-bytes)*1000/(this.policy.bytesPerSecond||1):0));
  this.responses.tokens--;this.bytes.tokens-=size;lease.lastRead=now;lease.activity=now;this.egressBytes+=size;this.dataResponses++;return new Response(raw,{headers:{'Content-Type':'application/json; charset=utf-8'}});
 }
 private async read(request:Request,lease:Lease,after:string|undefined,limit:number,timeout:number):Promise<Response> {
  if(this.waiters.has(lease.id))fail(409,'WAIT_IN_PROGRESS','이 lease에는 이미 대기 요청이 있습니다.');
  if(this.clock()-lease.lastRead<this.policy.batchMs)publicLimited(this.policy.batchMs-(this.clock()-lease.lastRead));
  if(request.signal.aborted)fail(499,'REQUEST_ABORTED','요청이 취소되었습니다.');if(this.waiters.size>=this.policy.waits)publicLimited();
  let wake!:()=>void;const notification=new Promise<void>(resolve=>{wake=resolve;}),deadline=this.clock()+(timeout>0?Math.min(timeout,this.policy.waitMs):this.policy.batchMs);
  this.waiters.set(lease.id,{wake,lease,after,deadline});this.maxWaits=Math.max(this.maxWaits,this.waiters.size);
  const timer=setTimeout(wake,Math.min(timeout>0?timeout:this.policy.batchMs,this.policy.waitMs));request.signal.addEventListener('abort',wake,{once:true});this.scheduleBatch();
  try{await notification;if(this.stopped){const response=json({error:{code:'ROOM_SHUTDOWN',message:'서버가 종료 중입니다. 다시 연결하세요.'},cursor:after??this.epoch+':'+this.sequence},503);response.headers.set('Retry-After','1');return response;}if(request.signal.aborted)fail(499,'REQUEST_ABORTED','요청이 취소되었습니다.');return this.responsePage(lease,after,limit);}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',wake);this.waiters.delete(lease.id);if(!this.waiters.size){clearTimeout(this.batchTimer);this.batchTimer=undefined;}}
 }
 private scheduleBatch() {
  if(this.stopped||this.batchTimer!==undefined||!this.waiters.size)return;const delay=this.policy.batchMs-this.clock()%this.policy.batchMs;
  this.batchTimer=setTimeout(()=>{this.batchTimer=undefined;this.prune();const now=this.clock();for(const w of this.waiters.values()){const page=this.page(w.after,1);if(now>=w.deadline||page.messages.length||page.history_status!=='ok')w.wake();}this.scheduleBatch();},delay);
 }
 private leaseCounts(){const v=[...this.leases.values()];return {participants:v.filter(l=>l.role==='participant').length,watchers:v.filter(l=>l.role==='watcher').length,unit:'logical_lease' as const};}
 private bufferBytes(){return this.ring.reduce((n,m)=>n+utf8Bytes(JSON.stringify(m)),0);}
 diagnostics(){this.prune();return {epoch:this.epoch,leases:this.leaseCounts(),active_handlers:this.activeHandlers,active_waits:this.waiters.size,max_active_handlers:this.maxHandlers,max_active_waits:this.maxWaits,buffer_bytes:this.bufferBytes(),max_buffer_bytes:this.maxBufferBytes,message_count:this.ring.length,ip_keys:this.ips.size,pending_grants:[...this.grants.values()].filter(g=>!g.join||!this.leases.has(g.join.leaseToken)).length,egress_json_bytes:this.egressBytes,data_responses:this.dataResponses,accepted_messages:this.accepted,rate_rejected:this.rateRejected,batch_timer_active:this.batchTimer!==undefined};}
}
