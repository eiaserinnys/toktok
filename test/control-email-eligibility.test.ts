import {SELF} from 'cloudflare:test';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {reset,records,seedMember,C,save,hash,newToken,origin} from './control-auth-host';
import {Invitations} from '../src/invitations';
import {SettingsStore} from '../src/settings-store';
import type {Settings} from '../src/settings-schema';

// Local Workers SQLite + production identity/control handlers. Only the existing
// test entry's clock, trusted IP and in-memory sender replace infrastructure.
// Credentials/OTP/address data stay in variables; evidence contains numbers/codes.
interface Flow {flow:string;nonce:string;cookie:string;}
interface Invite {id:string;code:string;}
interface Receipt {receipt:string;state:string;retry_after:number;expires_at:string;message:string;}
interface Reply<T> {status:number;data:T;cookie:string;retry:string|null;}
type Evidence={step:string;status?:number;code?:string;state?:Record<string,number|boolean|string>};
let now:number,evidence:Evidence[];
async function call<T=Record<string,unknown>>(path:string,payload?:unknown,headers:Record<string,string>={},method?:string):Promise<Reply<T>>{
 const r=await SELF.fetch(origin+path,{method:method??(payload===undefined?'GET':'POST'),headers:{Origin:origin,'Content-Type':'application/json',...headers},body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await r.json() as T,code=(data as {error?:{code?:string}}).error?.code;
 if(!path.startsWith('/__control/'))evidence.push({step:path.replace(/[a-f0-9-]{36}/g,'<id>'),status:r.status,...(code?{code}:{})});
 return {status:r.status,data,cookie:r.headers.get('Set-Cookie')?.split(';')[0]??'',retry:r.headers.get('Retry-After')};
}
async function time(t:number){now=t;await call('/__control/time',{now});}
async function policy(mode:Settings['deployment']['mode'],signup:Settings['signup']['policy']){
 await records(async tx=>{const store=new SettingsStore(tx),r=await store.read();await store.stateSave({...await store.state(),lifecycle_ready:true});r.settings.deployment.mode=mode;r.settings.signup.policy=signup;await store.update(r.revision,r.settings,'fictional-test-operator',now);});
}
async function invite(ttl=600000):Promise<Invite>{
 const id=crypto.randomUUID(),code=newToken(),tokenHash=await hash(code);
 await records(tx=>new Invitations(tx).create(id,tokenHash,now+ttl,now));return {id,code};
}
async function begin(purpose:'login'|'signup'='login',i?:Invite):Promise<Flow>{
 let cookie='',validation:string|undefined;
 if(i){const r=await call<{invite_validation_id:string}>('/api/auth/invitations/validate',{code:i.code});expect(r.status).toBe(200);cookie=r.cookie;validation=r.data.invite_validation_id;}
 const r=await call<{flow:string;nonce:string}>('/api/auth/start',{purpose,...(validation?{invitation_validation_id:validation}:{})},cookie?{Cookie:cookie}:{});
 expect(r.status).toBe(200);return {...r.data,cookie:r.cookie};
}
const send=(f:Flow,email:string,id=crypto.randomUUID())=>call<Receipt>('/api/auth/email/send',{flow_id:f.flow,email,client_request_id:id},{Cookie:f.cookie});
async function complete(f:Flow,email:string){
 // This synthetic sender inbox is confined to control-port-worker.ts, never a
 // live provider or public product route; do not log the retrieved OTP.
 const code=await call<{code?:string}>('/__control/code?email='+encodeURIComponent(email));expect(typeof code.data.code==='string').toBe(true);
 return call('/api/auth/complete',{flow:f.flow,nonce:f.nonce,otp:code.data.code},{Cookie:f.cookie});
}
async function state(){
 const calls=(await call<{calls:number}>('/__control/metrics')).data.calls;
 return records(async tx=>({calls,emailQuantity:Number((await tx.get(C.budgets,'usage:email_attempts:m:2030-01'))?.used??0),estimate:Number((await tx.get(C.budgets,'estimate:m:2030-01'))?.used??0),codes:(await tx.list(C.otp,{prefix:'code:',limit:100})).length,suppressed:(await tx.list(C.otp,{prefix:'request:',limit:100})).filter(r=>r.value.state==='suppressed').length,accounts:(await tx.list(C.accounts,{prefix:'a:',limit:100})).length,sessions:(await tx.list(C.sessions,{limit:100})).length}));
}
function generic(r:Reply<Receipt>){expect(r.status).toBe(200);expect(r.data.state).toBe('attempted');expect(r.data.message).toBe('허용된 주소라면 인증 코드를 보냈습니다. 도착하지 않으면 간격 후 다시 시도해주세요.');expect(r.retry).toBe('120');return {keys:Object.keys(r.data).sort(),state:r.data.state,retry:r.data.retry_after,message:r.data.message,expires:r.data.expires_at};}
beforeEach(async()=>{evidence=[];await reset();await call('/__control/reset',{});now=Date.UTC(2030,0,1);expect((await call('/api/config')).status).toBe(200);});
afterEach(async()=>{evidence.push({step:'final-safe-counts',state:await state()});console.info('EMAIL_ELIGIBILITY_EVIDENCE',JSON.stringify(evidence));});

it('DEMO invalid or subsequently revoked, used and expired invitations cannot reserve or dispatch signup mail',async()=>{
 expect((await call('/api/auth/invitations/validate',{code:newToken()})).status).toBe(400);
 expect((await call('/api/auth/start',{purpose:'signup'})).status).toBe(400);
 for(const kind of ['revoked','used','expired'] as const){
  const i=await invite(kind==='expired'?60000:600000),f=await begin('signup',i);
  if(kind==='expired')await time(now+60001);
  else await records(async tx=>{const old=await tx.get(C.invitations,'i:'+i.id);await save(tx,C.invitations,'i:'+i.id,{...old!,status:kind});});
  generic(await send(f,kind+'@fiction.example'));
 }
 expect(await state()).toMatchObject({calls:0,emailQuantity:0,estimate:0,codes:0,suppressed:3,accounts:0,sessions:0});
});

it('DEMO admits one valid invited signup, suppresses a second bound flow after consumption, and only logs in existing accounts',async()=>{
 const i=await invite(),first=await begin('signup',i),other=await begin('signup',i);
 const accepted=generic(await send(first,'invited@fiction.example'));expect((await complete(first,'invited@fiction.example')).status).toBe(200);
 const suppressed=generic(await send(other,'unadmitted@fiction.example'));expect(suppressed).toEqual(accepted);
 expect(await records(async tx=>(await tx.get(C.invitations,'i:'+i.id))?.status)).toBe('used');
 await time(now+120000);generic(await send(await begin(),'invited@fiction.example'));generic(await send(await begin(),'unknown@fiction.example'));
 expect(await state()).toMatchObject({calls:2,emailQuantity:2,codes:1,suppressed:2,accounts:1,sessions:1});
});

it('DEMO bootstrap mail requires both an unused designation and no existing admin, without auto-granting admin',async()=>{
 // Probe each persisted bootstrap gate before any account exists at that address.
 await records(tx=>save(tx,C.accounts,'admin',{id:crypto.randomUUID()}));
 generic(await send(await begin(),'admin@fixture.example'));
 await records(async tx=>{await tx.delete(C.accounts,'admin');const store=new SettingsStore(tx);await store.stateSave({...await store.state(),bootstrap_consumed:true});});
 await time(now+120000);generic(await send(await begin(),'admin@fixture.example'));
 expect(await state()).toMatchObject({calls:0,emailQuantity:0,codes:0,suppressed:2});
 await records(async tx=>{const store=new SettingsStore(tx);await store.stateSave({...await store.state(),bootstrap_consumed:false});});
 await time(now+3600000);const f=await begin();generic(await send(f,'admin@fixture.example'));
 const verified=await complete(f,'admin@fixture.example');expect(verified.status).toBe(200);
 const session=await call<{role:string;csrf_token:string}>('/api/session',undefined,{Cookie:verified.cookie});expect(session.data.role).toBe('member');
 expect((await call('/api/admin/bootstrap',{confirm:true},{Cookie:verified.cookie})).status).toBe(403);
 expect((await call('/api/admin/bootstrap',{confirm:false},{Cookie:verified.cookie,'X-CSRF-Token':session.data.csrf_token})).status).toBe(403);
 expect((await call('/api/admin/bootstrap',{confirm:true},{Cookie:verified.cookie,'X-CSRF-Token':session.data.csrf_token})).status).toBe(200);
 // The one-hour clock change expires the earlier suppressed receipts.
 expect(await state()).toMatchObject({calls:1,emailQuantity:1,codes:0,suppressed:0,accounts:1,sessions:1});
});

it('HOSTED open signup is explicit while login stays existing-only and invite/closed reject uninvited signup',async()=>{
 await policy('hosted','open');generic(await send(await begin(),'login-unknown@fiction.example'));
 const f=await begin('signup');generic(await send(f,'hosted-signup@fiction.example'));expect((await complete(f,'hosted-signup@fiction.example')).status).toBe(200);
 await policy('hosted','invite');expect((await call('/api/auth/start',{purpose:'signup'})).status).toBe(400);
 await policy('hosted','closed');expect((await call('/api/auth/start',{purpose:'signup'})).status).toBe(403);
 expect(await state()).toMatchObject({calls:1,emailQuantity:1,codes:0,suppressed:1,accounts:1,sessions:1});
});

it.each(['demo','hosted'] as const)('%s closing signup suppresses a bound invite before mail and rejects previously issued new-account OTP',async mode=>{
 await policy(mode,'invite');const issued=await begin('signup',await invite()),pending=await begin('signup',await invite());
 const before=generic(await send(issued,'issued-before-close@fiction.example'));
 await policy(mode,'closed');const after=generic(await send(pending,'pending-after-close@fiction.example'));expect(after).toEqual(before);
 const completed=await complete(issued,'issued-before-close@fiction.example'),actual=await state();evidence.push({step:'closed-policy-new-account-result',status:completed.status,state:actual});
 expect({completion:completed.status,calls:actual.calls,emailQuantity:actual.emailQuantity,codes:actual.codes,accounts:actual.accounts,sessions:actual.sessions,suppressed:actual.suppressed}).toEqual({completion:403,calls:1,emailQuantity:1,codes:1,accounts:0,sessions:0,suppressed:1});
 // Existing-account login is independent of new-signup closure.
 await seedMember('existing-after-close@fiction.example');const existing=await begin();generic(await send(existing,'existing-after-close@fiction.example'));expect((await complete(existing,'existing-after-close@fiction.example')).status).toBe(200);
});
