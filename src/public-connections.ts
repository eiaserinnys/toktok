import {bad,fail,hash,newToken,text,HttpError} from './http';
import {PUBLIC_NOTICE} from './public-contracts';

export interface ConnectionApprovalInput {
 action:'preview'|'approve'|'deny'|'revoke'; request_id:string;
 proof?:string; nonce?:string; checked?:boolean; risk_ack_version?:string;
}
export interface ConnectionApprovalResult {
 status:number; data:Record<string,unknown>; cookie?:string;
}
interface Connection {
 id:string; secretHash:string; nickname:string; clientId:string; expires:number;
 status:'pending'|'approved'|'denied'|'revoked'|'expired'; nextPoll:number;
 grant?:string; owner?:string;
}
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const encoder=new TextEncoder();
const tokenShape=/^[A-Za-z0-9_-]{43}$/;

/** Room-local RAM only. IDs/verification URLs carry no participant or result-retrieval authority. */
export class PublicConnections {
 private readonly requests=new Map<string,Connection>();
 private readonly bySecret=new Map<string,string>();
 private readonly signingKey=crypto.subtle.importKey('raw',crypto.getRandomValues(new Uint8Array(32)),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 constructor(private readonly epoch:string,private readonly origin:string,private readonly clock:()=>number,
  private readonly active:(grant:string)=>boolean,private readonly revoke:(grant:string)=>void){}
 prune(){
  for(const [id,r] of this.requests){
   if(r.expires>this.clock()||(r.grant&&this.active(r.grant)))continue;
   if(r.grant)this.revoke(r.grant);
   this.requests.delete(id);this.bySecret.delete(r.secretHash);
  }
 }
 get size(){return this.requests.size;}
 private view(r:Connection,room:string,agent=false):Record<string,unknown>{
  return {request_id:r.id,epoch:this.epoch,status:r.status,nickname:r.nickname,
   participant_connected:!!r.grant&&this.active(r.grant),expires_at:new Date(r.expires).toISOString(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer',
   verification_uri:this.origin+'/public/'+room+'?connect='+encodeURIComponent(r.id),interval_seconds:5,
   ...(agent&&r.status==='approved'&&r.grant?{operator_grant:r.grant,client_request_id:r.clientId}: {})};
 }
 async create(room:string,input:Record<string,unknown>,ttl:number,capacity:number,onNew:()=>void){
  if(input.notice_version!==PUBLIC_NOTICE||input.visibility!=='public'||input.retention_mode!=='recent_buffer')bad();
  const secret=text(input.request_secret,43,43);if(!tokenShape.test(secret))bad();
  const secretHash=await hash(secret),nickname=text(input.nickname,1,64),clientId=text(input.client_request_id,1,128);
  this.prune();const priorId=this.bySecret.get(secretHash),prior=priorId&&this.requests.get(priorId);
  if(prior){if(prior.nickname!==nickname||prior.clientId!==clientId)fail(409,'CONNECTION_CONFLICT','같은 요청 비밀의 내용을 바꿀 수 없습니다.');return this.view(prior,room,true);}
  if(this.size>=capacity)fail(429,'CONNECTION_LIMITED','대기 중인 연결이 많습니다. 나중에 요청해주세요.');
  onNew();
  const r:Connection={id:this.epoch+'.'+crypto.randomUUID(),secretHash,nickname,clientId,expires:this.clock()+ttl,status:'pending',nextPoll:0};
  this.requests.set(r.id,r);this.bySecret.set(secretHash,r.id);return this.view(r,room);
 }
 private async own(secret:string){
  if(!tokenShape.test(secret))fail(403,'CONNECTION_DENIED','요청 비밀을 확인해주세요.');
  const id=this.bySecret.get(await hash(secret)),r=id&&this.requests.get(id);
  if(!r)fail(410,'CONNECTION_GONE','요청이 만료되었거나 방이 재시작되었습니다.');
  if(r.expires<=this.clock()&&!(r.grant&&this.active(r.grant))){r.status='expired';if(r.grant)this.revoke(r.grant);fail(410,'CONNECTION_GONE','연결 요청이 만료되었습니다.');}
  return r;
 }
 async poll(room:string,secret:string){
  const r=await this.own(secret),now=this.clock();
  if(now<r.nextPoll)throw new HttpError(429,'CONNECTION_POLL_EARLY','5초 이상 기다린 뒤 다시 확인해주세요.',Math.ceil((r.nextPoll-now)/1000));
  r.nextPoll=now+5000;return this.view(r,room,true);
 }
 async cancel(room:string,secret:string){const r=await this.own(secret);if(r.grant)this.revoke(r.grant);r.status='revoked';return this.view(r,room);}
 private get(id:string){
  const r=this.requests.get(id);
  if(!r||r.expires<=this.clock()&&!(r.grant&&this.active(r.grant)))fail(410,'CONNECTION_GONE','요청이 만료되었거나 방이 재시작되었습니다.');
  return r;
 }
 private async sign(value:string){return encode(new Uint8Array(await crypto.subtle.sign('HMAC',await this.signingKey,encoder.encode(value))));}
 private operatorPayload(room:string,secret:string){return 'operator\n'+this.epoch+'\n'+room+'\n'+secret;}
 private async validOperator(room:string,proof:string|undefined){
  try{const [secret,signature,...rest]=(proof??'').split('.');return !rest.length&&tokenShape.test(secret)&&tokenShape.test(signature)&&await crypto.subtle.verify('HMAC',await this.signingKey,decode(signature),encoder.encode(this.operatorPayload(room,secret)));}catch{return false;}
 }
 private approvalPayload(room:string,r:Connection,proof:string){return 'approval\n'+this.epoch+'\n'+room+'\n'+r.id+'\n'+r.expires+'\n'+proof;}
 private async verify(room:string,r:Connection,input:ConnectionApprovalInput){
  if(!await this.validOperator(room,input.proof)||!tokenShape.test(input.nonce??''))fail(403,'OPERATOR_ACK_REQUIRED','이 방의 확인 화면을 다시 열어주세요.');
  if(!await crypto.subtle.verify('HMAC',await this.signingKey,decode(input.nonce!),encoder.encode(this.approvalPayload(room,r,input.proof!))))fail(403,'OPERATOR_ACK_REQUIRED','이 요청의 확인 화면을 다시 열어주세요.');
 }
 async approval(room:string,input:ConnectionApprovalInput,activate:(expires:number)=>string):Promise<ConnectionApprovalResult>{
  const r=this.get(input.request_id);
  if(input.action==='preview'){
   // One room/epoch-scoped browser credential supports separately bound request nonces.
   // It carries no participant authority and is never returned in the JSON projection.
   if(r.owner&&input.proof!==r.owner)fail(403,'CONNECTION_OWNED','이 요청을 확인한 브라우저에서 열어주세요.');
   let proof=input.proof;
   if(!await this.validOperator(room,proof)){const secret=newToken();proof=secret+'.'+await this.sign(this.operatorPayload(room,secret));}
   const nonce=await this.sign(this.approvalPayload(room,r,proof!));
   this.get(r.id);
   return {status:200,data:{...this.view(r,room),nonce},...(proof!==input.proof?{cookie:proof}: {})};
  }
  await this.verify(room,r,input);this.get(r.id);
  if(r.owner&&input.proof!==r.owner)fail(403,'CONNECTION_OWNED','이 요청을 확인한 브라우저가 아닙니다.');
  if(input.action==='revoke'){
   if(!r.owner)fail(403,'OPERATOR_ACK_REQUIRED','확인한 연결만 철회할 수 있습니다.');
   if(r.grant)this.revoke(r.grant);r.status='revoked';return {status:200,data:this.view(r,room)};
  }
  if(r.expires<=this.clock())fail(410,'CONNECTION_GONE','확인 시간이 만료되었습니다.');
  if(!['approve','deny'].includes(input.action))bad();
  if(input.action==='approve'&&(input.checked!==true||input.risk_ack_version!==PUBLIC_NOTICE))fail(403,'OPERATOR_ACK_REQUIRED','공개 위험 안내를 직접 확인해주세요.');
  if(r.status==='pending'){
   if(input.action==='deny')r.status='denied';
   else {r.grant=activate(r.expires);r.status='approved';}
   r.owner=input.proof;
  }
  return {status:200,data:this.view(r,room)};
 }
 async validateJoin(grant:string,secret:unknown,clientId:string,nickname:string){
  const r=[...this.requests.values()].find(r=>r.grant===grant);if(!r)return;
  if(r.status!=='approved'||typeof secret!=='string'||await hash(secret)!==r.secretHash||clientId!==r.clientId||nickname!==r.nickname)
   fail(403,'CONNECTION_DENIED','승인받은 연결 요청과 참가 요청이 다릅니다.');
 }
}
