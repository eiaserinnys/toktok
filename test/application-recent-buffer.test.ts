import {it,expect} from 'vitest';
import {runInDurableObject,evictDurableObject,runDurableObjectAlarm} from 'cloudflare:test';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {RecordCollection as C} from '../src/storage/repository';
import {recentBufferContract} from './recent-buffer-contract';
import {newToken} from '../src/http';
import {call,parsed,origin,takeCookie,bearer,installApplicationFixture,env} from './application-fixture';
installApplicationFixture();
it('Workers SQLite same recent buffer atomic/count/bytes/time contract',async()=>{const stub=env.PUBLIC_ROOMS.getByName('storage-contract');const result=await runInDurableObject(stub,async(_i,state)=>{const repo=new CloudflareRepository(state.storage);await repo.apply();return recentBufferContract(repo);});expect(result.count_ceiling).toBe(500);});
it('Workers SQLite latest/backward history contract',async()=>{const stub=env.PUBLIC_ROOMS.getByName('storage-contract');const result=await runInDurableObject(stub,async(_i,state)=>{const repo=new CloudflareRepository(state.storage);await repo.apply();return (await import('./history-contract')).historyContract(repo);});expect(result.older_than_five_minutes).toBe(true);});
it('actual Workers public approval/post survives actor eviction; no restored authority; alarm deletes history',async()=>{
 const base='/api/public/rooms/common-room',stub=env.PUBLIC_ROOMS.getByName('common-room'),input={request_secret:newToken(),client_request_id:crypto.randomUUID(),nickname:'Fictional test',notice_version:'toktok-risk-v2',visibility:'public',retention_mode:'recent_buffer'};
 expect((await call('old notice denied',base+'/connection-requests',{...input,notice_version:'toktok-risk-v1',retention_mode:'memory'})).status).toBe(400);
 const pending=await parsed<{request_id:string}>(await call('request',base+'/connection-requests',input),201);
 const preview=await call('preview',base+'/connection-approval',{action:'preview',request_id:pending.request_id},{Origin:origin}),cookie=takeCookie(preview,'__Host-toktok-public-approval-common-room'),view=await parsed<{nonce:string}>(preview);
 await parsed(await call('explicit fictional approval',base+'/connection-approval',{action:'approve',request_id:pending.request_id,nonce:view.nonce,checked:true,risk_ack_version:'toktok-risk-v2',entry_notice_version:'toktok-entry-30d-v1'},{Origin:origin,Cookie:cookie}));
 const approval=await parsed<{operator_grant:string}>(await call('result',base+'/connection-request',undefined,bearer(input.request_secret))),participant=await parsed<{lease_token:string}>(await call('join',base+'/participants',{...input,operator_grant:approval.operator_grant}),201);
 const sent=await parsed<{cursor:string;sequence:number;client_message_id:string}>(await call('post',base+'/messages',{text:'Fictional durable recent buffer',client_message_id:'recent-once'},bearer(participant.lease_token)),201);
 await parsed(await call('cancel grant',base+'/connection-request',undefined,bearer(input.request_secret),'DELETE'));
 await evictDurableObject(stub);
 expect((await call('old authority denied',base,undefined,bearer(participant.lease_token))).status).toBe(409);
 const watcher=await parsed<{lease_token:string}>(await call('fresh watcher',base+'/watchers',{notice_version:'toktok-risk-v2'}),201);
 const page=await parsed<{messages:{cursor:string;text:string}[];epoch:string}>(await call('cold read',base+'/messages',undefined,bearer(watcher.lease_token)));
 expect(page.messages.map(m=>m.cursor)).toContain(sent.cursor);expect(page.messages[0].text).toBe('Fictional durable recent buffer');
 const stored=await runInDurableObject(stub,async(_i,state)=>{const repo=new CloudflareRepository(state.storage);return repo.transaction('public:common-room',async tx=>{const rows=await tx.list(C.recent_messages,{prefix:'m:',limit:500});for(const row of rows)await tx.put(C.recent_messages,row.key,{...row.value,created_at:new Date(Date.now()-3600001).toISOString()});return {count:rows.length,alarm:(await state.storage.getAlarm())!==null};});});expect(stored).toEqual({count:1,alarm:true});
 await evictDurableObject(stub);expect(await runDurableObjectAlarm(stub)).toBe(true);
 const final=await runInDurableObject(stub,async(_i,state)=>({rows:await new CloudflareRepository(state.storage).transaction('public:common-room',tx=>tx.list(C.recent_messages,{limit:1000})),alarm:await state.storage.getAlarm()}));expect(final.rows).toHaveLength(0);expect(final.alarm).not.toBeNull(); // Revoked entry tombstone has its own bounded expiry alarm.
});
it('Workers SQL meter records recent buffer write/read/cleanup deltas without CONTROL estimates',async()=>{
 const stub=env.PUBLIC_ROOMS.getByName('cost-contract');const result=await runInDurableObject(stub,async(_i,state)=>{
  await new CloudflareRepository(state.storage).apply();let reads=0,writes=0;const storage={sql:{exec<T extends Record<string,import('../src/storage/cloudflare').CloudflareSqlValue>>(q:string,...args:(string|number|null)[]){const c=state.storage.sql.exec<T>(q,...args),rows=c.toArray();reads+=c.rowsRead;writes+=c.rowsWritten;return {toArray:()=>rows};}},transaction:<T>(fn:()=>Promise<T>)=>state.storage.transaction(fn)};
  const {RecentBuffer}=await import('../src/recent-buffer');const buffer=new RecentBuffer(new CloudflareRepository(storage),'public:cost-contract'),bounds={messages:500,retentionMs:3600000,expiresAt:null},now=Date.now(),input={sender:{id:'fixture-sender',nickname:'fictional'},text:'fictional',client_message_id:'meter'};await buffer.initialize();reads=0;writes=0;
  await buffer.append(input,bounds,now);const append={reads,writes};reads=0;writes=0;
  await buffer.lookup(input,bounds,now);const replayLookup={reads,writes};reads=0;writes=0;
  await buffer.read(bounds,now,undefined,20,{ms:300000,messages:20});const page={reads,writes};reads=0;writes=0;
  await buffer.cleanup(bounds,now+3600000);const cleanup={reads,writes};return {append,replayLookup,page,cleanup};
 });expect(result.append.writes).toBeGreaterThan(0);expect(result.page.writes).toBe(0);expect(result).toMatchInlineSnapshot(`
   {
     "append": {
       "reads": 12,
       "writes": 5,
     },
     "cleanup": {
       "reads": 14,
       "writes": 3,
     },
     "page": {
       "reads": 12,
       "writes": 0,
     },
     "replayLookup": {
       "reads": 11,
       "writes": 0,
     },
   }
 `);
});
