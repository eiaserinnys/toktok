import {env} from 'cloudflare:workers';
import {it,expect} from 'vitest';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import type {RecordFixture,PrivateRoom} from './selfhost-worker';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {PrivateRoomCore} from '../src/private-core';
import {privateLifetimeContract} from './private-lifetime-contract';
import {privateSnapshot} from './selfhost-private-fixture';
interface Env {RECORD_ROOMS:DurableObjectNamespace<RecordFixture>;PRIVATE_ROOMS:DurableObjectNamespace<PrivateRoom>;}
it('Workers SQLite preserves the member lifetime and budget boundary transactionally',async()=>{
 const stub=(env as unknown as Env).RECORD_ROOMS.getByName('private-lifetime-control');const result=await runInDurableObject(stub,async(_i,ctx)=>{const repo=new CloudflareRepository(ctx.storage);await repo.apply();return privateLifetimeContract(repo);});expect(result).toMatchObject({demo_budget_delta:0,empty_timer:null,wrong_admission_kind:403});console.log('PRIVATE_LIFETIME_CF '+JSON.stringify(result));
});
it('actual CF permanent actor has no empty alarm and restores capability/history after eviction',async()=>{
 const id='permanent-actor',stub=(env as unknown as Env).PRIVATE_ROOMS.getByName(id),{snapshot,tokens}=await privateSnapshot(id,true);snapshot.persist=false;snapshot.retention_seconds=null;snapshot.expires_at=null;snapshot.lifetime='member_permanent';await stub.initialize(snapshot);
 expect(await runInDurableObject(stub,(_i,ctx)=>ctx.storage.getAlarm())).toBe(null);
 const call=async(path:string,method='GET',body?:unknown,token=tokens.read)=>{const r=await stub.fetch(new Request('http://localhost:18794/api/v1/rooms/'+id+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json() as {participant_token?:string;cursor?:string;messages?:{cursor:string}[]}};};
 const joined=await call('/participants','POST',{nickname:'fictional',client_request_id:'join',notice_version:snapshot.notice_version,visibility:'private',retention_mode:'recent_buffer'},tokens.invite);expect(joined.status).toBe(201);const posted=await call('/messages','POST',{text:'fictional retained text',client_message_id:'once'},joined.data.participant_token!);expect(posted.status).toBe(201);await evictDurableObject(stub);
 const restored=await call('/messages');expect(restored.status).toBe(200);expect(restored.data.messages?.[0].cursor).toBe(posted.data.cursor);
 await runInDurableObject(stub,async(_i,ctx)=>{const core=new PrivateRoomCore({origin:'http://localhost:18794',repo:new CloudflareRepository(ctx.storage),clock:()=>Date.now()+3600001});try{const result=await core.maintenance(id) as {next_maintenance_at:number|null};expect(result.next_maintenance_at).toBe(null);}finally{core.shutdown();}});await evictDurableObject(stub);
 const alarm=await runInDurableObject(stub,async(i,ctx)=>{await i.alarm();return ctx.storage.getAlarm();});expect(alarm).toBe(null);console.log('PRIVATE_LIFETIME_CF '+JSON.stringify({actor_evicted:true,history_restored:true,expired_history_timer:null}));
});
