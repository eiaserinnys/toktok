import {SELF} from 'cloudflare:test';
import {it,expect} from 'vitest';
import {createHttpApplication} from '../src/application';
import {cfControl} from '../src/cloudflare-host';
import {C,save} from '../src/control-records';
import {hash,newToken} from '../src/http';
import {budgetWindows} from '../src/control-policy';
import type {Settings} from '../src/settings-schema';
import {origin,env,raw,records,call,parsed,installApplicationFixture} from './application-fixture';
installApplicationFixture();
interface Principal {cookie:string;csrf:string;}
async function principal(role:'admin'|'member',now=Date.now()):Promise<Principal>{
 const id=crypto.randomUUID(),token=newToken(),csrf=newToken(),session_hash=await hash(token);
 await records(async tx=>{await save(tx,C.accounts,'a:'+id,{id,provider:'email-otp',subject:role+'@fixture.example',email:role+'@fixture.example',email_verified:1,role,admission_kind:'invited',can_create_private:1,can_persist_private:1});await save(tx,C.sessions,session_hash,{owner_id:id,csrf,expires_at:now+43200000});});return {cookie:'__Host-toktok_session='+token,csrf};
}
async function recoveryUsage(now=Date.now()){
 return records(async tx=>{const w=budgetWindows(now);return {minute:Number((await tx.get(C.budgets,'recovery:minute:'+Math.floor(now/60000)))?.used??0),day:Number((await tx.get(C.budgets,'recovery:day:'+w.day))?.used??0),month:Number((await tx.get(C.budgets,'recovery:month:'+w.month))?.used??0),ops:(await tx.list(C.budgets,{prefix:'recovery:op:',limit:100})).length};});
}
async function initialize(){await parsed(await call('initialize recovery fixture','/api/config'));return records(async tx=>await tx.get(C.settings,'config') as unknown as {revision:number;settings:Settings});}

it('host budget exhaustion permits only real admin recovery reads, CSRF settings and logout without widening sensitive routes',async()=>{
 const config=await initialize(),admin=await principal('admin'),member=await principal('member'),headers={Cookie:admin.cookie},mutation={...headers,Origin:origin,'X-CSRF-Token':admin.csrf},day=budgetWindows(Date.now()).day;
 await records(tx=>save(tx,C.budgets,'usage:admission_requests:d:'+day,{used:config.settings.budget.workloadCaps.find(c=>c.kind==='admission_requests')!.day}));
 expect((await call('exhausted no cookie settings','/api/admin/settings')).status).toBe(401);
 expect((await call('exhausted member settings','/api/admin/settings',undefined,{Cookie:member.cookie})).status).toBe(403);
 expect((await call('exhausted missing CSRF PUT','/api/admin/settings',{expected_revision:config.revision,settings:config.settings},{Cookie:admin.cookie,Origin:origin},'PUT')).status).toBe(403);
 expect((await call('exhausted foreign Origin PUT','/api/admin/settings',{}, {...mutation,Origin:'https://outside.example'},'PUT')).status).toBe(403);
 const denied=await recoveryUsage();raw.push({step:'denied recovery usage before assertions',status:200,retry_after:null,state:denied});expect(denied.day).toBe(0);
 const settings=await parsed<{revision:number;settings:Settings}>(await call('exhausted admin settings recovery','/api/admin/settings',undefined,headers));
 await parsed(await call('exhausted admin schema recovery','/api/admin/settings/schema',undefined,headers));
 const budget=await parsed<{recovery:{usage:{day:number}}}>(await call('exhausted admin budget recovery','/api/admin/budget',undefined,headers));expect(budget.recovery.usage.day).toBe(3);
 const session=await parsed<{role:string}>(await call('exhausted admin session recovery','/api/session',undefined,headers));expect(session.role).toBe('admin');
 const html=await call('exhausted admin operational HTML','/admin/overview',undefined,{...headers,Accept:'text/html'});expect(html.status).toBe(200);expect(html.headers.get('Content-Type')).toContain('text/html');
 const qa=await call('QA remains fail closed without recovery','/admin/design',undefined,mutation);expect(qa.status).toBe(503);expect((await qa.json() as {error:{code:string}}).error.code).toBe('ADMIN_AUTH_UNAVAILABLE');
 for(const [path,body] of [['/api/admin/invitations',undefined],['/api/auth/email/send',{flow_id:'fixture',email:'member@fixture.example',client_request_id:crypto.randomUUID()}],['/api/admin/invitations',{}],['/api/v1/rooms',{purpose:'창작',client_request_id:crypto.randomUUID()}]] as const){const denied=await call('excluded recovery route remains capped',path,body,mutation);expect(denied.status).toBe(429);expect((await denied.json() as {error:{code:string}}).error.code).toBe('BUDGET_EXCEEDED');}
 const unchanged=await recoveryUsage();raw.push({step:'excluded routes recovery usage before assertions',status:200,retry_after:null,state:unchanged});expect(unchanged.day).toBe(5);expect(unchanged.ops).toBe(5);
 settings.settings.budget.warningUsd=41;const updated=await parsed<{revision:number}>(await call('exhausted CSRF settings recovery','/api/admin/settings',{expected_revision:settings.revision,settings:settings.settings},mutation,'PUT'));expect(updated.revision).toBe(settings.revision+1);
 await parsed(await call('exhausted logout recovery','/api/auth/logout',{},mutation));expect((await call('revoked session cannot recover','/api/admin/settings',undefined,headers)).status).toBe(401);
 const final=await recoveryUsage(),metrics=await parsed<{calls:number}>(await SELF.fetch(origin+'/__application/metrics'));raw.push({step:'host recovery totals before assertions',status:200,retry_after:null,state:{...final,mail_calls:metrics.calls}});expect(final.day).toBe(7);expect(final.ops).toBe(7);expect(metrics.calls).toBe(0);
});

it('recovery continuation checks QA failure, excluded sensitive routes and CSRF PUT logout only',async()=>{
 const config=await initialize(),admin=await principal('admin'),mutation={Cookie:admin.cookie,Origin:origin,'X-CSRF-Token':admin.csrf},day=budgetWindows(Date.now()).day;
 await records(tx=>save(tx,C.budgets,'usage:admission_requests:d:'+day,{used:config.settings.budget.workloadCaps.find(c=>c.kind==='admission_requests')!.day}));
 const before=await recoveryUsage();raw.push({step:'continuation baseline before assertions',status:200,retry_after:null,state:before});expect(before.day).toBe(0);
 const qa=await call('continuation QA exact failure','/admin/design',undefined,mutation);
 expect(qa.status).toBe(503);expect((await qa.json() as {error:{code:string}}).error.code).toBe('ADMIN_AUTH_UNAVAILABLE');
 const afterQa=await recoveryUsage();raw.push({step:'continuation QA recovery delta before assertions',status:200,retry_after:null,state:{day_delta:afterQa.day-before.day,op_delta:afterQa.ops-before.ops}});expect(afterQa).toEqual(before);
 for(const [path,body] of [['/api/admin/invitations',undefined],['/api/auth/email/send',{flow_id:'fixture',email:'member@fixture.example',client_request_id:crypto.randomUUID()}],['/api/admin/invitations',{}],['/api/v1/rooms',{purpose:'창작',client_request_id:crypto.randomUUID()}]] as const){
  const denied=await call('continuation excluded sensitive route',path,body,mutation);
  expect(denied.status).toBe(429);expect((await denied.json() as {error:{code:string}}).error.code).toBe('BUDGET_EXCEEDED');
 }
 const excluded=await recoveryUsage(),metricsBefore=await parsed<{calls:number}>(await SELF.fetch(origin+'/__application/metrics'));
 raw.push({step:'continuation excluded routes state before assertions',status:200,retry_after:null,state:{...excluded,mail_calls:metricsBefore.calls}});expect(excluded).toEqual(before);expect(metricsBefore.calls).toBe(0);
 config.settings.budget.warningUsd=41;
 const updated=await parsed<{revision:number}>(await call('continuation CSRF settings PUT','/api/admin/settings',{expected_revision:config.revision,settings:config.settings},mutation,'PUT'));expect(updated.revision).toBe(config.revision+1);
 const afterPut=await recoveryUsage();raw.push({step:'continuation PUT single reservation before assertions',status:200,retry_after:null,state:afterPut});expect(afterPut.day).toBe(1);expect(afterPut.ops).toBe(1);
 const loggedOut=await parsed<{logged_out:boolean}>(await call('continuation logout','/api/auth/logout',{},mutation));expect(loggedOut.logged_out).toBe(true);
 expect((await call('continuation revoked session denied','/api/admin/settings',undefined,{Cookie:admin.cookie})).status).toBe(401);
 const final=await recoveryUsage(),metrics=await parsed<{calls:number}>(await SELF.fetch(origin+'/__application/metrics'));
 raw.push({step:'continuation final state before assertions',status:200,retry_after:null,state:{...final,mail_calls:metrics.calls}});expect(final.day).toBe(2);expect(final.ops).toBe(2);expect(metrics.calls).toBe(0);
});

it('actual admin control with synthetic Assets enforces 64KiB for admission and response-only recovery and exact HTML allowlist',async()=>{
 await initialize();let now=Date.UTC(2030,0,1),size=65537,assets=0;const admin=await principal('admin',now),control=cfControl(env),w=budgetWindows(now);
 // Only platform IO/clock fixture differs. Actual ControlPlane, session, role and recovery transactions remain live.
 const app=createHttpApplication({origin,control,assets:{async fetch(){assets++;return new Response('x'.repeat(size),{headers:{'Content-Type':'text/html'}});}},edgeLimit:{async limit(){return {success:true};}},trustedIP:()=> '192.0.2.1',ready:()=>true,auth:{now:()=>now},publicRoom:async(slug,config)=>{const r=env.PUBLIC_ROOMS.getByName(slug);await r.applyConfiguration(config);return r;},privateRoom:id=>env.PRIVATE_ROOMS.getByName(id)});
 const request=async(path:string)=>{const r=await app.fetch(new Request(origin+path,{headers:{Cookie:admin.cookie,Accept:'text/html'}})),bytes=await r.arrayBuffer();let code:string|undefined;if(r.headers.get('Content-Type')?.includes('json'))code=(JSON.parse(new TextDecoder().decode(bytes)) as {error:{code:string}}).error.code;raw.push({step:'synthetic Assets recovery HTTP',status:r.status,code,retry_after:r.headers.get('Retry-After'),state:{bytes:bytes.byteLength}});return {status:r.status,code,bytes:bytes.byteLength};};
 await records(tx=>save(tx,C.budgets,'estimate:m:'+w.month,{used:35000000}));
 const large=await request('/admin/overview');expect(large.status).toBe(503);expect(large.code).toBe('ADMIN_RECOVERY_RESPONSE_LIMIT');let usage=await recoveryUsage(now);expect(usage.day).toBe(1);expect(usage.ops).toBe(1);
 // Normal admission now succeeds, response quantity fails: the same request gets exactly one recovery reservation.
 const config=await records(async tx=>await tx.get(C.settings,'config') as unknown as {settings:Settings});
 await records(async tx=>{await save(tx,C.budgets,'estimate:m:'+w.month,{used:0});await save(tx,C.budgets,'usage:response_bytes:d:'+w.day,{used:config.settings.budget.workloadCaps.find(c=>c.kind==='response_bytes')!.day});});
 size=65536;const bounded=await request('/admin/overview');expect(bounded).toEqual({status:200,code:undefined,bytes:65536});usage=await recoveryUsage(now);expect(usage.day).toBe(2);expect(usage.ops).toBe(2);
 size=65537;const responseOnlyLarge=await request('/admin/overview');expect(responseOnlyLarge.status).toBe(503);expect(responseOnlyLarge.code).toBe('ADMIN_RECOVERY_RESPONSE_LIMIT');usage=await recoveryUsage(now);expect(usage.day).toBe(3);expect(usage.ops).toBe(3);
 // New fixture UTC minute isolates route coverage from the already-proven fixed minute cap without raising it.
 now+=60000;size=1;await records(tx=>save(tx,C.budgets,'estimate:m:'+w.month,{used:35000000}));
 for(const path of ['/admin','/admin/overview','/admin/public','/admin/private','/admin/budget','/admin/identity','/admin/signup','/admin/deployment'])expect((await request(path)).status).toBe(200);
 expect((await request('/admin/unknown')).status).toBe(429);
 usage=await recoveryUsage(now);raw.push({step:'exact allowlist synthetic IO recovery state before assertions',status:200,retry_after:null,state:{...usage,asset_calls:assets}});expect(usage.minute).toBe(8);expect(usage.day).toBe(11);expect(usage.ops).toBe(8);expect(assets).toBe(11);
});
