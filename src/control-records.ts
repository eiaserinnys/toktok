import {RecordCollection as C,type RecordTransaction,type RecordValue} from './storage/repository';
import {fail} from './http';
export {C};
export type Tx=RecordTransaction;
export const save=(tx:Tx,c:C,key:string,value:object)=>tx.put(c,key,value as unknown as RecordValue);
export const read=async<T>(tx:Tx,c:C,key:string)=>await tx.get(c,key) as unknown as T|undefined;
export function required<T>(value:T|undefined):T{if(value===undefined)fail(503,'CONTROL_STATE_INVALID','서버 상태를 확인하지 못했습니다.');return value;}
export async function digest(tx:Tx,...parts:string[]){
 const row=required(await read<{key:string}>(tx,C.settings,'hmac'));
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(row.key.match(/.{2}/g)!,b=>parseInt(b,16)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(parts))));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function expire(tx:Tx,c:C,key:string,expires_at:number){await save(tx,C.flows,`z:${String(expires_at).padStart(16,'0')}:${c}:${key}`,{collection:c,key,expires_at});}
export async function cleanExpired(tx:Tx,now:number,onPendingAgent:()=>Promise<void>,onRoom:(id:string)=>Promise<void>){
 // Targeted bounded maintenance: access checks enforce expiry even when queue work remains.
 for(const entry of await tx.list(C.flows,{prefix:'z:',limit:50})){
  const job=entry.value as unknown as {collection:C;key:string;expires_at:number};if(job.expires_at>now)break;
  const row=await tx.get(job.collection,job.key);
  if(row&&typeof row.expires_at==='number'&&row.expires_at<=now){
   if(job.collection===C.agents){if(row.status==='pending')await onPendingAgent();await tx.delete(C.agents,'t:'+String(row.token_hash));if(row.owner_id)await tx.delete(C.agents,`o:${row.owner_id}:${row.id}`);}
   if(job.collection===C.settings&&job.key.startsWith('room:'))await onRoom(String(row.id));
   await tx.delete(job.collection,job.key);
  }
  await tx.delete(C.flows,entry.key);
 }
}
export async function nextExpiry(tx:Tx){return (await tx.list(C.flows,{prefix:'z:',limit:1}))[0]?.value.expires_at as number|undefined;}
