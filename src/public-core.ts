import {historyQuery,boundHistoryPage} from './history-page';
import {RecentBuffer,type RecentState} from './recent-buffer';
import {RoomQueue} from './runtime/room-queue';
import type {RepositoryPort} from './storage/repository';
import {PublicConnections,type ConnectionApprovalInput,type ConnectionApprovalResult} from './public-connections';
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
interface Page {service:ReturnType<typeof serviceMetadata>;messages:PublicMessage[];epoch:string;cursor:string;earliest_cursor:string;history_status:'ok'|'history_gap'|'history_reset';has_more:boolean;has_older:boolean;before_cursor:string;latest_cursor:string;initial_window?:{max_messages:number;truncated:boolean};notice?:string;}
export interface PublicRoomOptions {origin:string;catalog:()=>ReadonlyArray<{slug:string;title:string}>;policy:()=>PublicPolicy;clock?:()=>number;budget?:PrivateBudgetPort;repo?:RepositoryPort;scheduleCleanup?:(at:number|null)=>Promise<void>;}
export class PublicRoomCore {
 private readonly epoch=crypto.randomUUID();
 private stopped=false;private revision=0;
 private catalog:ReadonlyArray<{slug:string;title:string}>;
 private readonly origin:string;private readonly budget:CoreBudget;
 constructor(private readonly options:PublicRoomOptions){this.origin=options.origin;this.connections=new PublicConnections(this.epoch,this.origin,()=>this.clock(),token=>{const g=this.grants.get(token);return !!g?.join&&this.leases.has(g.join.leaseToken);},token=>this.revokeGrant(token));this.catalog=validatePublicCatalog(options.catalog());this.policy=validatePublicPolicy(options.policy());this.clock=options.clock??(()=>Date.now());this.budget=new CoreBudget(options.budget,this.clock);for(const bucket of [this.requests,this.responses,this.bytes])bucket.at=this.clock();}
 configure(revision:number,policy:PublicPolicy,catalog:ReadonlyArray<{slug:string;title:string}>):void {if(!Number.isSafeInteger(revision)||revision<=this.revision)throw new Error('SETTINGS_REVISION');const next=validatePublicPolicy(policy),rooms=validatePublicCatalog(catalog);this.policy=next;this.catalog=rooms;this.revision=revision;this.historyLoaded=false;this.prune();}
 shutdown():void {this.stopped=true;clearTimeout(this.batchTimer);this.batchTimer=undefined;for(const waiter of this.waiters.values())waiter.wake();}
 private slug?:string;
 private policy:PublicPolicy={...PUBLIC_POLICY};
 private clock=()=>Date.now();
 private sequence=0;
 private historyEpoch:string=this.epoch;private historyState?:RecentState;private historyLoaded=false;private readonly queue=new RoomQueue();
 private history(){if(!this.options.repo)fail(503,'BUFFER_UNCONFIGURED','최근 기록 저장소가 준비되지 않았습니다.');return new RecentBuffer(this.options.repo,'public:'+this.slug!);}
 private historyBounds(){return {messages:this.policy.messages,retentionMs:this.policy.retentionMs,expiresAt:null};}
 private applyHistory(s:RecentState){this.historyState=s;this.historyEpoch=s.epoch;this.sequence=s.sequence;}
 private async openHistory(){if(this.historyLoaded)return;await this.history().initialize();const cleaned=await this.history().cleanup(this.historyBounds(),this.clock());this.applyHistory(cleaned.state);this.historyLoaded=true;await this.options.scheduleCleanup?.(cleaned.next);}
 async maintenance(slug:string){if(!/^[a-z0-9-]{1,64}$/.test(slug)||this.slug&&this.slug!==slug)fail(403,'ROOM_MISMATCH','방이 다릅니다.');this.slug=slug;await this.openHistory();return this.queue.run(async()=>{const result=await this.history().cleanup(this.historyBounds(),this.clock());this.applyHistory(result.state);await this.options.scheduleCleanup?.(result.next);return {next_maintenance_at:result.next};});}
 private grants=new Map<string,Grant>();
 private connections:PublicConnections;
 private revokeGrant(token:string){const grant=this.grants.get(token);if(grant?.join){const lease=this.leases.get(grant.join.leaseToken);if(lease){this.leases.delete(lease.token);this.waiters.get(lease.id)?.wake();}}this.grants.delete(token);}
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
  const now=this.clock();
  for(const [token,l] of this.leases)if(now-l.activity>=this.policy.leaseMs){this.leases.delete(token);this.waiters.get(l.id)?.wake();}
  this.connections.prune();
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
   this.prune();this.bind(ack.room,true);await this.openHistory();this.requestAdmission();
   if(ack.checked!==true||ack.risk_ack_version!==PUBLIC_NOTICE)fail(403,'OPERATOR_ACK_REQUIRED','검증된 안내 확인이 필요합니다.');
   const operation=await this.budget.admit();
   const rate=this.ipRate(ack.trustedIpHash);this.ipRequest(rate);this.admissionAvailable(rate);
   if([...this.grants.values()].filter(g=>!g.join||!this.leases.has(g.join.leaseToken)).length+this.connections.size>=this.policy.pendingGrants)publicLimited(this.policy.grantMs);
   const token=this.epoch+'.'+newToken(),expires=this.clock()+this.policy.grantMs;
   this.grants.set(token,{expires,nextSend:0});rate.admissions.push(this.clock());rate.at=this.clock();
   const data={operator_grant:token,epoch:this.epoch,expires_at:new Date(expires).toISOString(),notice_version:PUBLIC_NOTICE};await this.budget.reserve(operation,'response_bytes',utf8Bytes(JSON.stringify(data)));return {status:201,data,retry_after_ms:undefined as number|undefined};
  });}catch(error){const response=publicError(error),data=await response.json() as PublicGrantResult['data'];return {status:response.status,data,retry_after_ms:'error' in data?data.error.retry_after_ms:undefined};}
 }
 async connectionApproval(input:ConnectionApprovalInput,trustedIpHash:string,room:string):Promise<ConnectionApprovalResult> {
  try{return await this.handler(async()=>{
   this.prune();this.bind(room,true);await this.openHistory();this.requestAdmission();const operation=await this.budget.admit();
   const rate=this.ipRate(trustedIpHash);this.ipRequest(rate);
   const result=await this.connections.approval(room,input,expires=>{
    this.admissionAvailable(rate);
    const token=this.epoch+'.'+newToken();this.grants.set(token,{expires,nextSend:0});rate.admissions.push(this.clock());rate.at=this.clock();return token;
   });
   await this.budget.reserve(operation,'response_bytes',utf8Bytes(JSON.stringify(result.data)));return result;
  });}catch(error){const response=publicError(error);return {status:response.status,data:await response.json() as Record<string,unknown>};}
 }
 async fetch(request:Request):Promise<Response> {
  try{return await this.handler(async()=>{const cleanup=request.method==='DELETE'&&/\/(lease|connection-request)$/.test(new URL(request.url).pathname);const operation=cleanup?undefined:await this.budget.admit();const response=await this.dispatch(request,operation);return operation?this.budget.respond(response,operation):response;});}catch(error){return publicError(error);}finally{cancelUnusedRequestBody(request);}
 }
 private async dispatch(request:Request,operation?:import('./runtime/budget').ReservationContext):Promise<Response> {
  try{return await (async()=>{
   this.prune();const url=new URL(request.url),match=/^\/api\/public\/rooms\/([a-z0-9-]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
   if(!match)fail(404,'NOT_FOUND','경로가 없습니다.');this.bind(match[1]);await this.openHistory();
   const action=publicAction(match[2]??'',request.method);if(!action)fail(404,'NOT_FOUND','경로가 없습니다.');this.requestAdmission();
   const ip=request.headers.get(INTERNAL_IP_HEADER)??'';if(!/^[a-f0-9]{64}$/.test(ip))fail(403,'TRUSTED_IP_REQUIRED','내부 IP 전달 계약이 필요합니다.');
   if((action==='participants'||action==='watchers'||action==='connection-create')&&!this.catalog.some(r=>r.slug===this.slug))fail(404,'NOT_FOUND','공개방이 비활성화되었습니다.');
   if(action==='guide')return new Response(publicGuide(this.slug!,this.origin,this.catalog.find(r=>r.slug===this.slug)?.title,this.policy),{headers:{'Content-Type':'text/markdown; charset=utf-8'}});
   if(action==='connection-create'){
    const rate=this.ipRate(ip);this.ipRequest(rate);
    const input=await publicBody(request,this.policy,['request_secret','client_request_id','nickname','notice_version','visibility','retention_mode']);
    return json(await this.connections.create(this.slug!,input,this.policy.grantMs,this.policy.pendingGrants-[...this.grants.values()].filter(g=>!g.join||!this.leases.has(g.join.leaseToken)).length,()=>{this.admissionAvailable(rate);rate.admissions.push(this.clock());rate.at=this.clock();}),201);
   }
   if(action==='connection-status'||action==='connection-cancel'){
    const rate=this.ipRate(ip);this.ipRequest(rate);const secret=bearer(request);
    return json(action==='connection-status'?await this.connections.poll(this.slug!,secret):await this.connections.cancel(this.slug!,secret));
   }
   if(action==='participants'||action==='watchers')return this.join(request,ip,action==='participants');
   const lease=this.lease(bearer(request));
   // Existing read/leave stays usable when the rate map is full; never allocate a new IP key here.
   const knownIp=this.ips.get(ip);if(knownIp)this.ipRequest(knownIp);
   if(action==='leave'){this.leases.delete(lease.token);this.waiters.get(lease.id)?.wake();return new Response(null,{status:204});}
   if(action==='metadata'){lease.activity=this.clock();return json({service:serviceMetadata(['title']),slug:this.slug,title:this.catalog.find(r=>r.slug===this.slug)?.title,epoch:this.historyEpoch,connection_epoch:this.epoch,leases:this.leaseCounts(),visibility:'public',retention_mode:'recent_buffer',notice_version:PUBLIC_NOTICE,storage_policy_started_at:new Date(this.historyState!.created_at).toISOString(),recent_buffer:{max_messages:this.policy.messages,max_bytes:2097152,max_age_seconds:this.policy.retentionMs/1000}});}
   if(action==='send'){if(lease.role!=='participant')fail(403,'CAPABILITY_DENIED','발언 권한이 없습니다.');return this.send(request,lease,ip,operation!);}
   const {after,before}=historyQuery(url,action==='wait'),limit=queryInt(url,'limit',this.policy.pageSize,1,this.policy.pageSize);
   await this.page(after,limit,before);return this.read(request,lease,after,limit,action==='wait'?queryInt(url,'timeout',25,0,25)*1000:0,before);
  })();}catch(error){if((error as {status?:number})?.status===429)this.rateRejected++;return publicError(error);}
 }
 private lease(token:string):Lease {
  if(token.split('.')[0]!==this.epoch)fail(409,'LEASE_EPOCH_RESET','방이 재시작되었습니다. 다시 입장하세요.');
  const lease=this.leases.get(token);if(!lease)fail(403,'CAPABILITY_DENIED','입장 lease가 없거나 만료되었습니다.');return lease;
 }
 private async join(request:Request,ip:string,speaking:boolean):Promise<Response> {
  const rate=this.ipRate(ip);this.ipRequest(rate);this.admissionAvailable(rate);
  const input=await publicBody(request,this.policy,speaking?['operator_grant','request_secret','client_request_id','nickname','notice_version','visibility','retention_mode']:['notice_version']);
  this.prune();this.bind(this.slug!,true);if(input.notice_version!==PUBLIC_NOTICE)bad();let grant:Grant|undefined,requestId='',nickname='';
  if(speaking){
   if(input.visibility!=='public'||input.retention_mode!=='recent_buffer')bad();
   const token=text(input.operator_grant,1,128);requestId=text(input.client_request_id,1,128);nickname=text(input.nickname,1,64);
   await this.connections.validateJoin(token,input.request_secret,requestId,nickname);
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
 private async send(request:Request,lease:Lease,ip:string,operation:import('./runtime/budget').ReservationContext):Promise<Response> {
  const input=await publicBody(request,this.policy,['text','client_message_id']),content=text(input.text,1,this.policy.textBytes),id=text(input.client_message_id,1,128);
  if(utf8Bytes(content)>this.policy.textBytes)fail(413,'MESSAGE_TOO_LARGE','메시지 크기 한도를 초과했습니다.');
  return this.queue.run(async()=>{
   this.prune();this.lease(lease.token);const rate=this.ipRate(ip),now=this.clock(),grant=lease.grant!;
   const value={sender:{id:lease.id,nickname:lease.nickname},text:content,client_message_id:id};
   const prior=await this.history().lookup(value,this.historyBounds(),now);if(prior){lease.activity=now;return json({...prior,service:serviceMetadata(messageFields)});}
   const roomReady=this.sentAt.length>=this.policy.roomMessages?this.sentAt[0]+this.policy.roomWindowMs:now,ready=Math.max(grant.nextSend,rate.nextSend,roomReady);if(ready>now)publicLimited(ready-now);
   await this.budget.reserve(operation,'persistent_write_bytes',utf8Bytes(JSON.stringify(value))+1024);this.lease(lease.token);
   if(!this.historyState?.count)await this.options.scheduleCleanup?.(now+this.policy.retentionMs);
   const result=await this.history().append(value,this.historyBounds(),now);this.applyHistory(result.state);const cleanup=await this.history().cleanup(this.historyBounds(),now);await this.options.scheduleCleanup?.(cleanup.next);
   if(!result.replayed){grant.nextSend=now+this.policy.operatorIntervalMs;rate.nextSend=now+this.policy.ipIntervalMs;rate.at=now;this.sentAt.push(now);this.accepted++;}
   lease.activity=now;this.maxBufferBytes=Math.max(this.maxBufferBytes,this.bufferBytes());return json({...result.message,service:serviceMetadata(messageFields)},result.replayed?200:201);
  });
 }
 private async page(after:string|undefined,limit:number,before?:string):Promise<Page> {
  const result=await this.history().read(this.historyBounds(),this.clock(),after,limit,{ms:this.policy.firstWindowMs,messages:this.policy.firstWindowMessages},before);const {state,...page}=result;this.applyHistory(state);
  return {...page,service:serviceMetadata(pageFields),...(page.history_status!=='ok'?{notice:page.history_status==='history_reset'?'이전 cursor와 기록 세대가 다릅니다. 최근 기록으로 이어집니다.':'요청 cursor 앞부분이 최근 보관 범위를 벗어났습니다.'}:{})};
 }
 private async responsePage(lease:Lease,after:string|undefined,limit:number,before?:string):Promise<Response> {
  this.prune();this.lease(lease.token);const now=this.clock();if(now-lease.lastRead<this.policy.batchMs)publicLimited(this.policy.batchMs-(now-lease.lastRead));
  const page=await this.page(after,limit,before);const raw=boundHistoryPage(page,this.policy.responseBytes,after===undefined||page.history_status!=='ok'),size=utf8Bytes(raw);
  const count=available(this.responses,now,this.policy.responsesPerSecond,this.policy.responseBurst),bytes=available(this.bytes,now,this.policy.bytesPerSecond,this.policy.byteBurst);
  if(count<1||bytes<size)publicLimited(Math.max(count<1?(1-count)*1000/(this.policy.responsesPerSecond||1):0,bytes<size?(size-bytes)*1000/(this.policy.bytesPerSecond||1):0));
  this.responses.tokens--;this.bytes.tokens-=size;lease.lastRead=now;lease.activity=now;this.egressBytes+=size;this.dataResponses++;return new Response(raw,{headers:{'Content-Type':'application/json; charset=utf-8'}});
 }
 private async read(request:Request,lease:Lease,after:string|undefined,limit:number,timeout:number,before?:string):Promise<Response> {
  if(this.waiters.has(lease.id))fail(409,'WAIT_IN_PROGRESS','이 lease에는 이미 대기 요청이 있습니다.');
  if(this.clock()-lease.lastRead<this.policy.batchMs)publicLimited(this.policy.batchMs-(this.clock()-lease.lastRead));
  if(request.signal.aborted)fail(499,'REQUEST_ABORTED','요청이 취소되었습니다.');if(this.waiters.size>=this.policy.waits)publicLimited();
  let wake!:()=>void;const notification=new Promise<void>(resolve=>{wake=resolve;}),deadline=this.clock()+(timeout>0?Math.min(timeout,this.policy.waitMs):this.policy.batchMs);
  this.waiters.set(lease.id,{wake,lease,after,deadline});this.maxWaits=Math.max(this.maxWaits,this.waiters.size);
  const timer=setTimeout(wake,Math.min(timeout>0?timeout:this.policy.batchMs,this.policy.waitMs));request.signal.addEventListener('abort',wake,{once:true});this.scheduleBatch();
  try{await notification;if(this.stopped){const response=json({error:{code:'ROOM_SHUTDOWN',message:'서버가 종료 중입니다. 다시 연결하세요.'},cursor:after??this.historyEpoch+':'+this.sequence},503);response.headers.set('Retry-After','1');return response;}if(request.signal.aborted)fail(499,'REQUEST_ABORTED','요청이 취소되었습니다.');return await this.responsePage(lease,after,limit,before);}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',wake);this.waiters.delete(lease.id);if(!this.waiters.size){clearTimeout(this.batchTimer);this.batchTimer=undefined;}}
 }
 private scheduleBatch() {
  if(this.stopped||this.batchTimer!==undefined||!this.waiters.size)return;const delay=this.policy.batchMs-this.clock()%this.policy.batchMs;
  this.batchTimer=setTimeout(()=>{this.batchTimer=undefined;this.prune();const now=this.clock();for(const w of this.waiters.values()){const [epoch,sequence]=(w.after??'').split(':');if(now>=w.deadline||epoch!==this.historyEpoch||this.sequence>Number(sequence||0))w.wake();}this.scheduleBatch();},delay);
 }
 private leaseCounts(){const v=[...this.leases.values()];return {participants:v.filter(l=>l.role==='participant').length,watchers:v.filter(l=>l.role==='watcher').length,unit:'logical_lease' as const};}
 private bufferBytes(){return this.historyState?.bytes??0;}
 diagnostics(){this.prune();return {epoch:this.historyEpoch,leases:this.leaseCounts(),active_handlers:this.activeHandlers,active_waits:this.waiters.size,max_active_handlers:this.maxHandlers,max_active_waits:this.maxWaits,buffer_bytes:this.bufferBytes(),max_buffer_bytes:this.maxBufferBytes,message_count:this.historyState?.count??0,ip_keys:this.ips.size,pending_grants:this.connections.size+[...this.grants.values()].filter(g=>!g.join||!this.leases.has(g.join.leaseToken)).length,egress_json_bytes:this.egressBytes,data_responses:this.dataResponses,accepted_messages:this.accepted,rate_rejected:this.rateRejected,batch_timer_active:this.batchTimer!==undefined};}
}
