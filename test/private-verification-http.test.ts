import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer as probeServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
import {createApplication} from '../src/selfhost/application';
import {DEFAULT_SETTINGS,type Settings} from '../src/settings-schema';
import {demoInstallationProfile} from '../src/installation-profile';
import {RecordCollection as C} from '../src/storage/repository';
import {PRIVATE_NOTICE} from '../src/private-contracts';
import {hash,newToken} from '../src/http';

type HeadersInput=Record<string,string>;
interface ErrorData {error?:{code?:string};}
interface Reply<T>{status:number;data:T;headers:Headers;}
interface Room {room:{id:string;status:string;mode:string;retention_mode:string;notice_version:string;expires_at:string;created_at:string};owner_token:string;invite_url:string;read_url:string;}
interface Owned extends Room {base:string;invite:string;read:string;}
interface Participant {participant_token:string;sender:{id:string;nickname:string};}
interface Message {sequence:number;cursor:string;text:string;sender:{id:string};}
interface Page {messages:Message[];cursor:string;epoch:string;has_more:boolean;room_status:string;history_status:string;}
const status=<T>(r:Reply<T>,expected:number,label:string)=>assert.equal(r.status,expected,label+' (response body deliberately omitted)');
const cookie=(r:Reply<unknown>,name:string)=>r.headers.getSetCookie().find(v=>v.startsWith(name+'='))?.split(';')[0]??'';
async function fixture(t:TestContext,profile=demoInstallationProfile()){
 const dir=mkdtempSync(join(tmpdir(),'toktok-private-verification-')),file=join(dir,'db.sqlite');applySQLite(file);
 const probe=probeServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert(address&&typeof address==='object');const port=address.port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const origin='http://localhost:'+port;let now=Date.now(),repo=new SQLiteRepository(file),app:ReturnType<typeof createApplication>|undefined;
 const raw:{step:string;status:number;code?:string}[]=[];
 const start=async()=>{app=createApplication({origin,repo,profile,auth:{now:()=>now}});await app.prepare();app.server.listen(port,'127.0.0.1');await once(app.server,'listening');};
 await start();t.after(async()=>{if(app)await app.stop();else await repo.close();rmSync(dir,{recursive:true,force:true});console.log('PRIVATE_HTTP_EVIDENCE '+JSON.stringify({case:t.name,clock:'DI; no actual five-minute idle elapsed',raw,cleanup:true}));});
 async function call<T=ErrorData>(step:string,path:string,method='GET',body?:unknown,token?:string,headers:HeadersInput={}):Promise<Reply<T>>{
  // Each request owns a fresh socket so a deliberate same-port server restart cannot reuse undici's retired pool entry.
  const r=await fetch(origin+path,{method,headers:{Accept:'application/json',Connection:'close',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text(),data=text?JSON.parse(text):null;raw.push({step,status:r.status,...(data?.error?.code?{code:String(data.error.code)}:{})});return {status:r.status,data:data as T,headers:r.headers};
 }
 async function session(options:{kind?:'invited'|'hosted';create?:boolean;persist?:boolean;verified?:boolean}={}){
  const id=randomUUID(),token=newToken(),csrf=newToken();await repo.transaction('control',async tx=>{await tx.put(C.accounts,'a:'+id,{id,provider:'email-otp',subject:'fictional@fixture.example',email:'fictional@fixture.example',email_verified:options.verified===false?0:1,role:'member',admission_kind:options.kind??'invited',can_create_private:options.create===false?0:1,can_persist_private:options.persist===false?0:1});await tx.put(C.sessions,await hash(token),{owner_id:id,csrf,expires_at:now+86400000});});return {Origin:origin,Cookie:'__Host-toktok_session='+token,'X-CSRF-Token':csrf};
 }
 async function grant(headers:HeadersInput={}){
  const context=await call<{nonce:string;notice_version:string;can_persist_private:boolean}>('creation context','/api/private/create-context','POST',{},undefined,{Origin:origin,...headers});status(context,200,'context');
  const bound={Origin:origin,...headers,Cookie:[headers.Cookie,cookie(context,'__Host-toktok_create')].filter(Boolean).join('; ')};
  const approved=await call<{creation_grant:string}>('explicit local creation acknowledgement','/api/private/create-grants','POST',{nonce:context.data.nonce,risk_ack:true,risk_ack_version:context.data.notice_version},undefined,bound);status(approved,200,'grant');return {value:approved.data.creation_grant,headers:bound,canPersist:context.data.can_persist_private};
 }
 async function create(g:Awaited<ReturnType<typeof grant>>,body:Record<string,unknown>={}){
  const input={purpose:'가상 비공개 검증',ttl_seconds:3600,client_request_id:randomUUID(),creation_grant:g.value,...body};
  const r=await call<Room>('private create','/api/v1/rooms','POST',input,undefined,g.headers);status(r,201,'create');const owned:Owned={...r.data,base:'/api/v1/rooms/'+r.data.room.id,invite:new URL(r.data.invite_url).pathname.split('/').at(-1)!,read:new URL(r.data.read_url).pathname.split('/').at(-1)!};return {owned,input};
 }
 const joinInput=(room:Owned,id:string=randomUUID())=>({nickname:'가상 참여자',client_request_id:id,notice_version:room.room.notice_version,visibility:'private',retention_mode:room.room.retention_mode});
 async function participate(room:Owned,id:string=randomUUID()){const input=joinInput(room,id),r=await call<Participant>('private participant',''+room.base+'/participants','POST',input,room.invite);status(r,201,'join');return {participant:r.data,input};}
 async function restart(){await app!.stop();app=undefined;repo=new SQLiteRepository(file);await start();}
 return {call,grant,create,participate,joinInput,session,restart,origin,advance:(ms:number)=>{now+=ms;},get now(){return now;},get repo(){return repo;},get app(){return app!;}};
}

test('private verification DEMO anonymous HTTP retains capability past simulated five minutes and disk restart; no public leave contract',async t=>{
 const f=await fixture(t),g=await f.grant();assert.equal(g.canPersist,false);
 status(await f.call('anonymous persistence denied','/api/v1/rooms','POST',{purpose:'fixture',ttl_seconds:3600,persist:true,retention_seconds:300,client_request_id:randomUUID(),creation_grant:g.value},undefined,g.headers),403,'anonymous persist');
 status(await f.call('anonymous TTL over ceiling','/api/v1/rooms','POST',{purpose:'fixture',ttl_seconds:3601,client_request_id:randomUUID(),creation_grant:g.value},undefined,g.headers),400,'TTL cap');
 const {owned:r,input}=await f.create(g);assert.equal(r.room.retention_mode,'recent_buffer');assert.equal(Date.parse(r.room.expires_at)-Date.parse(r.room.created_at),3600000);
 const replay=await f.call<ErrorData&{room_id:string}>('creation result replay','/api/v1/rooms','POST',input,undefined,g.headers);status(replay,409,'create replay');assert.equal(replay.data.error?.code,'CREATE_RESULT_NOT_RECOVERABLE');assert.equal(replay.data.room_id,r.room.id);
 status(await f.call('missing capability',r.base),401,'missing cap');status(await f.call('unknown capability',r.base,'GET',undefined,newToken()),403,'bad cap');
 const {owned:other}=await f.create(await f.grant(),{ttl_seconds:60});status(await f.call('wrong room capability',other.base,'GET',undefined,r.read),403,'wrong room');
 const p=await f.participate(r);const sent=await f.call<Message>('first private send',r.base+'/messages','POST',{text:'가상 보관 본문',client_message_id:'stable-id'},p.participant.participant_token);status(sent,201,'send');
 f.advance(301000);const read=await f.call<Page>('latest includes older-than-five-minute retained message',r.base+'/messages','GET',undefined,r.read);status(read,200,'latest');assert.equal(read.data.messages[0].cursor,sent.data.cursor);
 status(await f.call('private lease endpoint is absent',r.base+'/lease','DELETE',undefined,p.participant.participant_token),404,'no private lease');status(await f.call('private participant delete endpoint is absent',r.base+'/participants','DELETE',undefined,p.participant.participant_token),404,'no private leave');
 status(await f.call('same participant still sends after simulated idle',r.base+'/messages','POST',{text:'5분 후 가상 본문',client_message_id:'after-idle'},p.participant.participant_token),201,'no idle expiry');
 status(await f.call('short room absolute TTL reached',other.base,'GET',undefined,other.read),410,'TTL');
 await f.restart();const restored=await f.call<Page>('fresh HTTP server restores recent history',r.base+'/messages','GET',undefined,r.read);status(restored,200,'disk restart');assert.equal(restored.data.epoch,sent.data.cursor.split(':')[0]);assert.equal(restored.data.messages.length,2);
 const duplicate=await f.call<Message>('retained message replay after restart',r.base+'/messages','POST',{text:'가상 보관 본문',client_message_id:'stable-id'},p.participant.participant_token);status(duplicate,200,'restart replay');assert.equal(duplicate.data.cursor,sent.data.cursor);
 const joinReplay=await f.call<ErrorData>('join secret is not recovered after restart',r.base+'/participants','POST',p.input,r.invite);status(joinReplay,409,'join replay');assert.equal(joinReplay.data.error?.code,'JOIN_RESULT_NOT_RECOVERABLE');
 status(await f.call('private participant cannot close',r.base+'/close','POST',{},p.participant.participant_token),403,'owner separation');status(await f.call('owner closes private room',r.base+'/close','POST',{},r.owner_token),200,'close');f.advance(2001);
 const closed=await f.call<Page>('closed history remains readable',r.base+'/messages','GET',undefined,r.read);status(closed,200,'closed history');assert.equal(closed.data.messages.length,2);assert.equal(closed.data.room_status,'closed');f.advance(2001);
 status(await f.call('closed empty wait is gone',r.base+'/wait?after='+encodeURIComponent(closed.data.cursor)+'&timeout=0','GET',undefined,r.read),410,'closed wait');status(await f.call('owner deletes private room',r.base,'DELETE',undefined,r.owner_token),204,'delete');
 assert.equal((await f.repo.transaction('room:'+r.room.id,tx=>tx.list(C.recent_messages,{limit:1000}))).length,0);status(await f.call('deleted private access',r.base,'GET',undefined,r.read),410,'deleted');
 console.log('PRIVATE_CONFORMANCE '+JSON.stringify({mode:'DEMO anonymous',simulated_idle_ms:301000,participant_survives_idle:true,leave_supported:false,restart_recent_and_capability:true,join_secret_recovered:false,close_history:2,deleted_recent_rows:0}));
});

test('private verification DEMO invited actual HTTP default OFF and explicit persistence preserve nonce, CSRF, notice and retention boundaries',async t=>{
 const f=await fixture(t),headers=await f.session();status(await f.call('session CSRF absent','/api/private/create-context','POST',{},undefined,{Origin:f.origin,Cookie:headers.Cookie}),403,'CSRF');
 const g=await f.grant(headers);assert(g.canPersist);const {owned:recent}=await f.create(g);assert.equal(recent.room.retention_mode,'recent_buffer');
 status(await f.call('close first invited room',recent.base+'/close','POST',{},recent.owner_token),200,'close');
 const opt=await f.grant(headers);status(await f.call('retention cannot exceed room TTL','/api/v1/rooms','POST',{purpose:'fixture',ttl_seconds:60,persist:true,retention_seconds:61,client_request_id:randomUUID(),creation_grant:opt.value},undefined,opt.headers),422,'retention TTL');
 const {owned:r}=await f.create(opt,{ttl_seconds:3600,persist:true,retention_seconds:600});assert.equal(r.room.retention_mode,'persisted');
 status(await f.call('wrong join storage acknowledgement',r.base+'/participants','POST',{...f.joinInput(r),retention_mode:'recent_buffer'},r.invite),409,'notice');
 const p=await f.participate(r);status(await f.call('persisted message send',r.base+'/messages','POST',{text:'가상 장기 보관',client_message_id:'persist-one'},p.participant.participant_token),201,'persist send');await f.restart();
 const restored=await f.call<Page>('persisted HTTP restart read',r.base+'/messages','GET',undefined,r.read);status(restored,200,'persist restore');assert.equal(restored.data.messages.length,1);f.advance(600001);
 const gap=await f.call<Page>('persisted retention clock boundary',r.base+'/messages?after='+encodeURIComponent(restored.data.epoch+':0'),'GET',undefined,r.read);status(gap,200,'retention read');assert.equal(gap.data.messages.length,0);assert.equal(gap.data.history_status,'history_gap');
 const stored=await f.repo.transaction('room:'+r.room.id,tx=>tx.list(C.private_messages,{limit:1000}));assert.equal(stored.length,0);status(await f.call('delete expired-history but live private room',r.base,'DELETE',undefined,r.owner_token),204,'persist delete');
 console.log('PRIVATE_CONFORMANCE '+JSON.stringify({mode:'DEMO invited',default_persist:false,opt_in_persist:true,csrf_required:true,notice_mismatch:409,retention_gt_ttl:422,restart_persisted:true,simulated_retention_ms:600001,expired_body_and_dedupe:0}));
});

test('private verification HOSTED actual HTTP reads DB entitlement, denies anonymous by configured policy and bounds participant count',async t=>{
 const profile:Settings=structuredClone(DEFAULT_SETTINGS);profile.deployment={mode:'hosted',enabled:true};profile.signup.policy='open';profile.private.persistenceAllowed=true;
 const f=await fixture(t,profile),anonymous=await f.grant();status(await f.call('HOSTED anonymous creation disabled','/api/v1/rooms','POST',{purpose:'fixture',ttl_seconds:60,client_request_id:randomUUID(),creation_grant:anonymous.value},undefined,anonymous.headers),403,'hosted anonymous');
 for(const options of [{kind:'hosted' as const,create:false},{kind:'hosted' as const,verified:false}]){const headers=await f.session(options);status(await f.call('unentitled or unverified account context denied','/api/private/create-context','POST',{},undefined,headers),403,'DB admission');}
 const headers=await f.session({kind:'hosted'}),g=await f.grant(headers);assert(g.canPersist);const {owned:r}=await f.create(g,{ttl_seconds:600,persist:true,retention_seconds:300});assert.equal(r.room.mode,'HOSTED');assert.equal(r.room.retention_mode,'persisted');
 for(let n=0;n<64;n++)await f.participate(r,'bounded-'+n);const overflow=await f.call('65th participant is denied',r.base+'/participants','POST',f.joinInput(r,'overflow'),r.invite);status(overflow,429,'participant cap');assert(overflow.headers.get('Retry-After'));f.advance(301000);
 status(await f.call('private participants are not released after five simulated minutes',r.base+'/participants','POST',f.joinInput(r,'still-full'),r.invite),429,'no public slot expiry');
 status(await f.call('owner ends hosted room',r.base,'DELETE',undefined,r.owner_token),204,'delete');
 console.log('PRIVATE_CONFORMANCE '+JSON.stringify({mode:'HOSTED local explicit persistence setting',signup:'open',anonymous_enabled:false,db_entitlement_required:true,participants:64,overflow:429,simulated_idle_ms:301000,automatic_seat_release:false}));
});
