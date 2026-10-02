import {SELF,runInDurableObject} from 'cloudflare:test';
import {env} from 'cloudflare:workers';
import {it,expect,beforeEach,afterEach} from 'vitest';
import {SettingsStore} from '../src/settings-store';
import {DEFAULT_SETTINGS,validateSettings} from '../src/settings-schema';
import {authorizePrivatePersistence,newBudgetOperation,type CreatorPrincipal,type Account,entitlements} from '../src/control-policy';
import {hash,newToken} from '../src/http';
const origin='http://localhost:8787';
const stub=():DurableObjectStub=>env.IDENTITIES.get(env.IDENTITIES.idFromName('team'));
const disabled=():DurableObjectStub=>(env as unknown as {DISABLED_IDENTITIES:DurableObjectNamespace}).DISABLED_IDENTITIES.get((env as unknown as {DISABLED_IDENTITIES:DurableObjectNamespace}).DISABLED_IDENTITIES.idFromName('team'));
const sql=(query:string,...args:(string|number)[])=>runInDurableObject(stub(),(_i,s)=>s.storage.sql.exec(query,...args).toArray());
let now:number;let evidence:{path:string;status:number;code?:string;retry_after:string|null}[]=[];
beforeEach(async()=>{
 for(const s of [stub(),disabled()])await runInDurableObject(s,async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();});
 await SELF.fetch(origin+'/__control/reset',{method:'POST'});now=Date.UTC(2030,0,1);evidence=[];
});
afterEach(()=>{console.info('TOKTOK_CONTROL_HTTP',JSON.stringify(evidence));});
async function call(path:string,method='GET',payload?:unknown,headers:Record<string,string>={}){
 const response=await SELF.fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await response.clone().json() as {error?:{code:string}};evidence.push({path:path.split('?')[0].replace(/[a-f0-9-]{36}/g,'<id>'),status:response.status,code:data.error?.code,retry_after:response.headers.get('Retry-After')});return response;
}
async function time(value:number){now=value;await SELF.fetch(origin+'/__control/time',{method:'POST',body:JSON.stringify({now})});}
const cookie=(r:Response)=>r.headers.get('Set-Cookie')!.split(';')[0];
interface Flow {flow:string;nonce:string;cookie:string;}
interface Session {cookie:string;csrf:string;}
interface Invite {id:string;code:string;}
const mutation=(s:Session)=>({Cookie:s.cookie,'X-CSRF-Token':s.csrf});
async function begin(purpose='login',invite?:Invite,browser?:string):Promise<Flow>{
 let validation:string|undefined;
 if(invite){const r=await call('/api/auth/invitations/validate','POST',{code:invite.code},browser?{Cookie:browser}:{});expect(r.status).toBe(200);browser=cookie(r);validation=(await r.json() as {invite_validation_id:string}).invite_validation_id;}
 const r=await call('/api/auth/start','POST',{purpose,...(validation?{invitation_validation_id:validation}:{})},browser?{Cookie:browser}:{});expect(r.status).toBe(200);return {...await r.json() as {flow:string;nonce:string},cookie:cookie(r)};
}
async function send(f:Flow,email:string,id=crypto.randomUUID()){return call('/api/auth/email/send','POST',{flow_id:f.flow,email,client_request_id:id},{Cookie:f.cookie});}
async function code(email:string){const r=await SELF.fetch(origin+'/__control/code?email='+encodeURIComponent(email));const b=await r.json() as {code?:string};expect(Boolean(b.code)).toBe(true);return b.code!;}
async function complete(f:Flow,otp:string,headers:Record<string,string>={}){return call('/api/auth/complete','POST',{flow:f.flow,nonce:f.nonce,otp},{Cookie:f.cookie,...headers});}
async function login(email:string,invite?:Invite){const f=await begin(invite?'signup':'login',invite);const sent=await send(f,email);expect(sent.status).toBe(200);const r=await complete(f,await code(email));expect(r.status).toBe(200);const c=cookie(r);const s=await (await call('/api/session','GET',undefined,{Cookie:c})).json() as {csrf_token:string};return {cookie:c,csrf:s.csrf_token};}
async function admin(){const s=await login('admin@fixture.test');expect((await call('/api/admin/bootstrap','POST',{confirm:true},mutation(s))).status).toBe(200);return s;}
async function invite(s:Session,ttl_seconds?:number){const r=await call('/api/admin/invitations','POST',ttl_seconds?{ttl_seconds}:{},mutation(s));expect(r.status).toBe(201);return await r.json() as Invite;}
async function config(s:Session){const r=await call('/api/admin/settings','GET',undefined,mutation(s));expect(r.status).toBe(200);return await r.json() as {revision:number;settings:typeof DEFAULT_SETTINGS};}
async function update(s:Session,settings:typeof DEFAULT_SETTINGS,revision:number){return call('/api/admin/settings','PUT',{expected_revision:revision,settings},mutation(s));}
async function calls(){return (await (await SELF.fetch(origin+'/__control/metrics')).json() as {calls:number}).calls;}
it('requires a real session for admin settings and schema (fixture role is not authority)',async()=>{
 for(const path of ['/api/admin/settings?fixtureRole=admin','/api/admin/settings/schema'])expect((await call(path)).status).toBe(401);
});
it('seeds disabled DB settings once, retains changes on fresh store initialization, and fails closed on corrupt DB',async()=>{
 await begin();const rows=await sql('SELECT settings FROM control_settings WHERE id=1');const settings=JSON.parse(String(rows[0].settings));expect(settings.deployment).toEqual({mode:'demo',enabled:false});expect(settings.signup.policy).toBe('invite');
 settings.signup.policy='closed';await sql('UPDATE control_settings SET revision=2,settings=?',JSON.stringify(settings));
 await runInDurableObject(stub(),(_i,s)=>new SettingsStore(s.storage).init());expect((await (await call('/api/config')).json() as {revision:number;signup:string}).signup).toBe('closed');
 await sql('UPDATE control_settings SET settings=?','broken');expect((await call('/api/config')).status).toBe(503);expect((await sql('SELECT settings FROM control_settings'))[0].settings).toBe('broken');
});
it('rejects missing invite with INVALID_INVITATION before email stage and denies bootstrap Origin/edge before malformed body',async()=>{
 const response=await call('/api/auth/invitations/validate','POST',{code:''});expect(response.status).toBe(400);expect((await response.json() as {error:{code:string}}).error.code).toBe('INVALID_INVITATION');
 for(const Origin of ['', 'null','https://other.fixture.test'])expect((await call('/api/auth/start','POST',{purpose:'login'},{Origin})).status).toBe(403);
 const edge=await SELF.fetch(origin+'/api/auth/invitations/validate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Test-Edge':'deny'},body:'{broken'});expect(edge.status).toBe(429);expect((await edge.json() as {error:{code:string}}).error.code).toBe('RATE_LIMITED');expect(await calls()).toBe(0);
});
it('returns a secret-free unauthenticated session projection',async()=>{
 const response=await call('/api/session');expect(response.status).toBe(200);expect(await response.json()).toEqual({authenticated:false,role:'anonymous',entitlements:{can_create_private:false,can_persist_private:false},csrf_token:null,owner_ack:null});
});
it('bootstraps the exact OTP identity only after confirm, once under concurrency, and remains consumed after logout',async()=>{
 const unknown=await begin();expect((await send(unknown,'other@fixture.test')).status).toBe(200);expect(await calls()).toBe(0);
 const s=await login('admin@fixture.test');expect((await call('/api/admin/settings','GET',undefined,mutation(s))).status).toBe(403);
 expect((await call('/api/admin/bootstrap','POST',{confirm:false},mutation(s))).status).toBe(403);
 const outcomes=await Promise.all([call('/api/admin/bootstrap','POST',{confirm:true},mutation(s)),call('/api/admin/bootstrap','POST',{confirm:true},mutation(s))]);expect(outcomes.map(r=>r.status).sort()).toEqual([200,403]);
 expect((await sql('SELECT bootstrap_consumed FROM control_state'))[0].bootstrap_consumed).toBe(1);
 const projected=await (await call('/api/session','GET',undefined,{Cookie:s.cookie})).text();expect(projected.includes('admin@fixture.test')).toBe(false);expect(projected.includes('owner_id')).toBe(false);
 const ids=await sql('SELECT id FROM accounts');expect(String(ids[0].id)).toMatch(/^[a-f0-9-]{36}$/);
 expect((await call('/api/auth/logout','POST',{},mutation(s))).status).toBe(200);expect((await call('/api/admin/settings','GET',undefined,mutation(s))).status).toBe(401);
 await time(now+120000);const again=await login('admin@fixture.test');expect((await call('/api/admin/bootstrap','POST',{confirm:true},mutation(again))).status).toBe(403);
});
it('missing bootstrap env cannot grant admin even to a fixture verified session',async()=>{
 const ds=disabled(),token=newToken(),csrf=newToken();await ds.fetch(new Request('https://identity/config',{method:'POST',body:'{}'}));
 await runInDurableObject(ds,(_i,s)=>{s.storage.sql.exec("INSERT INTO accounts VALUES(?,?,?,?,1,'member','bootstrap',1,1)",crypto.randomUUID(),'email-otp','admin@fixture.test','admin@fixture.test');s.storage.sql.exec('INSERT INTO sessions SELECT ?,id,?,? FROM accounts',token,csrf,Date.UTC(2030,0,2));});
 const r=await ds.fetch(new Request('https://identity/admin-bootstrap',{method:'POST',body:JSON.stringify({session_hash:token,csrf,confirm:true,now})}));expect(r.status).toBe(403);
});
it('admin mutation requires Origin/CSRF/DB role; concurrent CAS has one winner and audit contains no secrets',async()=>{
 const s=await admin(),member=await login('member@fixture.test',await invite(s));
 expect((await call('/api/admin/settings?fixtureRole=admin','GET',undefined,mutation(member))).status).toBe(403);
 const initial=await config(s),next=structuredClone(initial.settings);next.identity.emailLimits.month=9000;
 expect((await call('/api/admin/settings','PUT',{expected_revision:initial.revision,settings:next},{Cookie:s.cookie})).status).toBe(403);
 expect((await call('/api/admin/settings','PUT',{expected_revision:initial.revision,settings:next},{...mutation(s),Origin:''})).status).toBe(403);
 expect((await update(member,next,initial.revision)).status).toBe(403);
 const writes=await Promise.all([update(s,next,initial.revision),update(s,next,initial.revision)]);expect(writes.map(r=>r.status).sort()).toEqual([200,409]);
 const audit=await call('/api/admin/audit','GET',undefined,mutation(s)),raw=await audit.text();for(const secret of ['@fixture.test','token_hash','session_hash','csrf','claim_hash'])expect(raw.includes(secret)).toBe(false);
 expect((await call('/api/admin/audit?limit=51','GET',undefined,mutation(s))).status).toBe(400);
});
it('typed schema rejects spoofed readiness/unknown fields/unsafe bounds and guards enable/mode drain without rewriting settings',async()=>{
 const s=await admin(),initial=await config(s),base=initial.settings;
 const next=structuredClone(base);next.private.persistenceAllowed=true;expect((await update(s,next,initial.revision)).status).toBe(200);
 let current=await config(s);const enabled=structuredClone(current.settings);enabled.deployment.enabled=true;expect((await update(s,enabled,current.revision)).status).toBe(409);
 const hosted=structuredClone(current.settings);hosted.deployment.mode='hosted';hosted.signup.policy='open';expect((await update(s,hosted,current.revision)).status).toBe(409);
 await sql('UPDATE control_state SET lifecycle_ready=1,active_private=1');expect((await update(s,hosted,current.revision)).status).toBe(409);
 await sql('UPDATE control_state SET active_private=0');expect((await update(s,hosted,current.revision)).status).toBe(200);
 for(const corrupt of [{...base,readiness:true},{...base,budget:{...base.budget,workloadCaps:[]}},{...base,public:{...base.public,policy:{...base.public.policy,participants:101}}},{...base,identity:{...base.identity,otpAttempts:6}},{...base,signup:{policy:'open'}}])expect(()=>validateSettings(corrupt)).toThrow();
 for(const number of [NaN,Infinity,1.5])expect(()=>validateSettings({...base,private:{...base.private,activeGlobal:number}})).toThrow();
 const schema=await call('/api/admin/settings/schema','GET',undefined,mutation(s));expect(schema.status).toBe(200);const raw=await schema.text();expect(raw.includes('applyTo')).toBe(true);expect(raw.includes('ADMIN_BOOTSTRAP_EMAIL')).toBe(false);
});
it('invite validation binds browser and one flow, email stays fixed and completed flow cannot replay',async()=>{
 const s=await admin(),i=await invite(s),validation=await call('/api/auth/invitations/validate','POST',{code:i.code});const v=await validation.json() as {invite_validation_id:string};
 const denied=await call('/api/auth/start','POST',{purpose:'signup',invitation_validation_id:v.invite_validation_id},{Cookie:'__Host-toktok-flow='+newToken()});expect(denied.status).toBe(400);
 const accepted=await call('/api/auth/start','POST',{purpose:'signup',invitation_validation_id:v.invite_validation_id},{Cookie:cookie(validation)});expect(accepted.status).toBe(200);const f={...await accepted.json() as {flow:string;nonce:string},cookie:cookie(accepted)};
 expect((await call('/api/auth/start','POST',{purpose:'signup',invitation_validation_id:v.invite_validation_id},{Cookie:cookie(validation)})).status).toBe(400);
 expect((await send(f,'member@fixture.test','one')).status).toBe(200);expect((await send(f,'changed@fixture.test','two')).status).toBe(409);
 const otp=await code('member@fixture.test');expect((await complete(f,otp,{Cookie:'__Host-toktok-flow='+newToken()})).status).toBe(403);expect((await complete({...f,nonce:newToken()},otp)).status).toBe(403);
 expect((await complete(f,otp)).status).toBe(200);expect((await complete(f,otp)).status).toBe(409);
});
it('two signup flows race one invitation: OTP success atomically consumes invitation and admits only one account',async()=>{
 const s=await admin(),i=await invite(s),a=await begin('signup',i),b=await begin('signup',i);expect((await send(a,'one@fixture.test')).status).toBe(200);expect((await send(b,'two@fixture.test')).status).toBe(200);
 const results=await Promise.all([complete(a,await code('one@fixture.test')),complete(b,await code('two@fixture.test'))]);expect(results.filter(r=>r.status===200).length).toBe(1);
 expect((await sql('SELECT COUNT(*) AS n FROM accounts'))[0].n).toBe(2);expect((await sql('SELECT status FROM invitations'))[0].status).toBe('used');expect((await sql('SELECT SUM(consumed) AS n FROM auth_transactions'))[0].n).toBe(2);
 expect((await call('/api/auth/invitations/validate','POST',{code:i.code})).status).toBe(400);
});
it('expired/revoked invitation blocks next step and five concurrent wrong OTPs do not consume an active invitation',async()=>{
 const s=await admin(),expired=await invite(s,1);await time(now+1000);expect((await call('/api/auth/invitations/validate','POST',{code:expired.code})).status).toBe(400);
 const revoked=await invite(s);expect((await call('/api/admin/invitations/'+revoked.id+'/revoke','POST',{},mutation(s))).status).toBe(200);expect((await call('/api/auth/invitations/validate','POST',{code:revoked.code})).status).toBe(400);
 const active=await invite(s),f=await begin('signup',active);expect((await send(f,'member@fixture.test')).status).toBe(200);const otp=await code('member@fixture.test'),wrong=otp==='000000'?'999999':'000000';
 const results=await Promise.all(Array.from({length:5},()=>complete(f,wrong)));expect(results.every(r=>r.status===401)).toBe(true);expect((await complete(f,otp)).status).toBe(401);expect((await sql('SELECT status FROM invitations WHERE id=?',active.id))[0].status).toBe('active');
});
it('existing member login needs no invitation; signup as existing member neither consumes invitation nor adds entitlement',async()=>{
 const s=await admin();await login('member@fixture.test',await invite(s));await sql('UPDATE accounts SET can_persist_private=0 WHERE email=?','member@fixture.test');
 await time(now+120000);const existing=await login('member@fixture.test'),projection=await (await call('/api/session','GET',undefined,{Cookie:existing.cookie})).json() as {entitlements:{can_persist_private:boolean}};expect(projection.entitlements.can_persist_private).toBe(false);
 await time(now+3600000);const unused=await invite(s);await login('member@fixture.test',unused);expect((await sql('SELECT status FROM invitations WHERE id=?',unused.id))[0].status).toBe('active');expect((await sql('SELECT can_persist_private FROM accounts WHERE email=?','member@fixture.test'))[0].can_persist_private).toBe(0);
});
it('DB account entitlement gates DEMO private opt-in; anonymous/public/spoofed flags and retention greater than room TTL are rejected',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS);settings.private.persistenceAllowed=true;settings.private.anonymousEnabled=true;
 const principal:CreatorPrincipal={authenticated:true,creator_authorized:true,entitlements:{can_create_private:true,can_persist_private:true},owner_ack:{version:'toktok-risk-v1',confirmed_at:1}};
 const memory=authorizePrivatePersistence(settings,principal,{visibility:'private'});expect(memory.persist).toBe(false);expect(memory.ttl_seconds).toBe(86400);expect(memory.retention_seconds).toBe(null);
 expect(authorizePrivatePersistence(settings,principal,{visibility:'private',persist:true}).retention_seconds).toBe(86400);
 expect(()=>authorizePrivatePersistence(settings,{...principal,entitlements:{can_create_private:true,can_persist_private:false}},{visibility:'private',persist:true})).toThrow();
 expect(()=>authorizePrivatePersistence(settings,principal,{visibility:'public',persist:true})).toThrow();expect(()=>authorizePrivatePersistence(settings,{...principal,authenticated:false},{visibility:'private',persist:true})).toThrow();
 expect(authorizePrivatePersistence(settings,{...principal,authenticated:false},{visibility:'private'}).ttl_seconds).toBe(3600);
 expect(()=>authorizePrivatePersistence(settings,principal,{visibility:'private',persist:true,ttl_seconds:3600,retention_seconds:86400})).toThrowError(expect.objectContaining({status:422}));
 expect(()=>authorizePrivatePersistence(settings,principal,{visibility:'private',persist:true,retention_seconds:2592000})).toThrow();
 const hostedAccount={email_verified:1,can_create_private:1,can_persist_private:1,admission_kind:'hosted'} as Account;expect(entitlements(settings,hostedAccount).can_persist_private).toBe(false);
});
it('lowering email cap preserves issued OTP/session, permits additional claim with mail0 and reevaluates revoked creator authority',async()=>{
 const s=await admin(),i=await invite(s),f=await begin('signup',i);expect((await send(f,'member@fixture.test')).status).toBe(200);const otp=await code('member@fixture.test');
 const initial=await config(s),next=structuredClone(initial.settings);next.identity.emailLimits.month=1;expect((await update(s,next,initial.revision)).status).toBe(200);
 const completeResponse=await complete(f,otp);expect(completeResponse.status).toBe(200);const sessionCookie=cookie(completeResponse),projection=await (await call('/api/session','GET',undefined,{Cookie:sessionCookie})).json() as {csrf_token:string};
 const member={cookie:sessionCookie,csrf:projection.csrf_token},registered=await call('/api/agents','POST',{name:'창작 에이전트'});expect(registered.status).toBe(201);const a=await registered.json() as {agent:{id:string};agent_token:string;claim_url:string};const cap=new URL(a.claim_url).pathname.split('/').at(-1)!;
 expect((await call('/api/claims/'+a.agent.id+'/approve','POST',{risk_ack_version:'toktok-risk-v1'},{...mutation(member),Authorization:'Bearer '+cap})).status).toBe(200);
 const auth=await stub().fetch(new Request('https://identity/creator',{method:'POST',body:JSON.stringify({token_hash:await hash(a.agent_token),now})}));expect(auth.status).toBe(200);expect(await calls()).toBe(2);
 expect((await call('/api/agents/'+a.agent.id+'/revoke','POST',{},mutation(member))).status).toBe(200);expect((await stub().fetch(new Request('https://identity/creator',{method:'POST',body:JSON.stringify({token_hash:await hash(a.agent_token),now})}))).status).toBe(403);
});
it('server budget reserves UTC day+month atomically, dedupes cross-month retry, rejects conflicts and expired IDs without reset',async()=>{
 await begin();const day='2030-01-01',month='2030-01';await sql('INSERT INTO budget_usage VALUES(?,?,?)','private_creates','d:'+day,99);await sql('INSERT INTO budget_usage VALUES(?,?,?)','private_creates','m:'+month,1999);
 const ids=Array.from({length:3},()=>newBudgetOperation(now,now+60000));const reserve=(operation_id:string,amount=1,kind='private_creates')=>stub().fetch(new Request('https://identity/budget-reserve',{method:'POST',body:JSON.stringify({operation_id,kind,amount,now})}));
 const results=await Promise.all(ids.map(id=>reserve(id)));expect(results.map(r=>r.status).sort()).toEqual([200,429,429]);const winner=ids[results.findIndex(r=>r.status===200)];expect((await reserve(winner)).status).toBe(200);expect((await reserve(winner,2)).status).toBe(409);
 expect((await sql('SELECT used FROM budget_usage ORDER BY window')).map(r=>r.used)).toEqual([100,2000]);
 await time(now+60000);expect((await reserve(winner)).status).toBe(410);
 await time(Date.UTC(2030,0,31,23,59,59));const prior=newBudgetOperation(now,now+60000);expect((await reserve(prior,1,'email_attempts')).status).toBe(200);await time(now+2000);const replay=await reserve(prior,1,'email_attempts');expect(replay.status).toBe(200);expect((await replay.json() as {month:string}).month).toBe('2030-01');
 expect((await reserve(newBudgetOperation(now,now+60000),1,'email_attempts')).status).toBe(200);expect((await sql("SELECT used FROM budget_usage WHERE window='m:2030-02'"))[0].used).toBe(1);
});
it('validates the fixed public response envelope and bounded initial-window/batch relations',()=>{
 const base=structuredClone(DEFAULT_SETTINGS);expect(validateSettings(base)).toEqual(base);
 for(const change of [{responseBytes:1},{responseBytes:65535},{byteBurst:65535},{responseBurst:0},{waits:160,handlers:159},{batchMs:1},{batchMs:10001},{batchMs:3000,waitMs:2000}])expect(()=>validateSettings({...base,public:{...base.public,policy:{...base.public.policy,...change}}})).toThrow();
 expect(()=>validateSettings({...base,public:{...base.public,firstWindowSeconds:301}})).toThrow();
 const bounded={...base,public:{...base.public,firstWindowSeconds:300,policy:{...base.public.policy,byteBurst:65536,batchMs:10000}}};expect(validateSettings(bounded).public.policy.batchMs).toBe(10000);
});
