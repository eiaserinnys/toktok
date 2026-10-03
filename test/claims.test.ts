import {beforeEach,afterEach,it,expect} from 'vitest';
import {harness,reset,records,maintain,seedMember,C,save,hash,newToken,origin,authHost,SettingsStore,type Flow} from './control-auth-host';
import {creatorAuthorization} from '../src/identity-http';
import {HttpError} from '../src/http';
interface Agent {agent:{id:string;status:string;credential_expires_at:string|null};agent_token:string;claim_url:string;token:string;claim:{agent_id:string;claim_token:string};}
interface Session {cookie:string;csrf_token:string;authenticated:boolean;role:string;entitlements:{can_create_private:boolean};agents:Agent['agent'][];setCookie:string;}
let h:ReturnType<typeof harness>;
beforeEach(async()=>{await reset();h=harness();await seedMember('allowed@fixture.example');await seedMember('second@fixture.example');});
afterEach(()=>console.info('TOKTOK_CLAIM_HTTP',JSON.stringify(h.raw)));
const bearer=(token:string)=>({Authorization:'Bearer '+token});
async function register():Promise<Agent>{const r=await h.call('/api/agents',{name:'창작 에이전트'});expect(r.status).toBe(201);const data=await r.json() as Omit<Agent,'token'|'claim'>,token=new URL(data.claim_url).pathname.split('/').at(-1)!;return {...data,token,claim:{agent_id:data.agent.id,claim_token:token}};}
async function proof(f:Flow,email='allowed@fixture.example'){const sent=await h.send(f,email);expect(sent.status).toBe(200);expect(h.deliveries.some(d=>d.to===email)).toBe(true);return h.deliveries.filter(d=>d.to===email).at(-1)!.code;}
async function login(claim?:Agent['claim'],identity='allowed'):Promise<Session>{h.advance(121000);const f=await h.begin(claim),r=await h.complete(f,await proof(f,identity+'@fixture.example'));expect(r.status).toBe(200);const cookie=h.cookie(r)!;const s=await h.call('/api/session',undefined,{Cookie:cookie});expect(s.status).toBe(200);return {...await s.json() as Omit<Session,'cookie'|'setCookie'>,cookie,setCookie:r.headers.get('Set-Cookie')!};}
const mutation=(s:Session)=>({Origin:origin,Cookie:s.cookie,'X-CSRF-Token':s.csrf_token});
const approve=(a:Agent,s:Session)=>h.call(`/api/claims/${a.agent.id}/approve`,{risk_ack_version:'toktok-risk-v2'},{...mutation(s),...bearer(a.token)});
async function approved(){const a=await register(),s=await login(a.claim);expect((await approve(a,s)).status).toBe(200);return {a,s};}
async function authority(headers:Record<string,string>,id?:string){try{return {status:200,value:await creatorAuthorization(new Request(origin+'/api/v1/rooms',{method:'POST',headers}),h.localEnv,id)};}catch(e){const error=e as HttpError;return {status:error.status,code:error.code};}}
it('registers separate opaque pending credentials with side-effect-free status and claim reads',async()=>{
 const a=await register();expect(/^[\w-]{43}$/.test(a.agent_token)&&/^[\w-]{43}$/.test(a.token)&&a.token!==a.agent_token).toBe(true);expect((await authority(bearer(a.agent_token))).status).toBe(403);
 for(let i=0;i<2;i++){const me=await h.call('/api/agents/me',undefined,bearer(a.agent_token));expect((await me.json() as {agent:{status:string}}).agent.status).toBe('pending');const c=await h.call('/api/claims/'+a.agent.id,undefined,bearer(a.token));expect(c.status).toBe(200);const view=await c.text();expect([a.token,a.agent_token,'email'].some(v=>view.includes(v))).toBe(false);}
 expect((await h.call('/api/agents',{name:'가'.repeat(65)})).status).toBe(400);
});
it('keeps the production email sender unconfigured instead of trusting client identity',async()=>{
 const f=await h.begin(),worker=authHost({trustedIP:()=> '192.0.2.1'}),r=await worker.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,Cookie:f.cookie,'Content-Type':'application/json'},body:JSON.stringify({flow_id:f.flow,email:'allowed@fixture.example',client_request_id:'production-config'})}),h.localEnv);expect(r.status).toBe(503);expect((await r.json() as {error:{code:string}}).error.code).toBe('AUTH_PROVIDER_UNCONFIGURED');
 expect((await h.call('/api/auth/complete',{email:'allowed@fixture.example',subject:'allowed',email_verified:true},{Origin:origin,Cookie:f.cookie})).status).toBe(400);
});
it('separates verified email ownership from current DB account admission and never trusts alias eligibility',async()=>{
 await seedMember('outside@fixture.example',false);await seedMember('allowed+alias@fixture.example',false);const a=await register(),outside=await login(a.claim,'outside');expect(outside.authenticated).toBe(true);expect(outside.entitlements.can_create_private).toBe(false);expect((await approve(a,outside)).status).toBe(403);expect((await authority(mutation(outside),a.agent.id)).status).toBe(403);
 const alias=await login(undefined,'allowed+alias');expect(alias.entitlements.can_create_private).toBe(false);const allowed=await login(a.claim);expect(allowed.entitlements.can_create_private).toBe(true);expect((await approve(a,allowed)).status).toBe(200);
});
it('binds auth flow to exact Origin, browser, nonce, claim and one-use OTP without a prior session',async()=>{
 const origins:Record<string,string>[]=[{},{Origin:'null'},{Origin:'https://outside.example'}];for(const headers of origins)expect((await h.call('/api/auth/start',{purpose:'login'},headers)).status).toBe(403);
 const a=await register(),b=await register(),f=await h.begin(a.claim),otp=await proof(f),data={flow:f.flow,nonce:f.nonce,otp,claim_id:a.agent.id,claim_token:a.token};
 expect((await h.call('/api/auth/complete',data,{Cookie:f.cookie})).status).toBe(403);expect((await h.complete(f,otp,{Cookie:'__Host-toktok-flow=wrong'})).status).toBe(403);expect((await h.complete({...f,nonce:newToken()},otp)).status).toBe(403);expect((await h.complete({...f,claim:b.claim},otp)).status).toBe(403);expect((await h.complete(f,otp)).status).toBe(200);expect((await h.complete(f,otp)).status).toBe(409);expect((await h.complete(await h.begin(),otp)).status).toBe(401);
});
it('requires explicit risk confirmation and atomically fixes the first claim owner',async()=>{
 const a=await register(),one=await login(a.claim),two=await login(a.claim,'second');expect((await (await h.call('/api/agents/me',undefined,bearer(a.agent_token))).json() as {agent:{status:string}}).agent.status).toBe('pending');
 expect((await h.call('/api/claims/'+a.agent.id+'/approve',{}, {...mutation(one),...bearer(a.token)})).status).toBe(400);
 const results=await Promise.all([approve(a,one),approve(a,two)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect((await approve(a,one)).status).toBe(409);const all=[];for(const s of [one,two])all.push(...(await (await h.call('/api/session',undefined,{Cookie:s.cookie})).json() as Session).agents);expect(all.filter(agent=>agent.id===a.agent.id).length).toBe(1);
 const me=await (await h.call('/api/agents/me',undefined,bearer(a.agent_token))).json() as {agent:Agent['agent']};expect(me.agent.status).toBe('approved');expect(Date.parse(me.agent.credential_expires_at!)-h.now).toBeGreaterThan(29*86400000);for(const attr of ['__Host-toktok_session=','Secure','HttpOnly','SameSite=Lax','Path=/'])expect(one.setCookie.includes(attr)).toBe(true);expect(one.setCookie.includes('Domain')).toBe(false);
});
it('authenticates creator authority by owned approved agent bearer or session with required CSRF and Origin',async()=>{
 const {a,s}=await approved();expect((await authority(bearer(a.agent_token))).status).toBe(200);expect((await authority(mutation(s),a.agent.id)).status).toBe(200);const other=await login(undefined,'second');expect((await authority(mutation(other),a.agent.id)).status).toBe(403);expect((await authority({Cookie:s.cookie,'X-CSRF-Token':s.csrf_token},a.agent.id)).status).toBe(403);expect((await authority({Cookie:s.cookie,Origin:origin},a.agent.id)).status).toBe(403);expect((await authority({...bearer(a.agent_token),Origin:'https://outside.example'})).status).toBe(403);
});
it('blocks new creator authority for revoked or expired agents and accounts with removed DB entitlement',async()=>{
 const {a,s}=await approved(),owner=await records(async tx=>(await tx.get(C.agents,'a:'+a.agent.id))!.owner_id as string),account=await records(tx=>tx.get(C.accounts,'a:'+owner));await records(tx=>save(tx,C.accounts,'a:'+owner,{...account!,can_create_private:0}));expect((await authority(bearer(a.agent_token))).status).toBe(403);await records(tx=>save(tx,C.accounts,'a:'+owner,account!));expect((await h.call('/api/agents/'+a.agent.id+'/revoke',{},mutation(s))).status).toBe(200);expect((await authority(bearer(a.agent_token))).status).toBe(403);
 const other=await approved();await records(async tx=>{const agent=(await tx.get(C.agents,'a:'+other.a.agent.id))!;await save(tx,C.agents,'a:'+other.a.agent.id,{...agent,credential_expiry:h.now-1});});expect((await authority(bearer(other.a.agent_token))).status).toBe(403);
 // Existing room capabilities are not account credentials; their HTTP continuity is root's Room integration gate.
});
it('rejects expired and logged-out sessions and physically cleans expired pending agents, flows and sessions',async()=>{
 const a=await register(),s=await login();expect((await h.call('/api/auth/logout',{},mutation(s))).status).toBe(200);expect((await (await h.call('/api/session',undefined,{Cookie:s.cookie})).json() as Session).authenticated).toBe(false);expect((await approve(a,s)).status).toBe(401);
 const next=await login(),f=await h.begin();h.advance(86400000);expect((await h.complete(f,'000000')).status).toBe(403);expect((await (await h.call('/api/session',undefined,{Cookie:next.cookie})).json() as Session).authenticated).toBe(false);expect((await h.call('/api/claims/'+a.agent.id,undefined,bearer(a.token))).status).toBe(410);
 await maintain(h.now);
 const result=await records(async tx=>({pending:(await tx.list(C.agents,{prefix:'a:',limit:100})).length,auth:(await tx.list(C.flows,{prefix:'f:',limit:100})).length,sessions:(await tx.list(C.sessions,{limit:100})).length}));expect(result).toEqual({pending:0,auth:0,sessions:0});
});
it('bounds registration per HMAC IP and minute and caps the global pending count',async()=>{
 const headers={'CF-Connecting-IP':'192.0.2.200'};for(let i=0;i<5;i++)expect((await h.call('/api/agents',{name:'창작'},headers)).status).toBe(201);expect((await h.call('/api/agents',{name:'창작'},headers)).status).toBe(429);const stored=await records(async tx=>JSON.stringify(await tx.list(C.otp,{prefix:'register:',limit:100})));expect(stored.includes('192.0.2.200')).toBe(false);
 await records(async tx=>{const store=new SettingsStore(tx),state=await store.state();await store.stateSave({...state,pending_agents:1000});});expect((await h.call('/api/agents',{name:'창작'},{'CF-Connecting-IP':'192.0.2.201'})).status).toBe(429);
});
