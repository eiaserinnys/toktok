import {SELF,runInDurableObject} from 'cloudflare:test';
import {env} from 'cloudflare:workers';
import {expect,it,beforeEach} from 'vitest';
import {makeWorker} from '../src/index';
import {normalizeEmail,normalizeIP,type EmailDelivery} from '../src/email';
import {hash,newToken} from '../src/http';
import {vi} from 'vitest';
const origin='http://localhost:8787';
const stub=():DurableObjectStub=>env.IDENTITIES.get(env.IDENTITIES.idFromName('team'));
const sql=(query:string,...args:(string|number)[])=>runInDurableObject(stub(),(_i,state)=>state.storage.sql.exec(query,...args).toArray());
beforeEach(async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();});
 await SELF.fetch(origin+'/__fixture/control',{method:'POST',body:JSON.stringify({reset:true})});
});
function harness(){
 let now=Date.now(),calls=0,failure=false,hold:Promise<void>|undefined;
 const deliveries:EmailDelivery[]=[];
 const worker=makeWorker({now:()=>now,trustedIP:r=>normalizeIP(r.headers.get('CF-Connecting-IP')??'192.0.2.1'),sendEmail:async d=>{calls++;deliveries.push(d);if(hold)await hold;if(failure)throw Error('simulated unknown outcome');}});
 // Edge binding controlled; DO OTP storage, fixed-window quotas and clock are real runtime.
 const localEnv={...env,IP_RATE_LIMIT:{async limit(){return {success:true};}},SIGNUP_POLICY_JSON:JSON.stringify({mode:'restricted',allowed_emails:Array.from({length:110},(_,i)=>`a${i}@fixture.test`).concat('allowed@fixture.test')})};
 const call=async(path:string,data?:unknown,headers:Record<string,string>={},override=localEnv)=>{
  const response=await worker.fetch(new Request(origin+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)}),override);
  if(!response.ok){const data=await response.clone().json() as {error?:{code:string}};console.info('TOKTOK_OTP_HTTP',JSON.stringify({path:path.replace(/[\w-]{43}/g,'[cap]'),status:response.status,code:data.error?.code,retry_after:response.headers.get('Retry-After')}));}
  return response;
 };
 async function begin(claim?:unknown){const r=await call('/api/auth/start',claim?{claim}:{},{Origin:origin});expect(r.status).toBe(200);return {...await r.json() as {flow:string;nonce:string},cookie:r.headers.get('Set-Cookie')!.split(';')[0],claim};}
 const send=(f:Awaited<ReturnType<typeof begin>>,email='allowed@fixture.test',id=crypto.randomUUID(),ip='192.0.2.1')=>call('/api/auth/email/send',{flow_id:f.flow,email,client_request_id:id},{Origin:origin,Cookie:f.cookie,'CF-Connecting-IP':ip});
 const complete=(f:Awaited<ReturnType<typeof begin>>,otp:string,headers:Record<string,string>={})=>call('/api/auth/complete',{flow:f.flow,nonce:f.nonce,...(f.claim?{claim:f.claim}:{}),otp},{Origin:origin,Cookie:f.cookie,...headers});
 return {call,begin,send,complete,deliveries,get calls(){return calls;},get now(){return now;},advance:(ms:number)=>{now+=ms;},time:(ms:number)=>{now=ms;},fail:()=>{failure=true;},hold:(p:Promise<void>)=>{hold=p;},localEnv};
}
async function setupCode(h:ReturnType<typeof harness>,f:Awaited<ReturnType<ReturnType<typeof harness>['begin']>>){
 const r=await h.send(f),body=await r.clone().json() as {error?:{code:string}};
 expect({status:r.status,code:body.error?.code}).toEqual({status:200,code:undefined});
 expect(h.deliveries.length>0).toBe(true);return h.deliveries.at(-1)!.code;
}
it('OTP bootstrap does not send; same logical request dispatches once',async()=>{
 const origin='http://localhost:8787';
 const start=await SELF.fetch(origin+'/api/auth/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
 const flow=await start.json() as {flow:string};
 const headers={Origin:origin,'Content-Type':'application/json',Cookie:start.headers.get('Set-Cookie')!.split(';')[0],'CF-Connecting-IP':'192.0.2.1'};
 const send=()=>SELF.fetch(origin+'/api/auth/email/send',{method:'POST',headers,body:JSON.stringify({flow_id:flow.flow,email:'allowed@fixture.test',client_request_id:'same-logical-request'})});
 const responses=await Promise.all([send(),send()]);expect(responses.map(r=>r.status)).toEqual([200,200]);
 const receipts=await Promise.all(responses.map(r=>r.json()));expect(receipts[0]).toEqual(receipts[1]);
 expect((await (await SELF.fetch(origin+'/__fixture/inbox?email=allowed%40fixture.test')).json() as {calls:number}).calls).toBe(1);
});
it('reserves the 9999 boundary atomically and blocks sends at 10000 with next-month Retry-After',async()=>{
 const h=harness(),flows=await Promise.all([h.begin(),h.begin(),h.begin()]),month=new Date(h.now).toISOString().slice(0,7),end=Date.UTC(new Date(h.now).getUTCFullYear(),new Date(h.now).getUTCMonth()+1,1);
 await sql('INSERT INTO email_counters VALUES(?,?,?,?)','month',month,9999,end);
 const responses=await Promise.all(flows.map((f,i)=>h.send(f,`a${i}@fixture.test`,crypto.randomUUID(),`192.0.2.${i+1}`)));
 expect(responses.map(r=>r.status).sort()).toEqual([200,429,429]);expect(h.calls).toBe(1);
 expect(Number(responses.find(r=>r.status===429)!.headers.get('Retry-After'))).toBe(Math.ceil((end-h.now)/1000));
 expect((await sql('SELECT n FROM email_counters WHERE scope=? AND window=?','month',month))[0].n).toBe(10000);
});
it('keeps a late prior-month result in its reservation month and allows the next UTC month',async()=>{
 const h=harness();h.time(Date.UTC(2030,0,31,23,59,59));const f=await h.begin();let release!:()=>void;h.hold(new Promise(r=>{release=r;}));
 const first=h.send(f);for(let i=0;h.calls===0&&i<100;i++)await new Promise(r=>setTimeout(r,1));expect(h.calls).toBe(1);
 h.advance(2000);h.hold(Promise.resolve());const next=await h.begin();expect((await h.send(next,'a1@fixture.test','next-month','192.0.2.2')).status).toBe(200);release();expect((await first).status).toBe(200);
 expect(await sql("SELECT window,n FROM email_counters WHERE scope='month' ORDER BY window")).toEqual([{window:'2030-01',n:1},{window:'2030-02',n:1}]);
 expect((await sql('SELECT reservation_month FROM email_requests ORDER BY created_at')).map(r=>r.reservation_month)).toEqual(['2030-01','2030-02']);
});
it('never redispatches definite/uncertain failure or persisted restart replay and rejects conflicting logical input',async()=>{
 const h=harness(),f=await h.begin();h.fail();const first=await h.send(f,'allowed@fixture.test','same');expect(first.status).toBe(200);const receipt=await first.json();
 expect((await (await h.send(f,' ALLOWED@fixture.test ','same')).json())).toEqual(receipt);expect(h.calls).toBe(1);
 expect((await h.send(f,'a1@fixture.test','same')).status).toBe(409);
 expect((await sql('SELECT dispatch_attempted,state FROM email_requests'))[0]).toEqual({dispatch_attempted:1,state:'uncertain'});
 // Simulate a persisted reservation with no recorded result (process crash boundary).
 await sql("UPDATE email_requests SET state='uncertain'");expect((await h.send(f,'allowed@fixture.test','same')).status).toBe(200);expect(h.calls).toBe(1);
 expect((await sql("SELECT n FROM email_counters WHERE scope='month'"))[0].n).toBe(1);
});
it('uses the same request budget and generic accepted shape for unallowed and allowed addresses without generating unallowed OTP',async()=>{
 const h=harness(),f=await h.begin();const denied=await h.send(f,'unallowed@fixture.test','outside');expect(denied.status).toBe(200);const a=await denied.json() as Record<string,unknown>;
 expect(h.calls).toBe(0);expect(await sql('SELECT * FROM otp_codes')).toEqual([]);expect(await sql("SELECT * FROM email_counters WHERE scope='month'")).toEqual([]);
 expect(JSON.stringify(await sql('SELECT * FROM email_requests'))).not.toContain('unallowed@fixture.test');
 expect((await h.send(f,'unallowed@fixture.test','outside')).status).toBe(200);
 const second=await h.begin();expect((await h.send(second,'unallowed@fixture.test','new')).status).toBe(429);h.advance(120000);
 const allowed=await h.send(second,'allowed@fixture.test','allowed');expect(allowed.status).toBe(200);const b=await allowed.json() as Record<string,unknown>;
 expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());expect(a.message).toBe(b.message);
});
it('enforces email 120s AND 2/hour AND 3/day across claims with no dot/plus canonical merge',async()=>{
 const h=harness(),f=await h.begin();expect((await h.send(f)).status).toBe(200);h.advance(119999);expect((await h.send(await h.begin(),' ALLOWED@fixture.test ')).status).toBe(429);
 h.advance(1);expect((await h.send(await h.begin())).status).toBe(200);h.advance(120000);expect((await h.send(await h.begin())).status).toBe(429);
 h.advance(3600000);expect((await h.send(await h.begin())).status).toBe(200);h.advance(120000);expect((await h.send(await h.begin())).status).toBe(429);
 h.time(Date.UTC(new Date(h.now).getUTCFullYear(),new Date(h.now).getUTCMonth(),new Date(h.now).getUTCDate()+1));expect((await h.send(await h.begin())).status).toBe(200);
 expect(normalizeEmail(' A.B+extra@Example.test ')).toBe('a.b+extra@example.test');expect(()=>normalizeEmail('a\r\n@b.test')).toThrow();
});
it('edge binding controlled, DO OTP real runtime: shared IP 30/hour and 100/day and next UTC day',async()=>{
 const h=harness();h.time(Date.UTC(2030,0,1,0));
 for(let hour=0;hour<4;hour++){
  h.time(Date.UTC(2030,0,1,hour));const count=hour===3?10:30;
  for(let j=0;j<count;j++)expect((await h.send(await h.begin(),`a${hour*30+j}@fixture.test`)).status).toBe(200);
  expect((await h.send(await h.begin(),`a${hour*30+count}@fixture.test`)).status).toBe(429);
 }
 expect(h.calls).toBe(100);h.time(Date.UTC(2030,0,2,0));expect((await h.send(await h.begin(),'a100@fixture.test')).status).toBe(200);
});
it('fails closed for missing/damaged cap/provider/policy and trusted-IP spoofing before reserving',async()=>{
 const h=harness(),f=await h.begin(),payload={flow_id:f.flow,email:'allowed@fixture.test',client_request_id:'configuration'},headers={Origin:origin,Cookie:f.cookie};
 for(const limits of ['', '{}','{"month":0}'])expect((await h.call('/api/auth/email/send',payload,headers,{...h.localEnv,EMAIL_LIMITS_JSON:limits})).status).toBe(503);
 for(const policy of ['', '{}','{"mode":"public"}','{"mode":"closed"}'])expect((await h.call('/api/auth/email/send',payload,headers,{...h.localEnv,SIGNUP_POLICY_JSON:policy})).status).toBe(503);
 const production=makeWorker();for(const ip of [undefined,'192.0.2.1']){
  const r=await production.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Forwarded-For':'192.0.2.2',...(ip?{'CF-Connecting-IP':ip}:{})},body:JSON.stringify(payload)}),env);expect(r.status).toBe(503);
 }
 expect((await h.call('/api/auth/start',{}, {Origin:origin,'CF-Worker':'same-zone.example'})).status).toBe(403);
 expect((await h.call('/api/auth/email/send',payload,{...headers,'CF-Worker':'same-zone.example'})).status).toBe(403);
 expect((await h.call('/api/auth/email/send',{...payload,ip:'192.0.2.4'},headers)).status).toBe(400);
 expect((await h.call('/api/auth/email/send',{...payload,email:'a'.repeat(33000)},headers)).status).toBe(413);
 expect(h.calls).toBe(0);expect(normalizeIP('2001:0DB8:0:0:0:0:0:1')).toBe(normalizeIP('2001:db8::1'));
});
it('edge binding controlled, DO OTP real runtime: flow/browser/nonce, fifth wrong input and one session',async()=>{
 const h=harness(),f=await h.begin(),otp=await setupCode(h,f);
 expect((await h.complete(f,otp,{Cookie:'__Host-toktok_flow=other'})).status).toBe(403);
 expect((await h.complete({...f,nonce:newToken()},otp)).status).toBe(403);
 const other=await h.begin();expect((await h.complete(other,otp)).status).toBe(401);
 const wrong=otp==='000000'?'999999':'000000';const results=await Promise.all(Array.from({length:5},()=>h.complete(f,wrong)));expect(results.every(r=>r.status===401)).toBe(true);expect(await sql('SELECT * FROM otp_codes')).toEqual([]);expect((await h.complete(f,otp)).status).toBe(401);
 h.advance(120000);const valid=await h.begin(),code=await setupCode(h,valid);
 const successes=await Promise.all([h.complete(valid,code),h.complete(valid,code)]);expect(successes.map(r=>r.status).sort()).toEqual([200,409]);expect((await sql('SELECT COUNT(*) AS n FROM sessions'))[0].n).toBe(1);
});
it('edge binding controlled, DO OTP real runtime: fixed flow expiry preserves quota and requires new flow',async()=>{
 const h=harness(),f=await h.begin();h.advance(120000);expect((await h.send(f)).status).toBe(200);expect(h.deliveries[0].expires_at).toBe(h.now+480000);
 h.advance(480000);expect((await h.complete(f,h.deliveries[0].code)).status).toBe(403);expect((await h.send(f,'allowed@fixture.test','resend')).status).toBe(403);expect(h.calls).toBe(1);
 expect((await h.send(await h.begin())).status).toBe(200);expect((await sql("SELECT n FROM email_counters WHERE scope='month'"))[0].n).toBe(2);
});
it('edge binding controlled, DO OTP real runtime: monthly cap permits issued OTP/session/claim/rooms/messages without more mail',async()=>{
 const h=harness(),f=await h.begin(),otp=await setupCode(h,f);await sql("UPDATE email_counters SET n=10000 WHERE scope='month'");
 const authenticated=await h.complete(f,otp);expect(authenticated.status).toBe(200);const cookie=authenticated.headers.get('Set-Cookie')!.split(';')[0];
 const s=await (await h.call('/api/session',undefined,{Cookie:cookie})).json() as {csrf:string};
 const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':s.csrf};
 for(let i=0;i<2;i++){
  const registered=await h.call('/api/agents',{name:'창작 agent'});const a=await registered.json() as {agent:{id:string};agent_token:string;claim_url:string};
  const cap=new URL(a.claim_url).pathname.split('/').at(-1)!;
  expect((await h.call(`/api/claims/${a.agent.id}/approve`,{risk_ack_version:'toktok-risk-v1'},{...headers,Authorization:'Bearer '+cap})).status).toBe(200);
  const room=await h.call('/api/rooms',{purpose:'창작'},{Authorization:'Bearer '+a.agent_token});expect(room.status).toBe(201);
  const data=await room.json() as {room:{id:string};invite_url:string;read_url:string};
  const participant=await h.call(`/api/rooms/${data.room.id}/participants`,{nickname:'창작'}, {Authorization:'Bearer '+new URL(data.invite_url).pathname.split('/').at(-1)});expect(participant.status).toBe(201);
  const p=await participant.json() as {participant_token:string};expect((await h.call(`/api/rooms/${data.room.id}/messages`,{text:'계속 대화',client_message_id:'one'},{Authorization:'Bearer '+p.participant_token})).status).toBe(201);
  expect((await h.call(new URL(data.read_url).pathname)).status).toBe(200);
 }
 expect(h.calls).toBe(1);
});
it('controlled edge denial blocks malformed email JSON before body and DO reservation',async()=>{
 const h=harness();await h.begin();
 const worker=makeWorker({trustedIP:()=> '192.0.2.1',sendEmail:async()=>{throw Error('sender must not run');}});
 const response=await worker.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:'{malformed'}),{...h.localEnv,IP_RATE_LIMIT:{async limit(){return {success:false};}}});
 const data=await response.json() as {error:{code:string}};console.info('TOKTOK_OTP_HTTP',JSON.stringify({path:'/api/auth/email/send',status:response.status,code:data.error.code,retry_after:response.headers.get('Retry-After')}));
 expect({status:response.status,code:data.error.code}).toEqual({status:429,code:'RATE_LIMITED'});expect(h.calls).toBe(0);
 expect((await sql('SELECT COUNT(*) AS n FROM otp_codes'))[0].n).toBe(0);expect((await sql("SELECT COUNT(*) AS n FROM email_counters WHERE scope='month'"))[0].n).toBe(0);
});
it('native template keeps fixed subject/body-only OTP and masks provider error details everywhere',async()=>{
 const calls:EmailMessageBuilder[]=[],log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error');
 const binding={async send(message:EmailMessage|EmailMessageBuilder){calls.push(message as EmailMessageBuilder);throw Error('synthetic '+JSON.stringify(message));}} as SendEmail;
 const worker=makeWorker({trustedIP:()=> '192.0.2.1'}),local={...env,EMAIL:binding,EMAIL_FROM:'login@notify.fixture.test'};
 const start=await worker.fetch(new Request(origin+'/api/auth/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),local),f=await start.json() as {flow:string};
 const response=await worker.fetch(new Request(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:start.headers.get('Set-Cookie')!.split(';')[0]},body:JSON.stringify({flow_id:f.flow,email:'allowed@fixture.test',client_request_id:'native-template'})}),local);
 expect(response.status).toBe(200);expect(calls.length).toBe(1);const template=calls[0],code=template.text!.match(/\d{6}/)![0];
 expect(template.subject==='톡톡 이메일 확인').toBe(true);expect(Object.keys(template).sort()).toEqual(['from','subject','text','to']);
 expect(template.subject.includes(code)).toBe(false);expect(template.text!.includes(code)).toBe(true);
 const exposed=await response.text(),persisted=JSON.stringify(await sql('SELECT * FROM email_requests'));
 expect(exposed.includes(code)||exposed.includes('allowed@fixture.test')||exposed.includes('synthetic')).toBe(false);
 expect(persisted.includes(code)||persisted.includes('allowed@fixture.test')||persisted.includes('synthetic')).toBe(false);
 expect(log.mock.calls.length+error.mock.calls.length).toBe(0);log.mockRestore();error.mockRestore();
});
