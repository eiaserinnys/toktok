import {bad,fail,hash,newToken,HttpError} from './http';
import {PUBLIC_NOTICE} from './public-contracts';
import {RecordCollection as C,type RepositoryPort,type RecordTransaction,type RecordValue} from './storage/repository';
import type {ConnectionApprovalInput,ConnectionApprovalResult} from './public-connections';
export const PUBLIC_ENTRY_NOTICE='toktok-entry-30d-v1';
export const PUBLIC_ENTRY_MS=30*24*60*60*1000;
export const PUBLIC_ENTRY_LIMIT=1000;
// Includes the bounded record/index updates and its eventual cleanup. No duration keepalive.
export const PUBLIC_ENTRY_WRITE_BYTES=8192;
type Entry={id:string;generation:string;secretHash:string;grantHash:string;nickname:string;clientId:string;senderId:string;confirmUntil:number;expires:number;status:'pending'|'approved'|'denied'|'revoked';nextSend:number;ownerHash:string|null;nonceHash:string|null;proofHash:string|null;nonceUntil:number};
type Meta={count:number;generation:string;sweep:string|null};
const shape=/^[A-Za-z0-9_-]{43}$/;
const record=(v:object)=>v as unknown as RecordValue;
const expiryKey=(r:Entry)=>'e:'+String(r.expires).padStart(16,'0')+':'+r.id;
/** Durable authority only. Every stored credential is a one-way hash; leases stay volatile. */
export class PublicEntries {
 private count=0;private polls=new Map<string,number>();
 constructor(private readonly repo:RepositoryPort,private readonly room:string,private readonly generation:()=>string|undefined,private readonly origin:string,private readonly clock:()=>number,private readonly active:(id:string)=>boolean,private readonly revoke:(id:string)=>void,private readonly idleSeconds:()=>number=()=>300){}
 get size(){return this.count;}
 private gen(){const value=this.generation();if(!value)fail(503,'ENTRY_UNAVAILABLE','공개방 입장권 세대를 확인하지 못했습니다.');return value;}
 private tx<T>(fn:(tx:RecordTransaction)=>Promise<T>){return this.repo.transaction('public:'+this.room,fn);}
 private async meta(tx:RecordTransaction):Promise<Meta>{const r=await tx.get(C.public_entries,'meta');if(!r)return {count:0,generation:this.generation()??'',sweep:null};if(!Number.isSafeInteger(r.count)||Number(r.count)<0||Number(r.count)>PUBLIC_ENTRY_LIMIT||typeof r.generation!=='string'||!(r.sweep===null||typeof r.sweep==='string'))fail(503,'ENTRY_STATE_INVALID','입장권 상태를 확인하지 못했습니다.');return r as unknown as Meta;}
 private async get(tx:RecordTransaction,id:string,live=true):Promise<Entry>{const r=await tx.get(C.public_entries,'r:'+id) as unknown as Entry|undefined;if(!r||r.generation!==this.gen()||(live&&r.expires<=this.clock()))fail(410,'CONNECTION_GONE','연결 요청 또는 입장권이 만료되었습니다.');return r;}
 private async save(tx:RecordTransaction,r:Entry,oldExpiry?:number){if(new TextEncoder().encode(JSON.stringify(r)).length>2048)fail(503,'ENTRY_STATE_INVALID','입장권 크기 한도를 넘었습니다.');if(oldExpiry!==undefined&&oldExpiry!==r.expires)await tx.delete(C.public_entries,expiryKey({...r,expires:oldExpiry}));await tx.put(C.public_entries,'r:'+r.id,record(r));await tx.put(C.public_entries,expiryKey(r),{id:r.id});}
 private async token(id:string,secret:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('toktok-public-entry-v1\n'+this.room+'\n'+id+'\n'+secret));const value=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');return 'p3.'+id+'.'+value;}
 private view(r:Entry){return {request_id:r.id,epoch:r.generation,status:r.status,nickname:r.nickname,participant_connected:r.status==='approved'&&this.active(r.id),expires_at:new Date(r.expires).toISOString(),confirmation_expires_at:new Date(r.confirmUntil).toISOString(),entry_expires_at:r.status==='approved'?new Date(r.expires).toISOString():null,entry_notice_version:PUBLIC_ENTRY_NOTICE,entry_duration_seconds:PUBLIC_ENTRY_MS/1000,lease_idle_seconds:this.idleSeconds(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer',verification_uri:this.origin+'/public/'+this.room+'?connect='+encodeURIComponent(r.id),interval_seconds:5};}
 async create(input:Record<string,unknown>,ttl:number,capacity:number,onNew:()=>void){
  if(input.notice_version!==PUBLIC_NOTICE||input.visibility!=='public'||input.retention_mode!=='recent_buffer'||typeof input.request_secret!=='string'||!shape.test(input.request_secret))bad();
  const secret=input.request_secret,secretHash=await hash(secret);if(typeof input.nickname!=='string'||Array.from(input.nickname).length<1||Array.from(input.nickname).length>64||typeof input.client_request_id!=='string'||input.client_request_id.length<1||input.client_request_id.length>128)bad();
  const id=crypto.randomUUID(),token=await this.token(id,secret),grantHash=await hash(token),now=this.clock();
  return this.tx(async tx=>{const index=await tx.get(C.public_entries,'s:'+secretHash);if(index){const old=await this.get(tx,String(index.id));if(old.nickname!==input.nickname||old.clientId!==input.client_request_id)fail(409,'CONNECTION_CONFLICT','같은 요청 비밀의 내용을 바꿀 수 없습니다.');return {...this.view(old),...(old.status==='approved'?{operator_grant:await this.token(old.id,secret),client_request_id:old.clientId}:{})};}
   const m=await this.meta(tx);if(m.count>=Math.min(PUBLIC_ENTRY_LIMIT,capacity))fail(429,'CONNECTION_LIMITED','입장권 수용량에 도달했습니다. 만료나 철회 후 다시 요청하세요.');onNew();
   const r:Entry={id,generation:this.gen(),secretHash,grantHash,nickname:input.nickname as string,clientId:input.client_request_id as string,senderId:crypto.randomUUID(),confirmUntil:now+Math.min(ttl,300000),expires:now+Math.min(ttl,300000),status:'pending',nextSend:0,ownerHash:null,nonceHash:null,proofHash:null,nonceUntil:0};
   await this.save(tx,r);await tx.put(C.public_entries,'s:'+secretHash,{id});m.count++;this.count=m.count;await tx.put(C.public_entries,'meta',record(m));return this.view(r);
  });
 }
 private async own(tx:RecordTransaction,secret:string){if(!shape.test(secret))fail(403,'CONNECTION_DENIED','요청 비밀을 확인해주세요.');const i=await tx.get(C.public_entries,'s:'+await hash(secret));if(!i)fail(410,'CONNECTION_GONE','요청이 만료되었습니다.');return this.get(tx,String(i.id));}
 async poll(secret:string){return this.tx(async tx=>{const r=await this.own(tx,secret),now=this.clock(),next=this.polls.get(r.id)??0;if(now<next)throw new HttpError(429,'CONNECTION_POLL_EARLY','5초 이상 기다린 뒤 다시 확인해주세요.',Math.ceil((next-now)/1000));this.polls.set(r.id,now+5000);return {...this.view(r),...(r.status==='approved'?{operator_grant:await this.token(r.id,secret),client_request_id:r.clientId}:{})};});}
 async cancel(secret:string){const result=await this.tx(async tx=>{const r=await this.own(tx,secret);await this.close(tx,r,'revoked');return {id:r.id,data:this.view(r)};});this.revoke(result.id);return result.data;}
 private async close(tx:RecordTransaction,r:Entry,status:'denied'|'revoked'){if(r.status===status)return;const old=r.expires;r.status=status;r.expires=Math.min(r.expires,this.clock()+300000);await this.save(tx,r,old);}
 async approval(input:ConnectionApprovalInput,onApprove:()=>void):Promise<ConnectionApprovalResult>{
  const result=await this.tx(async tx=>{const r=await this.get(tx,input.request_id),now=this.clock();
   const proof=input.proof&&shape.test(input.proof)?input.proof:undefined,proofHash=proof?await hash(proof):null;
   if(r.ownerHash&&proofHash!==r.ownerHash)fail(403,'CONNECTION_OWNED','이 요청을 확인한 브라우저에서 열어주세요.');
   if(input.action==='preview'){
    const cookie=proof??newToken(),nonce=newToken();r.proofHash=await hash(cookie);r.nonceHash=await hash(nonce);r.nonceUntil=Math.min(r.expires,now+300000);await this.save(tx,r);
    return {status:200,data:{...this.view(r),nonce},...(!proof?{cookie}:{})};
   }
   if(!proofHash||proofHash!==r.proofHash||typeof input.nonce!=='string'||!shape.test(input.nonce)||await hash(input.nonce)!==r.nonceHash||now>=r.nonceUntil)fail(403,'OPERATOR_ACK_REQUIRED','이 요청의 확인 화면을 다시 열어주세요.');
   if(input.action==='revoke'){if(!r.ownerHash)fail(403,'OPERATOR_ACK_REQUIRED','확인한 입장권만 철회할 수 있습니다.');await this.close(tx,r,'revoked');}
   else {
    if(!['approve','deny'].includes(input.action))bad();
    if(input.action==='approve'&&(input.checked!==true||input.risk_ack_version!==PUBLIC_NOTICE||input.entry_notice_version!==PUBLIC_ENTRY_NOTICE))fail(403,'OPERATOR_ACK_REQUIRED','30일 입장권과 공개 위험 안내를 직접 확인해주세요.');
    if(r.status==='pending'){
     if(now>=r.confirmUntil)fail(410,'CONNECTION_GONE','확인 시간이 만료되었습니다.');r.ownerHash=proofHash;
     if(input.action==='deny')await this.close(tx,r,'denied');else {onApprove();const old=r.expires;r.status='approved';r.expires=now+PUBLIC_ENTRY_MS;await this.save(tx,r,old);}
    }
   }
   return {status:200,data:this.view(r),...(input.action==='approve'&&r.status==='approved'?{cookie:proof!}:{})};
  });
  if(result.data.status==='revoked'||result.data.status==='denied')this.revoke(input.request_id);return result;
 }
 async validateJoin(token:string,secret:unknown,clientId:string,nickname:string){
  const match=/^p3\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);if(!match||typeof secret!=='string'||!shape.test(secret))fail(403,'CONNECTION_DENIED','승인된 요청 비밀과 입장권이 필요합니다.');
  return this.tx(async tx=>{const r=await this.get(tx,match[1]);if(r.status!=='approved'||await hash(secret)!==r.secretHash||await hash(token)!==r.grantHash||clientId!==r.clientId||nickname!==r.nickname)fail(403,'CONNECTION_DENIED','승인받은 연결 요청과 참가 요청이 다릅니다.');return {id:r.id,generation:r.generation,expires:r.expires,nextSend:r.nextSend,senderId:r.senderId};});
 }
 async check(tx:RecordTransaction,id:string){const r=await this.get(tx,id);if(r.status!=='approved')fail(403,'CONNECTION_DENIED','입장권이 철회되었습니다.');return r;}
 async commitSend(tx:RecordTransaction,id:string,nextSend:number){const r=await this.check(tx,id);r.nextSend=nextSend;await this.save(tx,r);}
 async cleanup(){return this.tx(async tx=>{const m=await this.meta(tx),generation=this.generation()??'';if(m.generation!==generation){m.generation=generation;m.sweep='';}
  const remove=async(r:Entry)=>{await tx.delete(C.public_entries,'r:'+r.id);await tx.delete(C.public_entries,'s:'+r.secretHash);await tx.delete(C.public_entries,expiryKey(r));m.count--;this.polls.delete(r.id);this.revoke(r.id);};
  let changed=m.sweep!==null;
  if(m.sweep!==null){const rows=await tx.list(C.public_entries,{prefix:'r:',limit:100,...(m.sweep?{after:m.sweep}:{})});for(const row of rows){const r=row.value as unknown as Entry;if(r.generation!==generation)await remove(r);}m.sweep=rows.length===100?rows[rows.length-1].key:null;}
  else {for(const row of await tx.list(C.public_entries,{prefix:'e:',limit:100})){const r=await tx.get(C.public_entries,'r:'+row.value.id) as unknown as Entry|undefined;if(!r)fail(503,'ENTRY_STATE_INVALID','입장권 인덱스 오류입니다.');if(r.expires>this.clock())break;await remove(r);changed=true;}}
  this.count=m.count;if(changed)await tx.put(C.public_entries,'meta',record(m));
  const first=(await tx.list(C.public_entries,{prefix:'e:',limit:1}))[0];return {count:m.count,next:m.sweep!==null?this.clock()+1000:first?Math.max(this.clock()+1,Number(first.key.split(':')[1])):null};
 });}
}
