import {test} from 'node:test';
import {publicTestRepo} from './selfhost-recent-repo';
import {publicEntryContract,entryLimitContract} from './public-entry-contract';
test('durable public entry approval, cold reentry, revocation and 30 day boundary',async t=>{console.log(await publicEntryContract(publicTestRepo(t)));});
test('entry capacity, reclaim and repository scope remain bounded',async t=>{console.log(await entryLimitContract(publicTestRepo(t)));});
import assert from 'node:assert/strict';
import {ControlCore} from '../src/control-core';
import {demoInstallationProfile} from '../src/installation-profile';
import {SettingsStore} from '../src/settings-store';
import {PublicRoomCore} from '../src/public-core';
import {PUBLIC_POLICY,PUBLIC_CATALOG,INTERNAL_IP_HEADER,PUBLIC_NOTICE} from '../src/public-contracts';
import {hash,newToken,HttpError} from '../src/http';
import {RecordCollection as C} from '../src/storage/repository';
import {PUBLIC_ENTRY_WRITE_BYTES} from '../src/public-entries';
import {TEST_BUDGET} from './selfhost-budget';
test('server room generations survive restart, ignore title edits and rotate on disable/remove/recreate',async t=>{
 const repo=publicTestRepo(t),profile=demoInstallationProfile(),core=new ControlCore(repo,{installation:{profile,enforcement_version:1},enforcement:{version:1,ready:()=>true}});
 const config=()=>core.execute('get-runtime-config',{}) as Promise<{public_generations:Record<string,string>}>;
 const initial=(await config()).public_generations['common-room'];assert(initial);
 const update=(fn:(s:typeof profile)=>void)=>repo.transaction('control',async tx=>{const store=new SettingsStore(tx),row=await store.read(),s=structuredClone(row.settings);fn(s);await store.update(row.revision,s,'fixture',Date.now());});
 await update(s=>{s.public.catalog[0].title='Changed fictional title';});assert.equal((await config()).public_generations['common-room'],initial);
 await update(s=>{s.public.catalog[0].enabled=false;});assert.equal((await config()).public_generations['common-room'],undefined);
 await update(s=>{s.public.catalog[0].enabled=true;});const reopened=(await config()).public_generations['common-room'];assert.notEqual(reopened,initial);
 await update(s=>{s.public.catalog=s.public.catalog.filter(r=>r.slug!=='common-room');});await update(s=>{s.public.catalog.unshift({slug:'common-room',title:'New fictional room',enabled:true});});assert.notEqual((await config()).public_generations['common-room'],reopened);
 const cold=new ControlCore(repo,{installation:{profile,enforcement_version:1},enforcement:{version:1,ready:()=>true}});assert.deepEqual((await cold.execute('get-runtime-config',{}) as {public_generations:unknown}).public_generations,(await config()).public_generations);
});
test('entry writes require existing strict budget; legacy grants stay short; pre-entry catalog upgrades without widening settings',async t=>{
 const repo=publicTestRepo(t),origin='https://entry.test';let now=Date.now(),blocked=true;const reserve:unknown[]=[];const budget={...TEST_BUDGET,async reserve(id:string,kind:import('../src/private-contracts').PrivateBudgetKind,amount:number){reserve.push({kind,amount});if(kind==='persistent_write_bytes'&&blocked)throw new HttpError(429,'BUDGET_EXCEEDED','fixture');return TEST_BUDGET.reserve(id,kind,amount);}};
 const core=new PublicRoomCore({repo,origin,catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),budget,clock:()=>now});t.after(()=>core.shutdown());core.configure(1,{...PUBLIC_POLICY},PUBLIC_CATALOG);const catalog=PUBLIC_CATALOG.map(r=>({...r,generation:crypto.randomUUID()}));assert.equal(core.hydrateCatalogGenerations(catalog),true);assert.equal(core.hydrateCatalogGenerations(catalog),false);
 const ip=await hash('192.0.2.5'),input={nickname:'Fictional',client_request_id:crypto.randomUUID(),request_secret:newToken(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'};
 const request=()=>new Request(origin+'/api/public/rooms/common-room/connection-requests',{method:'POST',headers:{[INTERNAL_IP_HEADER]:ip,'Content-Type':'application/json'},body:JSON.stringify(input)});
 const denied=await core.fetch(request());assert.equal(denied.status,429);await denied.arrayBuffer();assert.equal((await repo.transaction('public:common-room',tx=>tx.list(C.public_entries,{prefix:'r:',limit:1000}))).length,0);assert(reserve.some(r=>(r as {amount:number}).amount===PUBLIC_ENTRY_WRITE_BYTES));
 blocked=false;const legacy=await core.issueOperatorGrant({room:'common-room',risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:ip} as import('../src/public-contracts').ValidatedOperatorAck);assert.equal(legacy.status,201);assert('expires_at' in legacy.data);assert.equal(Date.parse(legacy.data.expires_at)-now,PUBLIC_POLICY.grantMs);
});
test('expiry cleanup processes at most100 entries and startup index finds authority without messages',async t=>{
 const repo=publicTestRepo(t),generation=crypto.randomUUID();let now=Date.now();const {PublicEntries}=await import('../src/public-entries');const entries=new PublicEntries(repo,'authority-only',()=>generation,'https://entry.test',()=>now,()=>false,()=>{});
 for(let n=0;n<101;n++)await entries.create({nickname:'Fictional',client_request_id:String(n),request_secret:newToken(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'},300000,1000,()=>{});
 assert.deepEqual(await repo.listPublicRoomIds({limit:1}),{ids:['authority-only'],next:'authority-only'});now+=300000;assert.equal((await entries.cleanup()).count,1);assert.equal((await entries.cleanup()).count,0);assert.deepEqual(await repo.listPublicRoomIds({limit:100}),{ids:[]});
});
test('reentry respects current seat caps and owner revoke wakes an active wait',async t=>{
 const repo=publicTestRepo(t),origin='https://entry.test',slug='seats',generation=crypto.randomUUID();let now=Date.now();const core=new PublicRoomCore({repo,origin,catalog:()=>[{slug,title:'Fictional',generation}],policy:()=>({...PUBLIC_POLICY,participants:1,ipParticipants:1}),clock:()=>now,budget:TEST_BUDGET});t.after(()=>core.shutdown());const ip=await hash('192.0.2.10'),path=origin+'/api/public/rooms/'+slug;
 const fetch=(tail:string,method='GET',body?:object,token?:string)=>core.fetch(new Request(path+tail,{method,headers:{[INTERNAL_IP_HEADER]:ip,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 async function make(){const input={nickname:'Fictional',client_request_id:crypto.randomUUID(),request_secret:newToken(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'},r=await fetch('/connection-requests','POST',input);assert.equal(r.status,201);const created=await r.json() as {request_id:string},preview=await core.connectionApproval({action:'preview',request_id:created.request_id},ip,slug);const decision={action:'approve' as const,request_id:created.request_id,proof:preview.cookie,nonce:String(preview.data.nonce),checked:true,risk_ack_version:PUBLIC_NOTICE,entry_notice_version:'toktok-entry-30d-v1'};assert.equal((await core.connectionApproval(decision,ip,slug)).status,200);const result=await(await fetch('/connection-request','GET',undefined,input.request_secret)).json() as {operator_grant:string};return {input,join:{...input,operator_grant:result.operator_grant},decision};}
 const a=await make(),one=await(await fetch('/participants','POST',a.join)).json() as {lease_token:string};const b=await make();now+=60000;
 const full=await fetch('/participants','POST',b.join);assert.equal(full.status,429);await full.arrayBuffer();assert.equal(core.diagnostics().leases.participants,1);
 const left=await fetch('/lease','DELETE',undefined,one.lease_token);assert.equal(left.status,204);const two=await fetch('/participants','POST',b.join);assert.equal(two.status,201);const lease=(await two.json() as {lease_token:string}).lease_token;
 const pending=fetch('/wait?timeout=1','GET',undefined,lease);for(let n=0;n<30&&core.diagnostics().active_waits===0;n++)await new Promise(r=>setTimeout(r,5));assert.equal(core.diagnostics().active_waits,1);
 assert.equal((await core.connectionApproval({...b.decision,action:'revoke'},ip,slug)).data.status,'revoked');const woke=await pending;assert.equal(woke.status,403);await woke.arrayBuffer();assert.equal(core.diagnostics().active_waits,0);assert.equal(core.diagnostics().leases.participants,0);
});
test('revoked approval response clears participant_connected before callback and old tab nonce requires preview',async t=>{
 const repo=publicTestRepo(t),{PublicEntries,PUBLIC_ENTRY_NOTICE}=await import('../src/public-entries');let active=true;const store=new PublicEntries(repo,'revoke-response',()=> '11111111-1111-4111-8111-111111111111','https://entry.test',Date.now,()=>active,()=>{active=false;});const input={nickname:'Fictional',client_request_id:'request',request_secret:newToken(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'},created=await store.create(input,300000,1000,()=>{});
 const first=await store.approval({action:'preview',request_id:created.request_id},()=>{}),second=await store.approval({action:'preview',request_id:created.request_id,proof:first.cookie},()=>{}),decision={action:'approve' as const,request_id:created.request_id,proof:first.cookie,nonce:String(first.data.nonce),checked:true,risk_ack_version:PUBLIC_NOTICE,entry_notice_version:PUBLIC_ENTRY_NOTICE};
 await assert.rejects(()=>store.approval(decision,()=>{}),(e:{code?:string})=>e.code==='OPERATOR_ACK_REQUIRED');decision.nonce=String(second.data.nonce);assert.equal((await store.approval(decision,()=>{})).data.participant_connected,true);const revoked=await store.approval({...decision,action:'revoke'},()=>{});assert.equal(revoked.data.status,'revoked');assert.equal(revoked.data.participant_connected,false);assert.equal(active,false);
});
