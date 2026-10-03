import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {normalizeEmail,normalizeIP,type EmailDelivery} from '../src/email';
import {harness,reset,records,seedMember,C,save,hash,newToken,origin,authHost,type Flow} from './control-auth-host';
import {DEFAULT_SETTINGS} from '../src/settings-schema';
import {creatorAuthorization} from '../src/identity-http';
let h:ReturnType<typeof harness>;
beforeEach(async()=>{await reset();h=harness();await seedMember('allowed@fixture.example');});
afterEach(()=>console.info('TOKTOK_AUTH_HTTP',JSON.stringify(h.raw)));
const requestRows=()=>records(tx=>tx.list(C.otp,{prefix:'request:',limit:1000}));
const codes=()=>records(tx=>tx.list(C.otp,{prefix:'code:',limit:1000}));
const usage=(month:string)=>records(async tx=>Number((await tx.get(C.budgets,'usage:email_attempts:m:'+month))?.used??0));
const countSessions=()=>records(async tx=>(await tx.list(C.sessions,{limit:1000})).length);
async function setupCode(f:Flow,email='allowed@fixture.example'){
 const r=await h.send(f,email),data=await r.clone().json() as {error?:{code:string}};
 expect({status:r.status,code:data.error?.code}).toEqual({status:200,code:undefined});expect(h.deliveries.length>0).toBe(true);return h.deliveries.at(-1)!.code;
}
it('OTP bootstrap does not send; same logical request dispatches once',async()=>{
 const f=await h.begin();expect(h.calls).toBe(0);const responses=await Promise.all([h.send(f,'allowed@fixture.example','same'),h.send(f,'allowed@fixture.example','same')]);expect(responses.map(r=>r.status)).toEqual([200,200]);expect(await responses[0].json()).toEqual(await responses[1].json());expect(h.calls).toBe(1);expect(await usage('2030-01')).toBe(1);
});
it('reserves the 9999 boundary atomically and blocks sends at 10000 with next-month Retry-After',async()=>{
 for(let i=0;i<3;i++)await seedMember(`a${i}@fixture.example`);const flows=await Promise.all([h.begin(),h.begin(),h.begin()]);await records(tx=>save(tx,C.budgets,'usage:email_attempts:m:2030-01',{used:9999}));
 const outcomes=await Promise.all(flows.map((f,i)=>h.send(f,`a${i}@fixture.example`,crypto.randomUUID(),`192.0.2.${i+1}`)));expect(outcomes.map(r=>r.status).sort()).toEqual([200,429,429]);expect(h.calls).toBe(1);expect(await usage('2030-01')).toBe(10000);expect(Number(outcomes.find(r=>r.status===429)!.headers.get('Retry-After'))).toBe((Date.UTC(2030,1,1)-h.now)/1000);
});
it('keeps a late prior-month result in its reservation month and allows the next UTC month',async()=>{
 await seedMember('next@fixture.example');h.time(Date.UTC(2030,0,31,23,59,59));const f=await h.begin();let release!:()=>void;h.hold(new Promise(r=>{release=r;}));const first=h.send(f);
 try{for(let i=0;h.calls===0&&i<100;i++)await new Promise(r=>setTimeout(r,1));expect(h.calls).toBe(1);h.advance(2000);h.hold(Promise.resolve());expect((await h.send(await h.begin(),'next@fixture.example','next','192.0.2.2')).status).toBe(200);}finally{release();}
 expect((await first).status).toBe(200);expect(await usage('2030-01')).toBe(1);expect(await usage('2030-02')).toBe(1);expect((await requestRows()).map(r=>r.value.reservation_month).sort()).toEqual(['2030-01','2030-02']);
});
it('never redispatches definite/uncertain failure or persisted restart replay and rejects conflicting logical input',async()=>{
 const f=await h.begin();h.fail();const first=await h.send(f,'allowed@fixture.example','same');expect(first.status).toBe(200);const receipt=await first.json();expect(await (await h.send(f,' ALLOWED@fixture.example ','same')).json()).toEqual(receipt);expect(h.calls).toBe(1);expect((await h.send(f,'other@fixture.example','same')).status).toBe(409);
 const rows=await requestRows();expect(rows[0].value.dispatch_attempted).toBe(true);expect(rows[0].value.state).toBe('uncertain');
 await records(tx=>save(tx,C.otp,rows[0].key,{...rows[0].value,state:'uncertain'}));expect((await h.send(f,'allowed@fixture.example','same')).status).toBe(200);expect(h.calls).toBe(1);expect(await usage('2030-01')).toBe(1);
});
it('uses the same request budget and generic accepted shape for unadmitted and admitted addresses without generating unadmitted OTP',async()=>{
 const f=await h.begin(),denied=await h.send(f,'outside@fixture.example','outside');expect(denied.status).toBe(200);const a=await denied.json() as Record<string,unknown>;expect(h.calls).toBe(0);expect(await codes()).toEqual([]);expect(await usage('2030-01')).toBe(0);expect(JSON.stringify(await requestRows()).includes('outside@fixture.example')).toBe(false);
 expect((await h.send(f,'outside@fixture.example','outside')).status).toBe(200);const second=await h.begin();expect((await h.send(second,'outside@fixture.example','new')).status).toBe(429);h.advance(120000);
 const allowed=await h.send(second,'allowed@fixture.example','allowed');expect(allowed.status).toBe(200);const b=await allowed.json() as Record<string,unknown>;expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());expect(a.message).toBe(b.message);
});
it('enforces email 120s AND 2/hour AND 3/day across flows with no dot/plus canonical merge',async()=>{
 expect((await h.send(await h.begin())).status).toBe(200);h.advance(119999);expect((await h.send(await h.begin(),' ALLOWED@fixture.example ')).status).toBe(429);h.advance(1);expect((await h.send(await h.begin())).status).toBe(200);h.advance(120000);expect((await h.send(await h.begin())).status).toBe(429);h.advance(3600000);expect((await h.send(await h.begin())).status).toBe(200);h.advance(120000);expect((await h.send(await h.begin())).status).toBe(429);h.time(Date.UTC(2030,0,2));expect((await h.send(await h.begin())).status).toBe(200);
 expect(normalizeEmail(' A.B+extra@Example.example ')).toBe('a.b+extra@example.example');expect(()=>normalizeEmail('a\r\n@b.example')).toThrow();
});
it('edge binding controlled, Repository OTP real runtime: shared IP 30/hour and 100/day and next UTC day',async()=>{
 for(let i=0;i<110;i++)await seedMember(`a${i}@fixture.example`);
 for(let hour=0;hour<4;hour++){h.time(Date.UTC(2030,0,1,hour));const count=hour===3?10:30;for(let j=0;j<count;j++)expect((await h.send(await h.begin(),`a${hour*30+j}@fixture.example`)).status).toBe(200);expect((await h.send(await h.begin(),`a${hour*30+count}@fixture.example`)).status).toBe(429);}
 expect(h.calls).toBe(100);h.time(Date.UTC(2030,0,2));expect((await h.send(await h.begin(),'a100@fixture.example')).status).toBe(200);
});
it('fails closed for damaged DB cap/settings, absent provider and trusted-IP spoofing before reserving',async()=>{
 const f=await h.begin(),payload={flow_id:f.flow,email:'allowed@fixture.example',client_request_id:'configuration'},headers={Origin:origin,Cookie:f.cookie};const config=await records(tx=>tx.get(C.settings,'config'));
 for(const settings of [{...DEFAULT_SETTINGS,identity:{...DEFAULT_SETTINGS.identity,emailLimits:{...DEFAULT_SETTINGS.identity.emailLimits,month:0}}},{...DEFAULT_SETTINGS,signup:{policy:'unknown'}}]){await records(tx=>save(tx,C.settings,'config',{...config!,settings}));expect((await h.call('/api/auth/email/send',payload,headers)).status).toBe(503);}
 await records(tx=>save(tx,C.settings,'config',config!));
 const production=authHost();for(const ip of [undefined,'192.0.2.1']){const r=await production.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Forwarded-For':'192.0.2.2',...(ip?{'CF-Connecting-IP':ip}:{})},body:JSON.stringify(payload)}),h.localEnv);expect(r.status).toBe(503);}
 const noSender=authHost({trustedIP:()=> '192.0.2.1'});expect((await noSender.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)}),h.localEnv)).status).toBe(503);
 expect((await h.call('/api/auth/start',{purpose:'login'},{Origin:origin,'CF-Worker':'same-zone.example'})).status).toBe(403);expect((await h.call('/api/auth/email/send',payload,{...headers,'CF-Worker':'same-zone.example'})).status).toBe(403);expect((await h.call('/api/auth/email/send',{...payload,ip:'192.0.2.4'},headers)).status).toBe(400);expect((await h.call('/api/auth/email/send',{...payload,email:'a'.repeat(33000)},headers)).status).toBe(413);expect(h.calls).toBe(0);expect(normalizeIP('2001:0DB8:0:0:0:0:0:1')).toBe(normalizeIP('2001:db8::1'));
});
it('edge binding controlled, Repository OTP real runtime: flow/browser/nonce, fifth wrong input and one session',async()=>{
 const f=await h.begin(),otp=await setupCode(f);expect((await h.complete(f,otp,{Cookie:'__Host-toktok-flow=other'})).status).toBe(403);expect((await h.complete({...f,nonce:newToken()},otp)).status).toBe(403);expect((await h.complete(await h.begin(),otp)).status).toBe(401);
 const wrong=otp==='000000'?'999999':'000000';expect((await Promise.all(Array.from({length:5},()=>h.complete(f,wrong)))).every(r=>r.status===401)).toBe(true);expect(await codes()).toEqual([]);expect((await h.complete(f,otp)).status).toBe(401);h.advance(120000);const valid=await h.begin(),code=await setupCode(valid),successes=await Promise.all([h.complete(valid,code),h.complete(valid,code)]);expect(successes.map(r=>r.status).sort()).toEqual([200,409]);expect(await countSessions()).toBe(1);
});
it('edge binding controlled, Repository OTP real runtime: fixed flow expiry preserves quota and requires new flow',async()=>{
 const f=await h.begin();h.advance(120000);expect((await h.send(f)).status).toBe(200);expect(h.deliveries[0].expires_at).toBe(h.now+480000);h.advance(480000);expect((await h.complete(f,h.deliveries[0].code)).status).toBe(403);expect((await h.send(f,'allowed@fixture.example','resend')).status).toBe(403);expect(h.calls).toBe(1);expect((await h.send(await h.begin())).status).toBe(200);expect(await usage('2030-01')).toBe(2);
});
it('edge binding controlled, Repository OTP real runtime: monthly cap permits issued OTP/session/claim and creator authority without more mail',async()=>{
 const f=await h.begin(),otp=await setupCode(f);await records(tx=>save(tx,C.budgets,'usage:email_attempts:m:2030-01',{used:10000}));const authenticated=await h.complete(f,otp);expect(authenticated.status).toBe(200);const cookie=h.cookie(authenticated)!,s=await (await h.call('/api/session',undefined,{Cookie:cookie})).json() as {csrf_token:string};
 for(let i=0;i<2;i++){const registered=await h.call('/api/agents',{name:'창작 agent'});expect(registered.status).toBe(201);const a=await registered.json() as {agent:{id:string};agent_token:string;claim_url:string};const cap=new URL(a.claim_url).pathname.split('/').at(-1)!;expect((await h.call(`/api/claims/${a.agent.id}/approve`,{risk_ack_version:'toktok-risk-v1'},{Origin:origin,Cookie:cookie,'X-CSRF-Token':s.csrf_token,Authorization:'Bearer '+cap})).status).toBe(200);expect((await creatorAuthorization(new Request(origin+'/api/v1/rooms',{method:'POST',headers:{Authorization:'Bearer '+a.agent_token}}),h.localEnv)).creator_id).toBe(a.agent.id);}
 expect(h.calls).toBe(1); // Actual Room messages/capability continuity belongs to root integrated HTTP gate.
});
it('controlled edge denial blocks malformed email JSON before body and Repository reservation',async()=>{
 await h.begin();const worker=authHost({trustedIP:()=> '192.0.2.1',sendEmail:async()=>{throw Error('sender must not run');}});const r=await worker.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{malformed'}),{...h.localEnv,IP_RATE_LIMIT:{async limit(){return {success:false};}}});expect(r.status).toBe(429);expect((await r.json() as {error:{code:string}}).error.code).toBe('RATE_LIMITED');expect(h.calls).toBe(0);expect(await codes()).toEqual([]);expect(await usage('2030-01')).toBe(0);
});
it('native template keeps fixed subject/body-only OTP and masks provider error details everywhere',async()=>{
 const sent:{from:string;to:string;subject:string;text:string}[]=[],log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error');
 try{const local={...h.localEnv,EMAIL:{async send(m:typeof sent[number]){sent.push(m);throw Error('synthetic '+JSON.stringify(m));}},EMAIL_FROM:'login@notify.fixture.example'};const worker=authHost({now:()=>h.now,trustedIP:()=> '192.0.2.1'}),f=await h.begin(),r=await worker.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:f.cookie},body:JSON.stringify({flow_id:f.flow,email:'allowed@fixture.example',client_request_id:'native-template'})}),local);
 expect(r.status).toBe(200);expect(sent.length).toBe(1);const template=sent[0],code=template.text.match(/\d{6}/)![0];expect(template.subject==='톡톡 이메일 확인').toBe(true);expect(Object.keys(template).sort()).toEqual(['from','subject','text','to']);expect(template.subject.includes(code)).toBe(false);expect(template.text.includes(code)).toBe(true);const exposed=await r.text(),persisted=JSON.stringify(await requestRows());expect([code,'allowed@fixture.example','synthetic'].some(v=>exposed.includes(v)||persisted.includes(v))).toBe(false);expect(log.mock.calls.length+error.mock.calls.length).toBe(0);
 }finally{log.mockRestore();error.mockRestore();}
});
