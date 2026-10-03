import assert from 'node:assert/strict';
import {ControlCore} from '../src/control-core';
import {demoInstallationProfile} from '../src/installation-profile';
import {PrivateRoomCore} from '../src/private-core';
import {SettingsStore} from '../src/settings-store';
import {C} from '../src/control-records';
import {hash,newToken,HttpError} from '../src/http';
import type {RepositoryPort} from '../src/storage/repository';
import type {PrivateRoomInit} from '../src/private-contracts';
import {PRIVATE_NOTICE} from '../src/private-contracts';

/** Same new lifetime contract across real transactional repositories; all identities are fictional. */
export async function privateLifetimeContract(repo:RepositoryPort){
 let now=Date.now();const clock=()=>now,profile=demoInstallationProfile(),control=new ControlCore(repo,{installation:{profile,enforcement_version:1},enforcement:{version:1,ready:()=>true}});
 await control.execute('config',{now});const owner=crypto.randomUUID(),session=await hash(newToken()),csrf=newToken();
 await repo.transaction('control',async tx=>{await tx.put(C.accounts,'a:'+owner,{id:owner,provider:'email-otp',subject:'fictional@fixture.example',email:'fictional@fixture.example',email_verified:1,role:'member',admission_kind:'invited',can_create_private:1,can_persist_private:1});await tx.put(C.sessions,session,{owner_id:owner,csrf,expires_at:now+86400000});});
 const before=await repo.transaction('control',tx=>new SettingsStore(tx).budget(now));
 for(const persist of [false,true]){
  const context_hash=await hash(newToken()),nonce_hash=await hash(newToken()),grant_hash=await hash(newToken()),caller={session_hash:session,csrf,ip:'192.0.2.1',now};
  await control.execute('create-context',{...caller,creation_context:{context_hash,nonce_hash}});await control.execute('create-grant',{...caller,creation_grant:{context_hash,nonce_hash,grant_hash,risk_ack:true,risk_ack_version:PRIVATE_NOTICE}});
  const tokens={invite:newToken(),read:newToken(),owner:newToken()},result=await control.execute('create-reserve',{...caller,creation:{grant_hash,body:{purpose:'가상 상설방',persist,...(persist?{retention_seconds:600}:{}),client_request_id:crypto.randomUUID()},invite_hash:await hash(tokens.invite),read_hash:await hash(tokens.read),owner_hash:await hash(tokens.owner)}}) as {room_id:string;snapshot:PrivateRoomInit};
  assert.equal(result.snapshot.expires_at,null);assert.equal(result.snapshot.lifetime,'member_permanent');
  let reservations=0;const cores:PrivateRoomCore[]=[];const make=()=>{const c=new PrivateRoomCore({origin:'https://fixture.example',repo,clock,budget:{newOperationId:()=>crypto.randomUUID(),reserve:async()=>{reservations++;throw new HttpError(429,'BUDGET_EXCEEDED','fixture');}}});cores.push(c);return c;};let core=make();
  try{
   await core.initialize(result.snapshot);await control.execute('create-commit',{...caller,creation_commit:{room_id:result.room_id,proof:'initialized'}});
   assert.equal((await core.maintenance(result.room_id) as {next_maintenance_at:null}).next_maintenance_at,null);
   const call=async<T=unknown>(path:string,method='GET',body?:unknown,token=tokens.read)=>{const r=await core.fetch(new Request('https://fixture.example/api/v1/rooms/'+result.room_id+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:(r.status===204?null:await r.json()) as T};};
   const joined=await call<{participant_token:string}>('/participants','POST',{nickname:'가상 참여',client_request_id:'join',visibility:'private',notice_version:PRIVATE_NOTICE,retention_mode:persist?'persisted':'recent_buffer'},tokens.invite);assert.equal(joined.status,201);
   const participant=joined.data.participant_token,posted=await call<{cursor:string}>('/messages','POST',{text:'가상 본문',client_message_id:'once'},participant);assert.equal(posted.status,201);core.shutdown();core=make();
   const restored=await call<{messages:{cursor:string}[]}>('/messages');assert.equal(restored.status,200);assert.equal(restored.data.messages[0].cursor,posted.data.cursor);
   assert.equal((await call('/messages','POST',{text:'가상 본문',client_message_id:'once'},participant)).status,200);assert.equal((await call('/messages','POST',{text:'충돌',client_message_id:'once'},participant)).status,409);
   now+=3600001;await core.maintenance(result.room_id);const empty=await call<{messages:unknown[]}>('/messages');assert.equal(empty.status,200);assert.equal(empty.data.messages.length,0);assert.equal((await core.maintenance(result.room_id) as {next_maintenance_at:null}).next_maintenance_at,null);
   assert.equal(reservations,0);assert.equal((await call('/close','POST',{},tokens.owner)).status,200);assert.equal((await call('/messages','POST',{text:'closed',client_message_id:'closed'},participant)).status,410);assert.equal((await call('','DELETE',undefined,tokens.owner)).status,204);
   await control.execute('create-commit',{now,creation_commit:{room_id:result.room_id,proof:'closed'}});
  }finally{for(const c of cores)c.shutdown();}
 }
 const after=await repo.transaction('control',tx=>new SettingsStore(tx).budget(now));assert.deepEqual(after.usage,before.usage);assert.deepEqual(after.estimate,before.estimate);const state=await repo.transaction('control',tx=>new SettingsStore(tx).state());assert.equal(state.active_private,0);assert.equal(state.member_private,0);
 // DEMO accounts must have completed an invited/bootstrap admission, even if forged entitlement bits exist in a fixture row.
 await repo.transaction('control',async tx=>{const a=await tx.get(C.accounts,'a:'+owner);assert(a);await tx.put(C.accounts,'a:'+owner,{...a,admission_kind:'hosted'});});await assert.rejects(()=>control.execute('create-options',{now,session_hash:session}),(e:unknown)=>(e as {status:number}).status===403);
 return {recent_and_longterm:true,restart:true,idempotency:true,empty_timer:null,demo_budget_delta:0,wrong_admission_kind:403};
}
