import assert from 'node:assert/strict';
import {PublicRoomCore} from '../src/public-core';
import {PublicEntries,PUBLIC_ENTRY_MS,PUBLIC_ENTRY_NOTICE} from '../src/public-entries';
import {PUBLIC_POLICY,PUBLIC_NOTICE,INTERNAL_IP_HEADER} from '../src/public-contracts';
import {newToken,hash} from '../src/http';
import {RecordCollection as C,type RepositoryPort} from '../src/storage/repository';
import {TEST_BUDGET} from './selfhost-budget';
export async function publicEntryContract(repo:RepositoryPort){
 let now=Date.UTC(2030,0,1),generation=crypto.randomUUID(),revision=1;const origin='https://entry.test',slug='entry-contract',base=origin+'/api/public/rooms/'+slug,ip=await hash('192.0.2.8');const catalog=()=>[{slug,title:'Fictional entry room',generation}];let core=new PublicRoomCore({repo,origin,catalog,policy:()=>({...PUBLIC_POLICY}),clock:()=>now,budget:TEST_BUDGET});
 const call=async(path:string,method='GET',body?:object,token?:string)=>{const r=await core.fetch(new Request(base+path,{method,headers:{[INTERNAL_IP_HEADER]:ip,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}));const raw=await r.text();return {status:r.status,data:raw?JSON.parse(raw):null};};
 const create=()=>({nickname:'Fictional agent',client_request_id:crypto.randomUUID(),request_secret:newToken(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'});
 const approval=(id:string,action:'preview'|'approve'|'deny'|'revoke',proof?:string,nonce?:string,extra:object={})=>core.connectionApproval({action,request_id:id,proof,nonce,checked:true,risk_ack_version:PUBLIC_NOTICE,entry_notice_version:PUBLIC_ENTRY_NOTICE,...extra},ip,slug);
 try{
  const input=create(),created=await call('/connection-requests','POST',input);assert.equal(created.status,201);const id=created.data.request_id;assert.equal((await call('/connection-requests','POST',input)).data.request_id,id);assert.equal((await call('/connection-requests','POST',{...input,nickname:'other'})).status,409);
  const p=await approval(id,'preview');assert.equal(p.status,200);const proof=p.cookie!,nonce=String(p.data.nonce);assert(proof);
  assert.equal((await approval(id,'approve',proof,nonce,{entry_notice_version:undefined})).status,403);
  assert.equal((await approval(id,'approve',proof+'x',nonce)).status,403);
  assert.equal((await approval(id,'approve',proof,newToken())).status,403);
  assert.equal((await approval(id,'approve',proof,nonce,{checked:false})).status,403);
  const approved=await approval(id,'approve',proof,nonce);assert.equal(approved.status,200);assert.equal(Date.parse(String(approved.data.entry_expires_at))-now,PUBLIC_ENTRY_MS);assert(!JSON.stringify(approved.data).includes(input.request_secret));assert(!('operator_grant' in approved.data));
  const polled=await call('/connection-request','GET',undefined,input.request_secret);assert.equal(polled.status,200);const grant=polled.data.operator_grant;assert(!polled.data.verification_uri.includes(grant));assert(!polled.data.verification_uri.includes(input.request_secret));
  const stored=await repo.transaction('public:'+slug,tx=>tx.list(C.public_entries,{limit:1000}));const raw=JSON.stringify(stored);for(const secret of [grant,input.request_secret,proof,nonce])assert(!raw.includes(secret));
  const join={...input,operator_grant:grant};assert.equal((await call('/participants','POST',{...join,request_secret:newToken()})).status,403);assert.equal((await call('/participants','POST',{...join,nickname:'other'})).status,403);
  let joined=await call('/participants','POST',join);assert.equal(joined.status,201);const sender=joined.data.sender.id;
  const message={text:'Fictional durable entry message',client_message_id:'only-once'};assert.equal((await call('/messages','POST',message,joined.data.lease_token)).status,201);
  now+=PUBLIC_POLICY.leaseMs+1;assert.equal(core.diagnostics().leases.participants,0);joined=await call('/participants','POST',join);assert.equal(joined.status,201);assert.equal(joined.data.sender.id,sender);assert.equal((await call('/messages','POST',message,joined.data.lease_token)).status,200);
  core.shutdown();core=new PublicRoomCore({repo,origin,catalog,policy:()=>({...PUBLIC_POLICY}),clock:()=>now,budget:TEST_BUDGET});
  joined=await call('/participants','POST',join);assert.equal(joined.status,201);assert.equal(joined.data.sender.id,sender);assert.equal((await call('/messages','POST',message,joined.data.lease_token)).status,200);
  assert.equal((await approval(id,'preview',newToken())).status,403);const owner=await approval(id,'preview',proof);assert.equal(owner.status,200);assert.equal((await approval(id,'revoke',proof,String(owner.data.nonce))).data.status,'revoked');assert.equal(core.diagnostics().leases.participants,0);assert.equal((await call('/participants','POST',join)).status,403);
  now+=60000;const second=create(),c2=await call('/connection-requests','POST',second),p2=await approval(c2.data.request_id,'preview',proof);assert.equal((await approval(c2.data.request_id,'approve',proof,String(p2.data.nonce))).status,200);const g2=(await call('/connection-request','GET',undefined,second.request_secret)).data.operator_grant;
  generation=crypto.randomUUID();core.configure(++revision,{...PUBLIC_POLICY},catalog());assert.equal((await call('/participants','POST',{...second,operator_grant:g2})).status,410);
  now+=60000;const third=create(),c3=await call('/connection-requests','POST',third),p3=await approval(c3.data.request_id,'preview',proof);assert.equal((await approval(c3.data.request_id,'approve',proof,String(p3.data.nonce))).status,200);const g3=(await call('/connection-request','GET',undefined,third.request_secret)).data.operator_grant;const expiration=now+PUBLIC_ENTRY_MS;
  now=expiration-1;assert.equal((await call('/participants','POST',{...third,operator_grant:g3})).status,201);now=expiration;assert.equal(core.diagnostics().leases.participants,0);assert.equal((await call('/participants','POST',{...third,operator_grant:g3})).status,410);
  await core.maintenance(slug);const rows=await repo.transaction('public:'+slug,tx=>tx.list(C.public_entries,{prefix:'r:',limit:1000}));assert.equal(rows.length,0);
  return {new_approval_days:30,idle_seats:0,cold_reentry:true,stable_sender_dedupe:true,hash_only:true,owner_revoke:true,recreated_room_denied:true,expiry:true};
 }finally{core.shutdown();}
}
export async function entryLimitContract(repo:RepositoryPort){let now=Date.UTC(2030,0,1);const room='entry-limits',generation=crypto.randomUUID(),store=new PublicEntries(repo,room,()=>generation,'https://entry.test',()=>now,()=>false,()=>{});let accepted=0;
 const input=()=>({nickname:'Fictional',client_request_id:crypto.randomUUID(),request_secret:newToken(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'});
 const first=input();await store.create(first,300000,2,()=>accepted++);await store.create(input(),300000,2,()=>accepted++);await assert.rejects(()=>store.create(input(),300000,2,()=>accepted++),(e:{status?:number})=>e.status===429);assert.equal(accepted,2);
 now+=300000;assert.equal((await store.cleanup()).count,0);await store.create(input(),300000,2,()=>accepted++);assert.equal(accepted,3);await assert.rejects(()=>repo.transaction('control',tx=>tx.put(C.public_entries,'meta',{count:1})));await assert.rejects(()=>repo.transaction('room:private',tx=>tx.put(C.public_entries,'meta',{count:1})));return {capacity:2,overflow_denied:true,expired_reclaimed:true,scope_denied:true};}
