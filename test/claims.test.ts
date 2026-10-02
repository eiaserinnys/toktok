import {env} from 'cloudflare:workers';
import {SELF,runInDurableObject,runDurableObjectAlarm} from 'cloudflare:test';
import {it,expect,beforeEach} from 'vitest';
import {makeWorker} from '../src/index';
import {hash,newToken} from '../src/http';
const origin='http://localhost:8787';let ip=50;
async function api(path:string,method='GET',data?:unknown,headers:Record<string,string>={}){
 return SELF.fetch(origin+path,{method,headers:{'CF-Connecting-IP':`192.0.2.${++ip}`,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
}
async function register(){
 const r=await api('/api/agents','POST',{name:'창작 에이전트'});expect(r.status).toBe(201);
 const data=await r.json() as any;const token=new URL(data.claim_url).pathname.split('/').at(-1)!;
 return {...data,claim:{agent_id:data.agent.id,claim_token:token},token};
}
const bearer=(token:string)=>({Authorization:'Bearer '+token});
const cookie=(r:Response)=>r.headers.get('Set-Cookie')!.split(';')[0];
async function begin(claim?:unknown){
 const r=await api('/api/auth/start','POST',{...(claim?{claim}:{})},{Origin:origin});expect(r.status).toBe(200);
 return {...await r.json() as any,cookie:cookie(r)};
}
let fixtureTime=Date.now();
beforeEach(async()=>{fixtureTime=Date.now();await api('/__fixture/control','POST',{reset:true,now:fixtureTime});});
async function proof(flow:any,identity='allowed'){
 const email=identity+'@fixture.test';
 const sent=await api('/api/auth/email/send','POST',{flow_id:flow.flow,email,client_request_id:crypto.randomUUID()},{Origin:origin,Cookie:flow.cookie});expect(sent.status).toBe(200);
 return (await (await api('/__fixture/inbox?email='+encodeURIComponent(email))).json() as any).delivery.code;
}
async function login(claim?:unknown,identity='allowed'){
 fixtureTime+=121000;await api('/__fixture/control','POST',{now:fixtureTime});
 if(!['allowed','second'].includes(identity)){
  const f=await begin(),token=newToken(),sessionHash=await hash(token),csrf=newToken(),email=identity+'@fixture.test';
  await runInDurableObject(identityStub(),(_i,state)=>{state.storage.sql.exec('INSERT INTO humans VALUES(?,?,?,?,1)',email,'email-otp',email,email);state.storage.sql.exec('INSERT INTO sessions VALUES(?,?,?,?)',sessionHash,email,csrf,Date.now()+43200000);});
  const sessionCookie='__Host-toktok_session='+token,s=await api('/api/session','GET',undefined,{Cookie:sessionCookie});return {...await s.json() as any,cookie:sessionCookie};
 }
 const flow=await begin(claim),otp=await proof(flow,identity),r=await api('/api/auth/complete','POST',{flow:flow.flow,nonce:flow.nonce,otp,...(claim?{claim}:{})},{Origin:origin,Cookie:flow.cookie});expect(r.status).toBe(200);
 const sessionCookie=cookie(r),s=await api('/api/session','GET',undefined,{Cookie:sessionCookie});expect(s.status).toBe(200);
 return {...await s.json() as any,cookie:sessionCookie,setCookie:r.headers.get('Set-Cookie')!};
}
const mutation=(s:any)=>({Origin:origin,Cookie:s.cookie,'X-CSRF-Token':s.csrf});
const approve=(a:any,s:any)=>api(`/api/claims/${a.agent.id}/approve`,'POST',{risk_ack_version:'toktok-risk-v1'}, {...mutation(s),...bearer(a.token)});
async function approved(){const a=await register(),s=await login(a.claim);expect((await approve(a,s)).status).toBe(200);return {a,s};}
const identityStub=():DurableObjectStub=>env.IDENTITIES.get(env.IDENTITIES.idFromName('team'));

it('registers separate opaque pending credentials with side-effect-free status and guide',async()=>{
 const a=await register();expect(a.agent_token).toMatch(/^[\w-]{43}$/);expect(a.token).toMatch(/^[\w-]{43}$/);expect(a.token).not.toBe(a.agent_token);
 expect((await api('/api/rooms','POST',{purpose:'창작'},bearer(a.agent_token))).status).toBe(403);
 const me=await (await api('/api/agents/me','GET',undefined,bearer(a.agent_token))).json() as any;expect(me.agent.status).toBe('pending');
 for(let i=0;i<2;i++){
  const c=await api(`/api/claims/${a.agent.id}`,'GET',undefined,bearer(a.token));expect(c.status).toBe(200);const view=await c.text();expect(view).not.toContain(a.token);expect(view).not.toContain(a.agent_token);expect(view).not.toContain('email');
  const guide=await api('/register?format=md');expect(guide.status).toBe(200);expect(await guide.text()).toContain('/api/agents');
 }
 expect((await (await api('/api/agents/me','GET',undefined,bearer(a.agent_token))).json() as any).agent.status).toBe('pending');
 expect((await api('/api/agents','POST',{name:'가'.repeat(65)})).status).toBe(400);
});
it('keeps the production identity verifier unconfigured instead of trusting client identity',async()=>{
 const flow=await begin(),r=await makeWorker({trustedIP:()=> '192.0.2.1'}).fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,Cookie:flow.cookie,'Content-Type':'application/json'},body:JSON.stringify({flow_id:flow.flow,email:'allowed@fixture.test',client_request_id:'production-config'})}),env);
 expect(r.status).toBe(503);expect((await r.json() as any).error.code).toBe('AUTH_PROVIDER_UNCONFIGURED');
 expect((await api('/api/auth/complete','POST',{email:'allowed@fixture.test',subject:'allowed',email_verified:true},{Origin:origin,Cookie:flow.cookie})).status).toBe(400);
});
it('separates verified email ownership from exact team eligibility',async()=>{
 const a=await register(),s=await login(a.claim,'outside');expect(s.human.email_verified).toBe(true);expect(s.admission_allowed).toBe(false);
 expect((await approve(a,s)).status).toBe(403);expect((await api('/api/rooms','POST',{purpose:'창작',agent_id:a.agent.id},mutation(s))).status).toBe(403);
 const alias=await login(undefined,'allowed+alias');expect(alias.admission_allowed).toBe(false);
 const allowed=await login(a.claim);expect(allowed.admission_allowed).toBe(true);expect((await approve(a,allowed)).status).toBe(200);
});
it('binds auth flow to browser, nonce, claim and one-use provider proof',async()=>{
 const origins:Record<string,string>[]=[{},{Origin:'null'},{Origin:'https://outside.example'}];
 for(const headers of origins)expect((await api('/api/auth/start','POST',{},headers)).status).toBe(403);
 const a=await register(),b=await register(),f=await begin(a.claim),data={flow:f.flow,nonce:f.nonce,otp:await proof(f),claim:a.claim};
 expect((await api('/api/auth/complete','POST',data,{Cookie:f.cookie})).status).toBe(403);
 expect((await api('/api/auth/complete','POST',data,{Origin:origin,Cookie:'__Host-toktok_flow=wrong'})).status).toBe(403);
 expect((await api('/api/auth/complete','POST',{...data,nonce:'x'.repeat(43)},{Origin:origin,Cookie:f.cookie})).status).toBe(403);
 expect((await api('/api/auth/complete','POST',{...data,claim:b.claim},{Origin:origin,Cookie:f.cookie})).status).toBe(403);
 expect((await api('/api/auth/complete','POST',data,{Origin:origin,Cookie:f.cookie})).status).toBe(200);
 expect((await api('/api/auth/complete','POST',data,{Origin:origin,Cookie:f.cookie})).status).toBe(409);
 const next=await begin();expect((await api('/api/auth/complete','POST',{flow:next.flow,nonce:next.nonce,otp:data.otp},{Origin:origin,Cookie:next.cookie})).status).toBe(401);
});
it('requires explicit claim approval and atomically fixes the first owner',async()=>{
 const a=await register(),one=await login(a.claim),two=await login(a.claim,'second');
 expect((await (await api('/api/agents/me','GET',undefined,bearer(a.agent_token))).json() as any).agent.status).toBe('pending');
 const results=await Promise.all([approve(a,one),approve(a,two)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
 expect((await approve(a,one)).status).toBe(409);
 const first=await (await api('/api/session','GET',undefined,{Cookie:one.cookie})).json() as any,second=await (await api('/api/session','GET',undefined,{Cookie:two.cookie})).json() as any;
 expect([...first.agents,...second.agents].filter(agent=>agent.id===a.agent.id).length).toBe(1);
 const me=await (await api('/api/agents/me','GET',undefined,bearer(a.agent_token))).json() as any;expect(me.agent.status).toBe('approved');expect(Date.parse(me.agent.credential_expires_at)-Date.now()).toBeGreaterThan(29*86400000);
 expect(one.setCookie).toContain('__Host-toktok_session=');for(const attr of ['Secure','HttpOnly','SameSite=Lax','Path=/'])expect(one.setCookie).toContain(attr);expect(one.setCookie).not.toContain('Domain');
});
it('authenticates room creation by owned approved agent bearer or session with required CSRF/Origin',async()=>{
 const {a,s}=await approved();
 expect((await api('/api/rooms','POST',{purpose:'창작'},bearer(a.agent_token))).status).toBe(201);
 expect((await api('/api/rooms','POST',{purpose:'창작',agent_id:a.agent.id},mutation(s))).status).toBe(201);
 const other=await login(undefined,'second');expect((await api('/api/rooms','POST',{purpose:'창작',agent_id:a.agent.id},mutation(other))).status).toBe(403);
 expect((await api('/api/rooms','POST',{purpose:'창작',agent_id:a.agent.id},{Cookie:s.cookie,'X-CSRF-Token':s.csrf})).status).toBe(403);
 expect((await api('/api/rooms','POST',{purpose:'창작',agent_id:a.agent.id},{Cookie:s.cookie,Origin:origin})).status).toBe(403);
 expect((await api('/api/rooms','POST',{purpose:'창작'},{...bearer(a.agent_token),Origin:'https://outside.example'})).status).toBe(403);
});
it('blocks new rooms for revoked/expired agents and removed team owners without invalidating existing room links',async()=>{
 const {a,s}=await approved(),room=await (await api('/api/rooms','POST',{purpose:'창작'},bearer(a.agent_token))).json() as any;
 const removed=await makeWorker().fetch(new Request(origin+'/api/rooms',{method:'POST',headers:{...bearer(a.agent_token),'Content-Type':'application/json'},body:JSON.stringify({purpose:'창작'})}),{...env,SIGNUP_POLICY_JSON:'{"mode":"restricted","allowed_emails":["different@fixture.test"]}'});expect(removed.status).toBe(403);
 expect((await api(`/api/agents/${a.agent.id}/revoke`,'POST',{},mutation(s))).status).toBe(200);
 expect((await api('/api/rooms','POST',{purpose:'창작'},bearer(a.agent_token))).status).toBe(403);
 expect((await api(new URL(room.read_url).pathname)).status).toBe(200);
 const other=await approved();await runInDurableObject(identityStub(),(_i,state)=>state.storage.sql.exec('UPDATE agents SET credential_expiry=? WHERE id=?',Date.now()-1,other.a.agent.id).toArray());
 expect((await api('/api/rooms','POST',{purpose:'창작'},bearer(other.a.agent_token))).status).toBe(403);
});
it('rejects expired/logged-out sessions and physically cleans expired pending/auth/session records',async()=>{
 const a=await register(),s=await login();
 expect((await api('/api/auth/logout','POST',{},mutation(s))).status).toBe(200);expect((await api('/api/session','GET',undefined,{Cookie:s.cookie})).status).toBe(401);
 const next=await login();await runInDurableObject(identityStub(),(_i,state)=>state.storage.sql.exec('UPDATE sessions SET expires_at=?',Date.now()-1).toArray());
 expect((await api('/api/session','GET',undefined,{Cookie:next.cookie})).status).toBe(401);
 await runInDurableObject(identityStub(),(_i,state)=>{state.storage.sql.exec('UPDATE agents SET pending_expiry=? WHERE id=?',Date.now()-1,a.agent.id);state.storage.sql.exec('UPDATE auth_transactions SET expires_at=?',Date.now()-1);});
 expect((await api(`/api/claims/${a.agent.id}`,'GET',undefined,bearer(a.token))).status).toBe(410);
 await runDurableObjectAlarm(identityStub());
 const counts=await runInDurableObject(identityStub(),(_i,state)=>({pending:state.storage.sql.exec('SELECT COUNT(*) AS n FROM agents WHERE status=? AND pending_expiry<=?','pending',Date.now()).one().n,auth:state.storage.sql.exec('SELECT COUNT(*) AS n FROM auth_transactions WHERE expires_at<=?',Date.now()).one().n,sessions:state.storage.sql.exec('SELECT COUNT(*) AS n FROM sessions WHERE expires_at<=?',Date.now()).one().n}));expect(counts).toEqual({pending:0,auth:0,sessions:0});
});
it('bounds registration per hashed IP/minute and caps global pending agents',async()=>{
 const headers={'CF-Connecting-IP':'192.0.2.200'};
 for(let i=0;i<5;i++)expect((await api('/api/agents','POST',{name:'창작'},headers)).status).toBe(201);
 expect((await api('/api/agents','POST',{name:'창작'},headers)).status).toBe(429);
 const stored=await runInDurableObject(identityStub(),(_i,state)=>JSON.stringify(state.storage.sql.exec('SELECT * FROM registration_limits').toArray()));expect(stored).not.toContain('192.0.2.200');
 await runInDurableObject(identityStub(),(_i,state)=>{const n=Number(state.storage.sql.exec("SELECT COUNT(*) AS n FROM agents WHERE status='pending'").one().n);for(let i=n;i<1000;i++)state.storage.sql.exec('INSERT INTO agents(id,name,token_hash,claim_hash,status,pending_expiry) VALUES(?,?,?,?,?,?)',`seed-${i}`,'창작',`seed-token-${i}`,`seed-claim-${i}`,'pending',Date.now()+10000);});
 expect((await api('/api/agents','POST',{name:'창작'})).status).toBe(429);
 await runInDurableObject(identityStub(),(_i,state)=>state.storage.sql.exec("DELETE FROM agents WHERE id LIKE 'seed-%'").toArray());
});
