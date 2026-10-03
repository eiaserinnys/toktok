import {it,expect} from 'vitest';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {publicEntryContract,entryLimitContract} from './public-entry-contract';
import {env,installApplicationFixture,call,parsed,origin,takeCookie,bearer} from './application-fixture';
import {newToken} from '../src/http';
installApplicationFixture();
it('actual Workers cold actor preserves approved entry and hydrates legacy cached catalog',async()=>{
 const base='/api/public/rooms/common-room',stub=env.PUBLIC_ROOMS.getByName('common-room');
 expect((await call('seed old public configuration',base+'/guide')).status).toBe(200);
 await runInDurableObject(stub,async(_i,state)=>{const config=await state.storage.get<{revision:number;policy:unknown;catalog:{slug:string;title:string;generation?:string}[]}>('toktok_public_config');expect(!!config).toBe(true);await state.storage.put('toktok_public_config',{...config!,catalog:config!.catalog.map(({slug,title})=>({slug,title}))});});
 await evictDurableObject(stub);
 const input={request_secret:newToken(),client_request_id:crypto.randomUUID(),nickname:'Fictional cold agent',notice_version:'toktok-risk-v2',visibility:'public',retention_mode:'recent_buffer'};
 const request=await parsed<{request_id:string}>(await call('new entry after cached configuration upgrade',base+'/connection-requests',input),201);
 expect(await runInDurableObject(stub,async(_i,state)=>{const c=await state.storage.get<{catalog:{slug:string;generation?:string}[]}>('toktok_public_config');return typeof c?.catalog.find(r=>r.slug==='common-room')?.generation==='string';})).toBe(true);
 const preview=await call('entry owner preview',base+'/connection-approval',{action:'preview',request_id:request.request_id},{Origin:origin}),cookie=takeCookie(preview,'__Host-toktok-public-approval-common-room'),view=await parsed<{nonce:string}>(preview);
 const approved=await parsed<{entry_expires_at:string}>(await call('new explicit thirty day approval',base+'/connection-approval',{action:'approve',request_id:request.request_id,nonce:view.nonce,checked:true,risk_ack_version:'toktok-risk-v2',entry_notice_version:'toktok-entry-30d-v1'},{Origin:origin,Cookie:cookie}));
 const result=await parsed<{operator_grant:string}>(await call('private entry retrieval',base+'/connection-request',undefined,bearer(input.request_secret)));
 const join={...input,operator_grant:result.operator_grant};
 const first=await parsed<{lease_token:string;sender:{id:string}}>(await call('initial participant lease',base+'/participants',join),201);
 expect((await call('release current seat',base+'/lease',undefined,bearer(first.lease_token),'DELETE')).status).toBe(204);
 await evictDurableObject(stub);
 const second=await parsed<{lease_token:string;sender:{id:string}}>(await call('cold actor same entry rejoin',base+'/participants',join),201);expect(second.sender.id===first.sender.id).toBe(true);
 const oldLease=await parsed<{error:{code:string}}>(await call('old volatile lease denied',base+'/messages',undefined,bearer(first.lease_token)),409);expect(oldLease.error.code).toBe('LEASE_EPOCH_RESET');
 const cold=await parsed<{nonce:string;entry_expires_at:string}>(await call('same owner preview after restart',base+'/connection-approval',{action:'preview',request_id:request.request_id},{Origin:origin,Cookie:cookie}));expect(cold.entry_expires_at).toBe(approved.entry_expires_at);
 const revoked=await parsed<{status:string;participant_connected:boolean}>(await call('owner revocation after restart',base+'/connection-approval',{action:'revoke',request_id:request.request_id,nonce:cold.nonce},{Origin:origin,Cookie:cookie}));expect(revoked).toMatchObject({status:'revoked',participant_connected:false});
 expect((await call('revoked cold entry cannot rejoin',base+'/participants',join)).status).toBe(403);
});
it('Workers SQLite durable entry authority shared contract',async()=>{const result=await runInDurableObject(env.PUBLIC_ROOMS.getByName('entry-storage'),async(_i,ctx)=>{const repo=new CloudflareRepository(ctx.storage);await repo.apply();return {flow:await publicEntryContract(repo),limits:await entryLimitContract(repo)};});expect(result.flow.cold_reentry).toBe(true);expect(result.limits.scope_denied).toBe(true);});
it('Workers SQL measures direct authority create/preview/approve/revoke/expiry rows',async()=>{const result=await runInDurableObject(env.PUBLIC_ROOMS.getByName('entry-meter'),async(_i,ctx)=>{
 await new CloudflareRepository(ctx.storage).apply();let reads=0,writes=0;const storage={sql:{exec<T extends Record<string,import('../src/storage/cloudflare').CloudflareSqlValue>>(q:string,...args:(string|number|null)[]){const cursor=ctx.storage.sql.exec<T>(q,...args),rows=cursor.toArray();reads+=cursor.rowsRead;writes+=cursor.rowsWritten;return {toArray:()=>rows};}},transaction:<T>(fn:()=>Promise<T>)=>ctx.storage.transaction(fn)};
 const {PublicEntries,PUBLIC_ENTRY_NOTICE}=await import('../src/public-entries'),{newToken}=await import('../src/http');let now=Date.now();const store=new PublicEntries(new CloudflareRepository(storage),'meter-room',()=> '11111111-1111-4111-8111-111111111111','https://fixture.test',()=>now,()=>false,()=>{}),counts:Record<string,{reads:number;writes:number}>={};const take=(name:string)=>{counts[name]={reads,writes};reads=0;writes=0;};
 const input={nickname:'Fictional',client_request_id:crypto.randomUUID(),request_secret:newToken(),notice_version:'toktok-risk-v2',visibility:'public',retention_mode:'recent_buffer'};const request=await store.create(input,300000,1000,()=>{});take('create');const preview=await store.approval({action:'preview',request_id:request.request_id},()=>{});take('preview');await store.approval({action:'approve',request_id:request.request_id,proof:preview.cookie,nonce:String(preview.data.nonce),checked:true,risk_ack_version:'toktok-risk-v2',entry_notice_version:PUBLIC_ENTRY_NOTICE},()=>{});take('approve');await store.poll(input.request_secret);take('poll');await store.cancel(input.request_secret);take('cancel');now+=300000;await store.cleanup();take('cleanup');return counts;
 });expect(result.poll.writes).toBe(0);expect(result).toMatchInlineSnapshot(`
   {
     "approve": {
       "reads": 11,
       "writes": 4,
     },
     "cancel": {
       "reads": 12,
       "writes": 4,
     },
     "cleanup": {
       "reads": 19,
       "writes": 4,
     },
     "create": {
       "reads": 8,
       "writes": 8,
     },
     "poll": {
       "reads": 10,
       "writes": 0,
     },
     "preview": {
       "reads": 11,
       "writes": 2,
     },
   }
 `);});
