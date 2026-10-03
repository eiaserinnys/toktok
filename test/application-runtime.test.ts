import {env as workerEnv} from 'cloudflare:workers';
import {SELF,runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {it,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {C,save,type Tx} from '../src/control-records';
import {PRIVATE_NOTICE} from '../src/private-contracts';
import {PUBLIC_NOTICE} from '../src/public-contracts';
import type {CloudflareHostEnv} from '../src/cloudflare-host';
import {newToken,hash} from '../src/http';

import {origin,env,raw,roomIds,control,privateRoom,records,takeCookie,call,parsed,bearer,anonymousGrant,asRoom,create,join,send,waitCadence,readPage,loginStart,sendCode,complete,installApplicationFixture,type Room,type Message,type Page} from './application-fixture';
installApplicationFixture();

it('common application enforces creator, exact Origin, session and admin boundaries',async()=>{
 const agent=await parsed<{agent_token:string}>(await call('register pending','/api/agents',{name:'창작 에이전트'}),201);
 expect((await call('pending creator','/api/v1/rooms',{purpose:'창작',client_request_id:crypto.randomUUID()},bearer(agent.agent_token))).status).toBe(403);
 expect((await call('missing confirmation','/api/v1/rooms',{purpose:'창작',client_request_id:crypto.randomUUID()})).status).toBe(403);
 expect((await call('foreign context','/api/private/create-context',{}, {Origin:'https://outside.example'})).status).toBe(403);
 expect((await call('no bootstrap Origin','/api/auth/start',{purpose:'login'})).status).toBe(403);
 expect((await call('admin settings denied','/api/admin/settings')).status).toBe(401);
 expect((await call('admin QA denied','/admin/design/components')).status).toBe(401);
 expect((await call('client role denied','/api/admin/settings?role=admin')).status).toBe(401);
 // Same real reservation and actor; only quota rows are controlled fixture data.
 const baseline=await create();const initializeBytes=new TextEncoder().encode(JSON.stringify({service:baseline.service,room:baseline.room})).length;
 const grant=await anonymousGrant(),request={purpose:'창작 방 <script>비신뢰</script>',creation_grant:grant,client_request_id:crypto.randomUUID()};
 await records(async tx=>{const row=(await tx.get(C.settings,'config'))!;const s=row.settings as unknown as {budget:{workloadCaps:{kind:string;day:number;month:number}[]}};const bound=s.budget.workloadCaps.find(c=>c.kind==='response_bytes')!;await save(tx,C.budgets,'usage:response_bytes:d:'+new Date().toISOString().slice(0,10),{used:bound.day-initializeBytes});});
 const lost=await parsed<{error:{code:string};room_id:string}>(await call('initialized result budget failure','/api/v1/rooms',request),409);expect(lost.error.code).toBe('CREATE_RESULT_NOT_RECOVERABLE');roomIds.add(lost.room_id);
 const replay=await parsed<{error:{code:string};room_id:string}>(await call('lost result replay','/api/v1/rooms',request),409);expect(replay.error.code).toBe('CREATE_RESULT_NOT_RECOVERABLE');expect(replay.room_id===lost.room_id).toBe(true);
});

it('two private participants exchange three rounds with capability separation, cursor pages, replay and close',async()=>{
 const r=await create();
 for(const cap of [r.invite,r.read]){
  const guide=await call('private guide GET','/r/'+r.room.id+'/'+cap+'?format=md');expect(guide.status).toBe(200);const text=await guide.text();expect(text.includes(r.owner_token)).toBe(false);expect(text).toContain('비신뢰 방 데이터');
 }
 const before=await parsed<{room:{participants:number}}>(await call('private metadata',''+r.base,undefined,bearer(r.read)));
 // No guide GET may register a participant; count inspected from the actual actor's metadata record.
 expect(await runInDurableObject(privateRoom(r.room.id),async(_i,state)=>{const repo=new CloudflareRepository(state.storage);return repo.transaction('room:'+r.room.id,async tx=>(await tx.get(C.private_rooms,r.room.id))?.participants as unknown[]);})).toHaveLength(0);
 expect(before.room).toBeDefined();
 expect((await call('read cannot join',r.base+'/participants',{nickname:'관전'},bearer(r.read))).status).toBe(403);
 const a=await join(r,'같은 이름'),b=await join(r,'같은 이름');
 for(const cap of [r.invite,r.read,r.owner_token])expect((await call('nonparticipant cannot send',r.base+'/messages',{text:'창작',client_message_id:'denied'},bearer(cap))).status).toBe(403);
 for(let n=0;n<3;n++){await parsed(await send(r,a,'a-'+n,'창작 왕복 '+n),201);await parsed(await send(r,b,'b-'+n,'<script>데이터</script> '+n),201);}
 const original=await parsed<Message>(await send(r,a,'a-0','창작 왕복 0'));expect(original.sequence).toBe(1);
 expect((await send(r,a,'a-0','바뀐 내용')).status).toBe(409);
 const first=await readPage(r,r.read,'?limit=2');expect(first.messages.map(m=>m.sequence)).toEqual([5,6]);expect(first.has_more).toBe(false);expect(first.has_older).toBe(true);
 const second=await readPage(r,a.participant_token,'?before='+encodeURIComponent(first.before_cursor)+'&limit=2');expect(second.messages.map(m=>m.sequence)).toEqual([3,4]);
 const third=await readPage(r,b.participant_token,'?before='+encodeURIComponent(second.before_cursor)+'&limit=2');expect(third.messages.map(m=>m.sequence)).toEqual([1,2]);expect(third.has_older).toBe(false);
 await waitCadence();const empty=await parsed<Page>(await call('same cursor timeout',r.base+'/wait?timeout=0&after='+encodeURIComponent(first.cursor),undefined,bearer(r.read)));expect(empty.messages).toHaveLength(0);expect(empty.cursor===first.cursor).toBe(true);
 expect((await call('participant cannot close',r.base+'/close',{},bearer(a.participant_token))).status).toBe(403);
 expect((await call('owner close',r.base+'/close',{},bearer(r.owner_token))).status).toBe(200);
 expect((await send(r,a,'after-close')).status).toBe(410);expect((await call('closed invite join',r.base+'/participants',{nickname:'새 사람',client_request_id:crypto.randomUUID(),notice_version:PRIVATE_NOTICE,visibility:'private',retention_mode:'recent_buffer'},bearer(r.invite))).status).toBe(410);
 const history=await readPage(r,r.owner_token);expect(history.messages).toHaveLength(6);expect(history.room_status).toBe('closed');
 const state=await records(tx=>tx.get(C.settings,'state'));expect(state?.active_private).toBe(0);
});

it('recent buffer restart restores sequence and expired private data is unreadable through the common route',async()=>{
 const r=await create(),p=await join(r,'창작');await parsed(await send(r,p,'before-restart'),201);
 const old=await readPage(r,r.read);await evictDurableObject(privateRoom(r.room.id));
 const reset=await readPage(r,r.read,'?after='+encodeURIComponent(old.cursor));expect(reset.history_status).toBe('ok');expect(reset.messages).toHaveLength(0);expect(reset.epoch).toBe(old.epoch);
 // Explicit storage fixture expiration, not a wall-clock TTL elapse claim.
 await runInDurableObject(privateRoom(r.room.id),async(_i,state)=>{await new CloudflareRepository(state.storage).transaction('room:'+r.room.id,async tx=>{const value=(await tx.get(C.private_rooms,r.room.id))!;const snapshot=value.snapshot as {[key:string]:import('../src/storage/repository').JsonValue};snapshot.expires_at=Date.now()-1;await tx.put(C.private_rooms,r.room.id,value);});});
 await evictDurableObject(privateRoom(r.room.id));expect((await call('expired metadata',r.base,undefined,bearer(r.read))).status).toBe(410);
 const maintenance=await runInDurableObject(privateRoom(r.room.id),async(_i,state)=>{const row=await new CloudflareRepository(state.storage).transaction('room:'+r.room.id,tx=>tx.get(C.private_rooms,r.room.id));return {status:row?.status,alarm:await state.storage.getAlarm()};});
 raw.push({step:'fetch maintenance deleted metadata state and cleared alarm',status:maintenance.status==='deleted'&&maintenance.alarm===null?200:500,retry_after:null,state:{status:String(maintenance.status),alarm:maintenance.alarm}});
 expect(maintenance).toEqual({status:'deleted',alarm:null});
 expect((await call('expired HTML','/r/'+r.room.id+'/'+r.read,undefined,{Accept:'text/html'})).status).toBe(410);
 const count=await runInDurableObject(privateRoom(r.room.id),async(_i,state)=>new CloudflareRepository(state.storage).transaction('room:'+r.room.id,async tx=>(await tx.list(C.private_messages,{limit:100})).length));expect(count).toBe(0);
});

it('common assets and room entry negotiate HTML, Markdown and JSON with secure errors and no GET join',async()=>{
 for(const path of ['/','/guide','/styles.css','/app.js','/favicon.svg']){const r=await call('local asset',path,undefined,{Accept:'text/html'});expect(r.status).toBe(200);expect(r.headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'none'; base-uri 'none'");expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');}
 const r=await create();for(const cap of [r.invite,r.read]){
  const path='/r/'+r.room.id+'/'+cap,html=await call('valid shared HTML',path,undefined,{Accept:'text/html'});expect(html.status).toBe(200);expect(html.headers.get('Content-Type')).toContain('text/html');expect((await html.text()).includes(r.owner_token)).toBe(false);
  for(const [suffix,accept] of [['','text/markdown'],['?format=md','text/html']]){const md=await call('shared Markdown',path+suffix,undefined,{Accept:accept});expect(md.status).toBe(200);expect(md.headers.get('Content-Type')).toContain('text/markdown');}
 }
 const api=await call('API stays JSON',r.base,undefined,{...bearer(r.read),Accept:'text/html'});expect(api.headers.get('Content-Type')).toContain('application/json');
 const denied=await call('invalid HTML','/r/'+r.room.id+'/'+'x'.repeat(43),undefined,{Accept:'text/html'});expect(denied.status).toBe(403);expect(denied.headers.get('Content-Type')).toContain('text/html');
 const missing=crypto.randomUUID();expect((await call('missing shared HTML','/r/'+missing+'/'+'x'.repeat(43),undefined,{Accept:'text/html'})).status).toBe(404);
 const blank=await runInDurableObject(privateRoom(missing),(_i,state)=>({tables:state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('__cf_kv','_cf_KV','_cf_METADATA')").toArray().length}));
 raw.push({step:'missing GET leaves application schema blank',status:blank.tables===0?200:500,retry_after:null,state:{application_tables:blank.tables}});expect(blank.tables).toBe(0);
 expect((await call('owner delete',r.base,undefined,bearer(r.owner_token),'DELETE')).status).toBe(204);
 expect((await call('deleted shared HTML','/r/'+r.room.id+'/'+r.read,undefined,{Accept:'text/html'})).status).toBe(410);
});

it('public browser acknowledgement and separate watcher use real common HTTP and the recent-buffer actor',async()=>{
 const base='/api/public/rooms/common-room';
 expect((await call('unchecked public grant',base+'/operator-grants',{nonce:'x'.repeat(43),checked:false,risk_ack_version:PUBLIC_NOTICE},{Origin:origin})).status).toBe(403);
 const flow=await call('public acknowledgement context',base+'/ack-flow',{}, {Origin:origin});const {nonce}=await parsed<{nonce:string}>(flow,201);const cookie=takeCookie(flow,'__Host-toktok-public-flow');
 const grant=await parsed<{operator_grant:string}>(await call('public acknowledgement grant',base+'/operator-grants',{nonce,checked:true,risk_ack_version:PUBLIC_NOTICE},{Origin:origin,Cookie:cookie}),201);
 const participant=await parsed<{lease_token:string}>(await call('public participant',base+'/participants',{operator_grant:grant.operator_grant,nickname:'창작 공개참여자',client_request_id:crypto.randomUUID(),notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'}),201);
 const watcher=await parsed<{lease_token:string}>(await call('public watcher',base+'/watchers',{notice_version:PUBLIC_NOTICE}),201);
 expect((await call('watcher cannot send',base+'/messages',{text:'거부',client_message_id:crypto.randomUUID()},bearer(watcher.lease_token))).status).toBe(403);
 expect((await call('public participant message',base+'/messages',{text:'공개 창작 데이터',client_message_id:crypto.randomUUID()},bearer(participant.lease_token))).status).toBe(201);
 const page=await parsed<Page>(await call('public watcher read',base+'/messages',undefined,bearer(watcher.lease_token)));expect(page.messages).toHaveLength(1);
 expect((await call('public lease cleanup',base+'/lease',undefined,bearer(participant.lease_token),'DELETE')).status).toBe(204);
});

it('configured email month cap allows existing OTP completion, two explicit claims and real private messaging without new mail',async()=>{
 const adminFlow=await loginStart(),adminCode=await sendCode(adminFlow,'admin@fixture.example'),admin=await complete(adminFlow,adminCode);
 expect((await call('bootstrap admin explicit','/api/admin/bootstrap',{confirm:true},admin.headers)).status).toBe(200);
 const invite=await parsed<{code:string}>(await call('admin invitation','/api/admin/invitations',{},admin.headers),201);
 const validated=await call('invitation validation','/api/auth/invitations/validate',{code:invite.code},{Origin:origin});const validation=await parsed<{invite_validation_id:string}>(validated);
 const f=await loginStart('signup',{Cookie:takeCookie(validated,'__Host-toktok-flow')},{invitation_validation_id:validation.invite_validation_id});const otp=await sendCode(f,'member@fixture.example');
 const month=new Date().toISOString().slice(0,7);await records(async tx=>{const config=await tx.get(C.settings,'config');const settings=config!.settings as unknown as {identity:{emailLimits:{month:number}}};await save(tx,C.budgets,'usage:email_attempts:m:'+month,{used:settings.identity.emailLimits.month});});
 const blocked=await loginStart();expect((await call('new email blocked at cap','/api/auth/email/send',{flow_id:blocked.flow,email:'another@fixture.example',client_request_id:crypto.randomUUID()},{Origin:origin,Cookie:blocked.cookie})).status).toBe(429);
 const member=await complete(f,otp);expect(member.session.role).toBe('member');
 const callsBefore=await parsed<{calls:number}>(await SELF.fetch(origin+'/__application/metrics'));
 const agents=[] as {agent_token:string;id:string}[];
 for(let n=0;n<2;n++){
  const a=await parsed<{agent_token:string;claim_url:string;agent:{id:string}}>(await call('register claim '+n,'/api/agents',{name:'창작 agent '+n}),201);const claim=new URL(a.claim_url).pathname.split('/').at(-1)!;
  expect((await call('CSRF required claim','/api/claims/'+a.agent.id+'/approve',{risk_ack_version:PRIVATE_NOTICE},{Origin:origin,Cookie:member.cookie,...bearer(claim)})).status).toBe(403);
  expect((await call('explicit claim '+n,'/api/claims/'+a.agent.id+'/approve',{risk_ack_version:PRIVATE_NOTICE},{...member.headers,...bearer(claim)})).status).toBe(200);agents.push({agent_token:a.agent_token,id:a.agent.id});
 }
 const context=await call('member create context','/api/private/create-context',{},member.headers);const c=await parsed<{nonce:string}>(context);const grant=await parsed<{creation_grant:string}>(await call('member create confirmation','/api/private/create-grants',{nonce:c.nonce,risk_ack:true,risk_ack_version:PRIVATE_NOTICE},{...member.headers,Cookie:member.cookie+'; '+takeCookie(context,'__Host-toktok_create')}));
 const humanRoom=asRoom(await parsed<Room>(await call('session room create','/api/v1/rooms',{purpose:'세션 창작',creation_grant:grant.creation_grant,client_request_id:crypto.randomUUID()},member.headers),201));
 const machineRoom=asRoom(await parsed<Room>(await call('approved agent room create','/api/v1/rooms',{purpose:'agent 창작',client_request_id:crypto.randomUUID()},bearer(agents[0].agent_token)),201));
 for(const room of [humanRoom,machineRoom]){const p=await join(room,'창작 참여');await parsed(await send(room,p,'cap-does-not-stop-messages'),201);expect((await readPage(room,room.read)).messages).toHaveLength(1);}
 const callsAfter=await parsed<{calls:number}>(await SELF.fetch(origin+'/__application/metrics'));expect(callsAfter.calls).toBe(callsBefore.calls);
 raw.push({step:'existing session claim/create additional mail zero',status:200,retry_after:null});
});

it('new cheap edge admin delta blocks before control and meters successful real-role QA responses',async()=>{
 await parsed(await call('initialize configuration','/api/config'));
 const metric=async()=>parsed<{edge_calls:number;control_calls:number;asset_calls:number}>(await SELF.fetch(origin+'/__application/metrics'));
 const edge=async(success:boolean)=>{await (await SELF.fetch(origin+'/__application/edge',{method:'POST',body:JSON.stringify({success})})).arrayBuffer();};
 const seedSession=async(role:'admin'|'member')=>{const token=newToken(),id=crypto.randomUUID(),sessionHash=await hash(token);await records(async tx=>{
  await save(tx,C.accounts,'a:'+id,{id,provider:'email-otp',subject:role+'@fixture.example',email:role+'@fixture.example',email_verified:1,role,admission_kind:'invited',can_create_private:1,can_persist_private:1});
  await save(tx,C.sessions,sessionHash,{owner_id:id,csrf:newToken(),expires_at:Date.now()+60000});
 });return '__Host-toktok_session='+token;};
 const adminCookie=await seedSession('admin'),memberCookie=await seedSession('member');
 await edge(false);const deniedBefore=await metric();
 for(const path of ['/admin','/admin/design/components','/api/admin/settings']){const denied=await call('cheap edge denies protected route',path,path==='/api/admin/settings'?{invalid:'fixture'}:undefined,{Cookie:adminCookie},path==='/api/admin/settings'?'PUT':'GET');expect(denied.status).toBe(429);}
 const deniedAfter=await metric();raw.push({step:'cheap edge before role body and Assets',status:200,retry_after:null,state:{control_delta:deniedAfter.control_calls-deniedBefore.control_calls,asset_delta:deniedAfter.asset_calls-deniedBefore.asset_calls,edge_delta:deniedAfter.edge_calls-deniedBefore.edge_calls}});
 expect(deniedAfter.control_calls-deniedBefore.control_calls).toBe(0);expect(deniedAfter.asset_calls-deniedBefore.asset_calls).toBe(0);expect(deniedAfter.edge_calls-deniedBefore.edge_calls).toBe(3);
 await edge(true);const anonymousBefore=await metric();expect((await call('QA query role grants nothing','/admin/design/components?role=admin')).status).toBe(401);const anonymousAfter=await metric();expect(anonymousAfter.control_calls-anonymousBefore.control_calls).toBe(0);
 expect((await call('DB member QA denied','/admin/design/components?role=admin',undefined,{Cookie:memberCookie})).status).toBe(403);
 const usage=()=>records(async tx=>{const day=new Date().toISOString().slice(0,10);return {admission:Number((await tx.get(C.budgets,'usage:admission_requests:d:'+day))?.used??0),bytes:Number((await tx.get(C.budgets,'usage:response_bytes:d:'+day))?.used??0)};});
 const before=await usage(),qa=await call('DB admin actual QA','/admin/design/components',undefined,{Cookie:adminCookie});const bytes=(await qa.arrayBuffer()).byteLength,after=await usage();
 raw.push({step:'successful QA reserves admission and serialized bytes',status:qa.status,retry_after:null,state:{admission_delta:after.admission-before.admission,response_bytes_delta:after.bytes-before.bytes,serialized_bytes:bytes}});
 expect(qa.status).toBe(200);expect(after.admission-before.admission).toBe(1);expect(after.bytes-before.bytes).toBe(bytes);expect(qa.headers.get('Content-Security-Policy')).toContain("connect-src 'none'");
});
