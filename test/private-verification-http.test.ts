import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DEFAULT_SETTINGS,type Settings} from '../src/settings-schema';
import {RecordCollection as C} from '../src/storage/repository';
import {newToken} from '../src/http';
import {fixture,status,type Room,type Participant,type Message,type Page} from './private-http-fixture';
interface ErrorData {error?:{code?:string};}
test('private verification DEMO anonymous HTTP retains capability past simulated five minutes and disk restart; no public leave contract',async t=>{
 const f=await fixture(t),g=await f.grant();assert.equal(g.canPersist,false);
 status(await f.call('anonymous persistence denied','/api/v1/rooms','POST',{purpose:'fixture',persist:true,retention_seconds:300,client_request_id:randomUUID(),creation_grant:g.value},undefined,g.headers),403,'anonymous persist');
 status(await f.call('anonymous TTL over ceiling','/api/v1/rooms','POST',{purpose:'fixture',ttl_seconds:86401,client_request_id:randomUUID(),creation_grant:g.value},undefined,g.headers),422,'TTL cap');
 const {owned:r,input}=await f.create(g);assert.equal(r.room.retention_mode,'recent_buffer');assert.equal(Date.parse(r.room.expires_at!)-Date.parse(r.room.created_at),86400000);
 const replay=await f.call<ErrorData&{room_id:string}>('creation result replay','/api/v1/rooms','POST',input,undefined,g.headers);status(replay,409,'create replay');assert.equal(replay.data.error?.code,'CREATE_RESULT_NOT_RECOVERABLE');assert.equal(replay.data.room_id,r.room.id);
 status(await f.call('missing capability',r.base),401,'missing cap');status(await f.call('unknown capability',r.base,'GET',undefined,newToken()),403,'bad cap');
 const {owned:other}=await f.create(await f.grant());status(await f.call('wrong room capability',other.base,'GET',undefined,r.read),403,'wrong room');
 const p=await f.participate(r);const sent=await f.call<Message>('first private send',r.base+'/messages','POST',{text:'가상 보관 본문',client_message_id:'stable-id'},p.participant.participant_token);status(sent,201,'send');
 f.advance(301000);const read=await f.call<Page>('latest includes older-than-five-minute retained message',r.base+'/messages','GET',undefined,r.read);status(read,200,'latest');assert.equal(read.data.messages[0].cursor,sent.data.cursor);
 status(await f.call('private lease endpoint is absent',r.base+'/lease','DELETE',undefined,p.participant.participant_token),404,'no private lease');status(await f.call('private participant delete endpoint is absent',r.base+'/participants','DELETE',undefined,p.participant.participant_token),404,'no private leave');
 status(await f.call('same participant still sends after simulated idle',r.base+'/messages','POST',{text:'5분 후 가상 본문',client_message_id:'after-idle'},p.participant.participant_token),201,'no idle expiry');
 status(await f.call('other demo room remains within 24 hours',other.base,'GET',undefined,other.read),200,'24h');
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
 const opt=await f.grant(headers);status(await f.call('retention cannot exceed storage ceiling','/api/v1/rooms','POST',{purpose:'fixture',persist:true,retention_seconds:604801,client_request_id:randomUUID(),creation_grant:opt.value},undefined,opt.headers),400,'retention ceiling');
 const {owned:r}=await f.create(opt,{persist:true,retention_seconds:600});assert.equal(r.room.retention_mode,'persisted');
 status(await f.call('wrong join storage acknowledgement',r.base+'/participants','POST',{...f.joinInput(r),retention_mode:'recent_buffer'},r.invite),409,'notice');
 const p=await f.participate(r);status(await f.call('persisted message send',r.base+'/messages','POST',{text:'가상 장기 보관',client_message_id:'persist-one'},p.participant.participant_token),201,'persist send');await f.restart();
 const restored=await f.call<Page>('persisted HTTP restart read',r.base+'/messages','GET',undefined,r.read);status(restored,200,'persist restore');assert.equal(restored.data.messages.length,1);f.advance(600001);
 const gap=await f.call<Page>('persisted retention clock boundary',r.base+'/messages?after='+encodeURIComponent(restored.data.epoch+':0'),'GET',undefined,r.read);status(gap,200,'retention read');assert.equal(gap.data.messages.length,0);assert.equal(gap.data.history_status,'history_gap');
 const stored=await f.repo.transaction('room:'+r.room.id,tx=>tx.list(C.private_messages,{limit:1000}));assert.equal(stored.length,0);status(await f.call('delete expired-history but live private room',r.base,'DELETE',undefined,r.owner_token),204,'persist delete');
 console.log('PRIVATE_CONFORMANCE '+JSON.stringify({mode:'DEMO invited',default_persist:false,opt_in_persist:true,csrf_required:true,notice_mismatch:409,retention_gt_ceiling:400,restart_persisted:true,simulated_retention_ms:600001,expired_body_and_dedupe:0}));
});

test('private verification HOSTED actual HTTP reads DB entitlement, denies anonymous by configured policy and bounds participant count',async t=>{
 const profile:Settings=structuredClone(DEFAULT_SETTINGS);profile.deployment={mode:'hosted',enabled:true};profile.signup.policy='open';profile.private.persistenceAllowed=true;
 const f=await fixture(t,profile),anonymous=await f.grant();status(await f.call('HOSTED anonymous creation disabled','/api/v1/rooms','POST',{purpose:'fixture',client_request_id:randomUUID(),creation_grant:anonymous.value},undefined,anonymous.headers),403,'hosted anonymous');
 for(const options of [{kind:'hosted' as const,create:false},{kind:'hosted' as const,verified:false}]){const headers=await f.session(options);status(await f.call('unentitled or unverified account context denied','/api/private/create-context','POST',{},undefined,headers),403,'DB admission');}
 const headers=await f.session({kind:'hosted'}),g=await f.grant(headers);assert(g.canPersist);const {owned:r}=await f.create(g,{persist:true,retention_seconds:300});assert.equal(r.room.mode,'HOSTED');assert.equal(r.room.retention_mode,'persisted');
 for(let n=0;n<64;n++)await f.participate(r,'bounded-'+n);const overflow=await f.call('65th participant is denied',r.base+'/participants','POST',f.joinInput(r,'overflow'),r.invite);status(overflow,429,'participant cap');assert(overflow.headers.get('Retry-After'));f.advance(301000);
 status(await f.call('private participants are not released after five simulated minutes',r.base+'/participants','POST',f.joinInput(r,'still-full'),r.invite),429,'no public slot expiry');
 status(await f.call('owner ends hosted room',r.base,'DELETE',undefined,r.owner_token),204,'delete');
 console.log('PRIVATE_CONFORMANCE '+JSON.stringify({mode:'HOSTED local explicit persistence setting',signup:'open',anonymous_enabled:false,db_entitlement_required:true,participants:64,overflow:429,simulated_idle_ms:301000,automatic_seat_release:false}));
});
