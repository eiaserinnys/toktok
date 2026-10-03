import {SELF,runInDurableObject} from 'cloudflare:test';
import {env as workerEnv} from 'cloudflare:workers';
const env=workerEnv as unknown as {IDENTITIES:DurableObjectNamespace};
import {beforeEach,afterEach,it,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {ControlCore} from '../src/control-core';
import {C,read,save,type Tx} from '../src/control-records';
import {DEFAULT_SETTINGS,validateSettings} from '../src/settings-schema';
import {SettingsStore} from '../src/settings-store';
import {newBudgetOperation} from '../src/control-policy';
import {hash,newToken} from '../src/http';
import type {RegistryInput} from '../src/identity-types';
import {CONTROL_ENFORCEMENT_VERSION} from '../src/control-installation';
const origin='http://localhost:8787',connected={version:CONTROL_ENFORCEMENT_VERSION,ready:()=>true};
const stub=():DurableObjectStub=>env.IDENTITIES.get(env.IDENTITIES.idFromName('team'));
let now:number,raw:{route:string;status:number;code?:string;retry_after:string|null}[];
beforeEach(async()=>{const s=stub();await runInDurableObject(s,async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();await new CloudflareRepository(state.storage).apply();});await SELF.fetch(origin+'/__control/reset',{method:'POST'});now=Date.UTC(2030,0,1);raw=[];});
afterEach(()=>console.info('TOKTOK_PORT_HTTP',JSON.stringify(raw)));
async function records<T>(fn:(tx:Tx)=>Promise<T>){return runInDurableObject(stub(),(_i,state)=>new CloudflareRepository(state.storage).transaction('control',fn));}
async function direct(action:string,input:RegistryInput={},enforce=false){
 const result=await runInDurableObject(stub(),async(_i,state)=>{const core=new ControlCore(new CloudflareRepository(state.storage),{bootstrapEmail:'admin@fixture.example',...(enforce?{enforcement:connected}:{})});try{return {status:200,value:await core.execute(action,{...input,now})};}catch(e){const error=e as {status?:number;code?:string;room_id?:string;retryAfter?:number};return {status:error.status??500,code:error.code,room_id:error.room_id,retry_after:error.retryAfter};}});
 raw.push({route:'/internal/'+action,status:result.status,code:result.code,retry_after:result.retry_after?String(result.retry_after):null});return result;
}
async function call(route:string,method='GET',payload?:unknown,headers:Record<string,string>={}){
 const r=await SELF.fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},body:payload===undefined?undefined:JSON.stringify(payload)});const d=await r.clone().json() as {error?:{code:string}};raw.push({route:route.replace(/[a-f0-9-]{36}/g,'<id>'),status:r.status,code:d.error?.code,retry_after:r.headers.get('Retry-After')});return r;
}
const cookie=(r:Response)=>r.headers.get('Set-Cookie')!.split(';')[0];
interface Flow {flow:string;nonce:string;cookie:string;}
interface Session {cookie:string;csrf:string;}
interface Invite {id:string;code:string;}
const mutation=(s:Session)=>({Cookie:s.cookie,'X-CSRF-Token':s.csrf});
async function time(t:number){now=t;await SELF.fetch(origin+'/__control/time',{method:'POST',body:JSON.stringify({now})});}
async function begin(i?:Invite,browser?:string):Promise<Flow>{let proof:string|undefined;if(i){const r=await call('/api/auth/invitations/validate','POST',{code:i.code},browser?{Cookie:browser}:{});expect(r.status).toBe(200);browser=cookie(r);proof=(await r.json() as {invite_validation_id:string}).invite_validation_id;}const r=await call('/api/auth/start','POST',{purpose:i?'signup':'login',...(proof?{invitation_validation_id:proof}:{})},browser?{Cookie:browser}:{});expect(r.status).toBe(200);return {...await r.json() as {flow:string;nonce:string},cookie:cookie(r)};}
const send=(f:Flow,email:string,id=crypto.randomUUID())=>call('/api/auth/email/send','POST',{flow_id:f.flow,email,client_request_id:id},{Cookie:f.cookie});
async function code(email:string){const b=await (await SELF.fetch(origin+'/__control/code?email='+encodeURIComponent(email))).json() as {code?:string};expect(Boolean(b.code)).toBe(true);return b.code!;}
const complete=(f:Flow,otp:string,headers:Record<string,string>={})=>call('/api/auth/complete','POST',{flow:f.flow,nonce:f.nonce,otp},{Cookie:f.cookie,...headers});
async function login(email:string,i?:Invite){const f=await begin(i);expect((await send(f,email)).status).toBe(200);const r=await complete(f,await code(email));expect(r.status).toBe(200);const c=cookie(r),s=await (await call('/api/session','GET',undefined,{Cookie:c})).json() as {csrf_token:string};return {cookie:c,csrf:s.csrf_token};}
async function admin(){const s=await login('admin@fixture.example');expect((await call('/api/admin/bootstrap','POST',{confirm:true},mutation(s))).status).toBe(200);return s;}
async function invite(s:Session){const r=await call('/api/admin/invitations','POST',{},mutation(s));expect(r.status).toBe(201);return await r.json() as Invite;}
async function calls(){return (await (await SELF.fetch(origin+'/__control/metrics')).json() as {calls:number}).calls;}
async function enable(){await records(async tx=>{const store=new SettingsStore(tx);await store.init(now);const r=await store.read(),settings=structuredClone(r.settings);settings.deployment.enabled=true;settings.private.anonymousEnabled=true;settings.private.persistenceAllowed=true;await store.stateSave({...await store.state(),budget_ready:true,lifecycle_ready:true});await store.update(r.revision,settings,'fixture-actor',now);});}
async function grant(s?:Session,ip='192.0.2.1'){
 const headers={...(s?mutation(s):{}),'X-Test-IP':ip},r=await call('/api/private/create-context','POST',{},headers);expect(r.status).toBe(200);const ctx=await r.json() as {nonce:string;can_persist_private:boolean};const contextCookie=cookie(r);
 const granted=await call('/api/private/create-grants','POST',{nonce:ctx.nonce,risk_ack:true,risk_ack_version:'toktok-risk-v1'},{...headers,Cookie:[contextCookie,s?.cookie].filter(Boolean).join('; ')});expect(granted.status).toBe(200);return {token:(await granted.json() as {creation_grant:string}).creation_grant,cookie:contextCookie,can_persist:ctx.can_persist_private};
}
const creation=async(grantToken?:string,id=crypto.randomUUID(),ip='192.0.2.1',extra:object={})=>direct('create-reserve',{ip,creation:{body:{purpose:'창작 비공개 대화',client_request_id:id,...extra},grant_hash:grantToken?await hash(grantToken):undefined,invite_hash:await hash(newToken()),read_hash:await hash(newToken()),owner_hash:await hash(newToken())}},true);
it('Repository seeds once, preserves DB/HMAC/accounts, and rejects an enabled installation without ready code',async()=>{
 const r=await call('/api/config');expect(r.status).toBe(200);expect((await r.json() as {enabled:boolean}).enabled).toBe(false);
 await records(async tx=>{const store=new SettingsStore(tx),old=await store.read();old.settings.signup.policy='closed';await store.update(old.revision,old.settings,'fixture-actor',now);});
 const preserved=await runInDurableObject(stub(),async(_i,state)=>{const repo=new CloudflareRepository(state.storage),before=await repo.transaction('control',async tx=>tx.get(C.settings,'hmac'));const profile=structuredClone(DEFAULT_SETTINGS);profile.deployment.enabled=true;const core=new ControlCore(repo,{installation:{profile,enforcement_version:1}});await core.execute('config',{now});return repo.transaction('control',async tx=>({same_key:JSON.stringify(before)===JSON.stringify(await tx.get(C.settings,'hmac')),signup:(await new SettingsStore(tx).read()).settings.signup.policy,accounts:(await tx.list(C.accounts,{prefix:'a:',limit:1})).length}));});expect(preserved).toEqual({same_key:true,signup:'closed',accounts:0});
 await runInDurableObject(stub(),async(_i,state)=>{await state.storage.deleteAll();const repo=new CloudflareRepository(state.storage);await repo.apply();const profile=structuredClone(DEFAULT_SETTINGS);profile.deployment.enabled=true;
  await expect(new ControlCore(repo,{installation:{profile,enforcement_version:1}}).execute('config',{now})).rejects.toMatchObject({code:'ENFORCEMENT_NOT_READY'});
  const valid=new ControlCore(repo,{installation:{profile,enforcement_version:1},enforcement:connected});expect((await valid.execute('config',{now}) as {enabled:boolean}).enabled).toBe(true);
  const result=await repo.transaction('control',async tx=>({role_grants:(await tx.list(C.accounts,{limit:1})).length,state:await new SettingsStore(tx).state()}));expect(result.role_grants).toBe(0);expect(result.state.budget_ready).toBe(true);
 });
});
it('Repository bootstrap/CAS/admin guards preserve 403/409 and exclude identity or secret data from audit',async()=>{
 const s=await login('admin@fixture.example');expect((await call('/api/admin/settings?fixtureRole=admin','GET',undefined,mutation(s))).status).toBe(403);
 const approvals=await Promise.all([call('/api/admin/bootstrap','POST',{confirm:true},mutation(s)),call('/api/admin/bootstrap','POST',{confirm:true},mutation(s))]);expect(approvals.map(r=>r.status).sort()).toEqual([200,403]);
 const current=await (await call('/api/admin/settings','GET',undefined,mutation(s))).json() as {revision:number;settings:typeof DEFAULT_SETTINGS};current.settings.identity.emailLimits.month=9000;
 expect((await call('/api/admin/settings','PUT',{expected_revision:current.revision,settings:current.settings},{Cookie:s.cookie})).status).toBe(403);
 const outcomes=await Promise.all([call('/api/admin/settings','PUT',{expected_revision:current.revision,settings:current.settings},mutation(s)),call('/api/admin/settings','PUT',{expected_revision:current.revision,settings:current.settings},mutation(s))]);expect(outcomes.map(r=>r.status).sort()).toEqual([200,409]);
 const audit=await (await call('/api/admin/audit','GET',undefined,mutation(s))).text();expect(['@fixture.example','token_hash','session_hash','otp','csrf'].some(v=>audit.includes(v))).toBe(false);
 const tables=await runInDurableObject(stub(),(_i,state)=>state.storage.sql.exec("SELECT name FROM sqlite_master WHERE name IN ('agents','accounts','auth_transactions','tok_records')").toArray().map(r=>r.name));expect(tables).toEqual(['tok_records']);
});
it('Repository OTP dedupe and invite success use one transaction: browser/nonce denial and two flows admit one account',async()=>{
 const s=await admin(),i=await invite(s),a=await begin(i),b=await begin(i);
 const duplicates=await Promise.all([send(a,'first@fixture.example','same'),send(a,'first@fixture.example','same')]);expect(duplicates.every(r=>r.status===200)).toBe(true);expect(await calls()).toBe(2);
 expect((await send(a,'different@fixture.example','same')).status).toBe(409);expect((await send(b,'second@fixture.example')).status).toBe(200);
 const otp=await code('first@fixture.example');expect((await complete(a,otp,{Cookie:'__Host-toktok-flow='+newToken()})).status).toBe(403);expect((await complete({...a,nonce:newToken()},otp)).status).toBe(403);
 const outcomes=await Promise.all([complete(a,otp),complete(b,await code('second@fixture.example'))]);expect(outcomes.filter(r=>r.status===200).length).toBe(1);
 expect(await records(async tx=>(await tx.list(C.accounts,{prefix:'a:',limit:10})).length)).toBe(2);expect(await records(async tx=>(await tx.get(C.invitations,'i:'+i.id))?.status)).toBe('used');
});
it('Repository five wrong OTPs commit attempts without consuming invite, and a valid session adds claim with no mail',async()=>{
 const s=await admin(),i=await invite(s),f=await begin(i);expect((await send(f,'member@fixture.example')).status).toBe(200);const otp=await code('member@fixture.example'),wrong=otp==='000000'?'999999':'000000';
 expect((await Promise.all(Array.from({length:5},()=>complete(f,wrong)))).every(r=>r.status===401)).toBe(true);expect((await complete(f,otp)).status).toBe(401);expect(await records(async tx=>(await tx.get(C.invitations,'i:'+i.id))?.status)).toBe('active');
 const before=await calls(),registration=await call('/api/agents','POST',{name:'창작 agent'});expect(registration.status).toBe(201);const a=await registration.json() as {agent:{id:string};agent_token:string;claim_url:string};const cap=new URL(a.claim_url).pathname.split('/').at(-1)!;
 expect((await call('/api/claims/'+a.agent.id+'/approve','POST',{risk_ack_version:'toktok-risk-v1'},{...mutation(s),Authorization:'Bearer '+cap})).status).toBe(200);expect(await calls()).toBe(before);
 const ownerAck=await (await call('/api/session','GET',undefined,{Cookie:s.cookie})).json() as {owner_ack:{confirmed_at:number}};await time(now+10000);const auth=await direct('creator',{token_hash:await hash(a.agent_token)});expect(auth.status).toBe(200);expect((auth.value as {principal:{owner_ack:{confirmed_at:number}}}).principal.owner_ack.confirmed_at).toBe(ownerAck.owner_ack.confirmed_at);
});
it('Repository budget atomically reserves both UTC windows and preserves conflict/replay/expiry across a month boundary',async()=>{
 await call('/api/config');await records(async tx=>{await save(tx,C.budgets,'usage:private_creates:d:2030-01-01',{used:99});await save(tx,C.budgets,'usage:private_creates:m:2030-01',{used:1999});});
 const ids=Array.from({length:3},()=>newBudgetOperation(now,now+60000));const outcomes=await Promise.all(ids.map(operation_id=>direct('budget-reserve',{operation_id,kind:'private_creates',amount:1})));expect(outcomes.map(r=>r.status).sort()).toEqual([200,429,429]);const winner=ids[outcomes.findIndex(r=>r.status===200)];expect((await direct('budget-reserve',{operation_id:winner,kind:'private_creates',amount:2})).status).toBe(409);
 await time(now+60000);expect((await direct('budget-reserve',{operation_id:winner,kind:'private_creates',amount:1})).status).toBe(410);
 await time(Date.UTC(2030,0,31,23,59,59));const crossing=newBudgetOperation(now,now+60000);expect((await direct('budget-reserve',{operation_id:crossing,kind:'email_attempts',amount:1})).status).toBe(200);await time(now+2000);const replay=await direct('budget-reserve',{operation_id:crossing,kind:'email_attempts',amount:1});expect(replay.status).toBe(200);expect((replay.value as {month:string}).month).toBe('2030-01');
});
it('create context requires actual acknowledgement; anonymous persist is denied; pending/active/global slots and lost result stay idempotent',async()=>{
 await call('/api/config');await enable();const g=await grant(),id=crypto.randomUUID();expect(g.can_persist).toBe(false);
 const denied=await creation(g.token,id,'192.0.2.2',{persist:true});expect(denied.status).toBe(403);
 const first=await creation(g.token,id,'192.0.2.2');expect(first.status).toBe(200);const data=first.value as {room_id:string;snapshot:{creator_ack:{kind:string;owner_account_id:string|null};persist:boolean;expires_at:number}};expect(data.snapshot.persist).toBe(false);expect(data.snapshot.creator_ack.kind).toBe('anonymous_declaration');expect(data.snapshot.creator_ack.owner_account_id).toBe(null);
 const repeat=await creation(g.token,id,'192.0.2.2');expect(repeat.status).toBe(409);expect(repeat.code).toBe('CREATE_PENDING');expect(repeat.room_id).toBe(data.room_id);
 expect((await creation(g.token,id,'192.0.2.2',{purpose:'다른 내용'})).code).toBe('IDEMPOTENCY_CONFLICT');
 expect((await direct('create-commit',{creation_commit:{room_id:data.room_id,proof:'initialized'}},true)).status).toBe(200);const lost=await creation(g.token,id,'192.0.2.2');expect(lost.code).toBe('CREATE_RESULT_NOT_RECOVERABLE');
 expect((await records(async tx=>new SettingsStore(tx).state())).active_private).toBe(1);expect((await direct('create-commit',{creation_commit:{room_id:data.room_id,proof:'closed'}},true)).status).toBe(200);expect((await records(async tx=>new SettingsStore(tx).state())).active_private).toBe(0);
 const stored=await records(async tx=>JSON.stringify((await tx.list(C.settings,{limit:100})).map(r=>r.value)));expect(stored.includes(g.token)).toBe(false);expect(stored.includes('192.0.2.2')).toBe(false);
 const blocked=await call('/api/private/create-context','POST',{}, {Origin:''});expect(blocked.status).toBe(403);
});
it('account explicit grant allows only DB-entitled new persist snapshots and grant/global reservations have one concurrent winner',async()=>{
 const s=await admin(),member=await login('member@fixture.example',await invite(s));await enable();const g=await grant(member);expect(g.can_persist).toBe(true);
 const first=await creation(g.token,crypto.randomUUID(),'192.0.2.2',{persist:true});expect(first.status).toBe(200);const room=first.value as {room_id:string;snapshot:{retention_seconds:number;creator_ack:{kind:string;owner_account_id:string|null}}};expect(room.snapshot.retention_seconds).toBe(86400);expect(room.snapshot.creator_ack.kind).toBe('account_confirmation');expect(Boolean(room.snapshot.creator_ack.owner_account_id)).toBe(true);
 const another=await grant(member),bad=await creation(another.token,crypto.randomUUID(),'192.0.2.2',{persist:true,ttl_seconds:3600});expect(bad.status).toBe(422);
 await records(async tx=>{const store=new SettingsStore(tx),r=await store.read();r.settings.private.activeGlobal=2;r.settings.private.activePerIp=2;await store.update(r.revision,r.settings,'fixture',now);});
 const a=await grant(undefined,'192.0.2.3'),b=await grant(undefined,'192.0.2.4');const race=await Promise.all([creation(a.token,crypto.randomUUID(),'192.0.2.5'),creation(b.token,crypto.randomUUID(),'192.0.2.6')]);expect(race.map(r=>r.status).sort()).toEqual([200,429]);
 expect((await records(async tx=>new SettingsStore(tx).state())).active_private).toBe(2);
 await direct('create-commit',{creation_commit:{room_id:room.room_id,proof:'closed'}},true);
 const same=await Promise.all([creation(another.token,crypto.randomUUID(),'192.0.2.7'),creation(another.token,crypto.randomUUID(),'192.0.2.8')]);expect(same.map(r=>r.status).sort()).toEqual([200,403]);expect((await records(async tx=>new SettingsStore(tx).state())).active_private).toBe(2);
});
it('private creation expiry releases pending slots and keeps mode drain/readiness and policy bounds fail closed',async()=>{
 await call('/api/config');expect((await creation()).code).toBe('OPERATOR_ACK_REQUIRED');await enable();const g=await grant(),first=await creation(g.token,crypto.randomUUID(),'192.0.2.1',{ttl_seconds:60});expect(first.status).toBe(200);const room=first.value as {room_id:string};
 const guarded=await records(async tx=>{const store=new SettingsStore(tx),r=await store.read();r.settings.deployment.mode='hosted';try{await store.update(r.revision,r.settings,'fixture',now);return 'allowed';}catch(e){return (e as {code:string}).code;}});expect(guarded).toBe('MODE_DRAIN_REQUIRED');
 await time(now+60000);expect((await direct('create-pending')).status).toBe(200);expect((await records(async tx=>new SettingsStore(tx).state())).active_private).toBe(0);expect((await direct('create-commit',{creation_commit:{room_id:room.room_id,proof:'initialized'}},true)).status).toBe(410);
 for(const n of [1,10001])expect(()=>validateSettings({...DEFAULT_SETTINGS,public:{...DEFAULT_SETTINGS.public,policy:{...DEFAULT_SETTINGS.public.policy,batchMs:n}}})).toThrow();expect(()=>validateSettings({...DEFAULT_SETTINGS,public:{...DEFAULT_SETTINGS.public,firstWindowSeconds:301}})).toThrow();
 expect(()=>validateSettings({...DEFAULT_SETTINGS,private:{...DEFAULT_SETTINGS.private,defaultPersist:true}})).toThrow();
 const policy={...DEFAULT_SETTINGS.private.policy,handlers:160,bodyInflight:16};expect(validateSettings({...DEFAULT_SETTINGS,private:{...DEFAULT_SETTINGS.private,policy}}).private.policy).toEqual(policy);
 for(const invalid of [{...policy,handlers:161},{...policy,bodyInflight:17},{...policy,handlers:1},{...policy,handlers:8,waits:1,bodyInflight:9}])expect(()=>validateSettings({...DEFAULT_SETTINGS,private:{...DEFAULT_SETTINGS.private,policy:invalid}})).toThrow();
});
