import {historyRange,historyPage} from './history-page';
import {RecordCollection as C,type RepositoryPort,type RecordTransaction,type RecordValue} from './storage/repository';
import {fail,hash} from './http';

export const RECENT_NOTICE='toktok-risk-v2' as const;
export const RECENT_BUFFER_MAX_MESSAGES=500;
export const RECENT_BUFFER_MAX_BYTES=2*1024*1024;
export const RECENT_BUFFER_MAX_AGE_MS=3600000;
export interface RecentBounds {messages:number;retentionMs:number;expiresAt:number|null;}
export interface RecentInput {sender:{id:string;nickname:string};text:string;client_message_id:string;reply_to?:number|null;}
export interface RecentMessage extends RecentInput {sequence:number;cursor:string;created_at:string;}
export interface RecentState {notice_version:typeof RECENT_NOTICE;created_at:number;epoch:string;sequence:number;first:number;count:number;bytes:number;}
interface Stored extends RecentMessage {dedupe_key:string;input_digest:string;encoded_bytes:number;}
const record=(v:object)=>JSON.parse(JSON.stringify(v)) as RecordValue;
export const recentMessageKey=(sequence:number)=>'m:'+String(sequence).padStart(16,'0');
const visible=(row:Stored):RecentMessage=>{const {dedupe_key:_d,input_digest:_i,encoded_bytes:_b,...message}=row;return message;};
function valid(bounds:RecentBounds){if(!Number.isSafeInteger(bounds.messages)||bounds.messages<1||bounds.messages>RECENT_BUFFER_MAX_MESSAGES||!Number.isSafeInteger(bounds.retentionMs)||bounds.retentionMs<1||bounds.retentionMs>RECENT_BUFFER_MAX_AGE_MS||(bounds.expiresAt!==null&&!Number.isSafeInteger(bounds.expiresAt)))fail(503,'BUFFER_POLICY_INVALID','최근 보관 정책을 확인하지 못했습니다.');}

/** The same bounded, transactional recent-message buffer on CF SQLite, Node SQLite and PG.
 * It stores history, not human approval, grants, request secrets or participant leases. */
export class RecentBuffer {
 constructor(private readonly repo:RepositoryPort,readonly scope:string){}
 private async state(tx:RecordTransaction):Promise<RecentState>{const row=await tx.get(C.recent_buffers,'buffer');if(!row||row.notice_version!==RECENT_NOTICE||typeof row.epoch!=='string'||!Number.isSafeInteger(row.created_at)||!Number.isSafeInteger(row.sequence)||!Number.isSafeInteger(row.first)||!Number.isSafeInteger(row.count)||!Number.isSafeInteger(row.bytes)||Number(row.count)<0||Number(row.count)>500||Number(row.bytes)<0||Number(row.bytes)>RECENT_BUFFER_MAX_BYTES)fail(503,'BUFFER_STATE_INVALID','최근 기록 상태를 확인하지 못했습니다.');return row as unknown as RecentState;}
 private save(tx:RecordTransaction,state:RecentState){return tx.put(C.recent_buffers,'buffer',record(state));}
 metadata(){return this.repo.transaction(this.scope,tx=>this.state(tx));}
 async lookup(input:RecentInput,bounds:RecentBounds,now:number):Promise<RecentMessage|undefined>{valid(bounds);const key='d:'+await hash(input.sender.id+'\n'+input.client_message_id),digest=await hash(JSON.stringify(input));return this.repo.transaction(this.scope,async tx=>{const state=await this.state(tx),index=await tx.get(C.recent_messages,key);if(!index)return;const row=await tx.get(C.recent_messages,recentMessageKey(Number(index.sequence))) as unknown as Stored|undefined;if(!row||row.sequence<=state.sequence-bounds.messages||Date.parse(row.created_at)<=this.cutoff(bounds,now))return;if(row.input_digest!==digest)fail(409,'IDEMPOTENCY_CONFLICT','같은 메시지 식별자의 내용이 다릅니다.');return visible(row);});}
 async initialize(tx?:RecordTransaction):Promise<RecentState>{const apply=async(t:RecordTransaction)=>{if(await t.get(C.recent_buffers,'buffer'))return this.state(t);const state:RecentState={notice_version:RECENT_NOTICE,created_at:Date.now(),epoch:crypto.randomUUID(),sequence:0,first:1,count:0,bytes:0};await this.save(t,state);return state;};return tx?apply(tx):this.repo.transaction(this.scope,apply);}
 private cutoff(bounds:RecentBounds,now:number){return bounds.expiresAt!==null&&now>=bounds.expiresAt?Infinity:now-bounds.retentionMs;}
 private async prune(tx:RecordTransaction,s:RecentState,bounds:RecentBounds,now:number,incomingBytes=0,incomingCount=0){
  let removed=0;
  const cutoff=this.cutoff(bounds,now);
  // Each deletion removes both message and dedupe in this same transaction. The
  // hard 500-row ceiling bounds work even after a long offline period.
  while(s.count&&removed<100){const key=recentMessageKey(s.first),row=await tx.get(C.recent_messages,key) as unknown as Stored|undefined;if(!row)fail(503,'BUFFER_STATE_INVALID','최근 기록 순서가 올바르지 않습니다.');
   if(Date.parse(row.created_at)>cutoff&&s.count+incomingCount<=bounds.messages&&s.bytes+incomingBytes<=RECENT_BUFFER_MAX_BYTES)break;
   await tx.delete(C.recent_messages,key);const index=await tx.get(C.recent_messages,row.dedupe_key);if(index?.sequence===row.sequence)await tx.delete(C.recent_messages,row.dedupe_key);s.count--;s.bytes-=row.encoded_bytes;s.first++;removed++;
  }
 }
 async append(input:RecentInput,bounds:RecentBounds,now:number,onCommit?:(tx:RecordTransaction,state:RecentState)=>Promise<void>){
  valid(bounds);if(bounds.expiresAt!==null&&now>=bounds.expiresAt)fail(410,'ROOM_GONE','방이 만료되었습니다.');
  const dedupe='d:'+await hash(input.sender.id+'\n'+input.client_message_id),digest=await hash(JSON.stringify(input));
  return this.repo.transaction(this.scope,async tx=>{
   const state=await this.state(tx);
   const prior=await tx.get(C.recent_messages,dedupe);
   if(prior){const row=await tx.get(C.recent_messages,recentMessageKey(Number(prior.sequence))) as unknown as Stored;if(row&&Date.parse(row.created_at)>this.cutoff(bounds,now)&&row.sequence>state.sequence-bounds.messages){if(row.input_digest!==digest)fail(409,'IDEMPOTENCY_CONFLICT','같은 메시지 식별자의 내용이 다릅니다.');return {message:visible(row),state,replayed:true};}}
   const sequence=state.sequence+1;if(!Number.isSafeInteger(sequence))fail(503,'BUFFER_SEQUENCE_LIMIT','메시지 순서 한도에 도달했습니다.');
   const message:RecentMessage={...input,sequence,cursor:state.epoch+':'+sequence,created_at:new Date(now).toISOString()};
   const bytes=new TextEncoder().encode(JSON.stringify(message)).byteLength;
   if(bytes+256>65536||bytes>RECENT_BUFFER_MAX_BYTES)fail(413,'MESSAGE_TOO_LARGE','직렬화된 메시지 한도를 초과했습니다.');
   await this.prune(tx,state,bounds,now,bytes,1);
   if(state.count+1>bounds.messages||state.bytes+bytes>RECENT_BUFFER_MAX_BYTES)fail(503,'BUFFER_CLEANUP_PENDING','최근 기록 정리 중입니다. 같은 메시지로 다시 확인하세요.');
   if(!state.count)state.first=sequence;state.sequence=sequence;state.count++;state.bytes+=bytes;
   await tx.put(C.recent_messages,recentMessageKey(sequence),record({...message,dedupe_key:dedupe,input_digest:digest,encoded_bytes:bytes}));
   await tx.put(C.recent_messages,dedupe,{sequence});await this.save(tx,state);if(onCommit)await onCommit(tx,state);
   return {message,state,replayed:false};
  });
 }
 async cleanup(bounds:RecentBounds,now:number,onCommit?:(tx:RecordTransaction,state:RecentState)=>Promise<void>):Promise<{state:RecentState;next:number|null}>{valid(bounds);return this.repo.transaction(this.scope,async tx=>{const state=await this.state(tx),before=state.count;await this.prune(tx,state,bounds,now);if(before!==state.count){await this.save(tx,state);if(onCommit)await onCommit(tx,state);}const first=state.count?await tx.get(C.recent_messages,recentMessageKey(state.first)):undefined;return {state,next:first?(state.count>bounds.messages||Date.parse(String(first.created_at))<=this.cutoff(bounds,now)?now+1000:Math.min(bounds.expiresAt??Infinity,Date.parse(String(first.created_at))+bounds.retentionMs)):null};});}
 async read(bounds:RecentBounds,now:number,after:string|undefined,limit:number,initial:{ms:number;messages:number},before?:string){
  valid(bounds);return this.repo.transaction(this.scope,async tx=>{
   const state=await this.state(tx);let first=Math.max(state.first,state.sequence-bounds.messages+1),high=state.sequence+1;const cutoff=this.cutoff(bounds,now);
   while(first<high){const mid=Math.floor((first+high)/2),row=await tx.get(C.recent_messages,recentMessageKey(mid));if(row&&Date.parse(String(row.created_at))>cutoff)high=mid;else first=mid+1;}
   const range=historyRange(state.epoch,state.sequence,first,after,before,limit,initial.messages);
   const rows=range.start<=range.end?await tx.list(C.recent_messages,{prefix:'m:',after:recentMessageKey(range.start-1),limit:range.count}):[];
   const messages=rows.map(r=>visible(r.value as unknown as Stored)).filter(m=>Date.parse(m.created_at)>cutoff);
   return {state,...historyPage(messages,state.epoch,state.sequence,first,after,before,limit,initial.messages)};
  });
 }
}
