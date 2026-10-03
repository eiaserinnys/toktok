import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,status,type Message,type Page} from './private-http-fixture';
import {demoInstallationProfile} from '../src/installation-profile';
import {DEFAULT_SETTINGS} from '../src/settings-schema';
import {SettingsStore} from '../src/settings-store';
import {RecordCollection as C} from '../src/storage/repository';
import {hash,newToken} from '../src/http';
import {PrivateRoomCore} from '../src/private-core';
import {privateSnapshot} from './selfhost-private-fixture';
import {TEST_BUDGET} from './selfhost-budget';

async function ledger(f:Awaited<ReturnType<typeof fixture>>){return f.repo.transaction('control',async tx=>{const b=await new SettingsStore(tx).budget(f.now);return {usage:b.usage,estimate:b.estimate};});}
async function exhaust(f:Awaited<ReturnType<typeof fixture>>){await f.repo.transaction('control',async tx=>{const s=await new SettingsStore(tx).read(),month=new Date(f.now).toISOString().slice(0,7);for(const c of s.settings.budget.workloadCaps)await tx.put(C.budgets,'usage:'+c.kind+':m:'+month,{used:c.month});await tx.put(C.budgets,'estimate:m:'+month,{used:100000000});});}

test('member private HTTP is permanent and demo-budget exempt only after DB ownership; demo counts, CSRF and technical rate remain',async t=>{
 const profile=demoInstallationProfile();profile.private.activeGlobal=1;profile.private.activePerIp=1;profile.private.dailyCreates=1;
 const f=await fixture(t,profile),anon=await f.grant(),{owned:demo}=await f.create(anon);
 assert.equal(demo.room.lifetime,'demo_24h');assert.equal(Date.parse(demo.room.expires_at!)-Date.parse(demo.room.created_at),86400000);
 const failed=await f.grant();status(await f.call('anonymous demo count stays limited','/api/v1/rooms','POST',{purpose:'fixture',client_request_id:randomUUID(),creation_grant:failed.value},undefined,failed.headers),429,'demo quota');
 const headers=await f.session();let before=await ledger(f);
 status(await f.call('private creation options','/api/private/create-options','GET',undefined,undefined,headers),200,'options');
 const one=await f.create(await f.grant(headers)),two=await f.create(await f.grant(headers));assert.equal(one.owned.room.expires_at,null);assert.equal(two.owned.room.lifetime,'member_permanent');assert.deepEqual(await ledger(f),before,'member creation cannot spend demo quantity or USD');
 let state=await f.repo.transaction('control',tx=>new SettingsStore(tx).state());assert.equal(state.active_private,3);assert.equal(state.member_private,2);
 const over=await f.grant(headers);status(await f.call('member create still obeys IP request rate','/api/v1/rooms','POST',{purpose:'fixture',client_request_id:randomUUID(),creation_grant:over.value},undefined,over.headers),429,'technical rate');
 f.advance(3600001);await exhaust(f);before=await ledger(f);
 status(await f.call('member options under exhausted budget','/api/private/create-options','GET',undefined,undefined,headers),200,'private options');
 status(await f.call('CSRF required under exhaustion','/api/private/create-context','POST',{},undefined,{Origin:f.origin,Cookie:headers.Cookie}),403,'csrf');
 status(await f.call('anonymous options still metered','/api/private/create-options'),429,'anonymous options');
 const fresh=await f.create(await f.grant(headers));assert.equal(fresh.owned.room.expires_at,null);
 const p=await f.participate(one.owned);const posted=await f.call<Message>('member private write under exhausted budget',one.owned.base+'/messages','POST',{text:'가상 상설방 본문',client_message_id:'lifetime-one'},p.participant.participant_token);status(posted,201,'write');
 status(await f.call('wrong room capability remains forbidden',two.owned.base,'GET',undefined,one.owned.read),403,'wrong room');
 status(await f.call('member private read under exhausted budget',one.owned.base+'/messages','GET',undefined,one.owned.read),200,'read');
 const html=await fetch(one.owned.read_url.replace(new URL(one.owned.read_url).origin,f.origin),{headers:{Accept:'text/html',Connection:'close'}});assert.equal(html.status,200);await html.arrayBuffer();
 for(const [path,method,body] of [['/api/public/rooms','GET',undefined],['/api/session','GET',undefined],['/api/auth/start','POST',{purpose:'login'}],['/api/auth/email/send','POST',{}]] as const)status(await f.call('nonprivate request remains metered',path,method,body,undefined,headers),path==='/api/session'?403:429,'no broad exemption');
 assert.deepEqual(await ledger(f),before,'member traffic does not change demo budget');
 await f.restart();const restored=await f.call<Page>('disk restart under cutoff',one.owned.base+'/messages','GET',undefined,one.owned.read);status(restored,200,'restart');assert.equal(restored.data.messages[0].cursor,posted.data.cursor);
 f.advance(3600001);const emptied=await f.call<Page>('one-hour history expires but room lives',one.owned.base+'/messages','GET',undefined,one.owned.read);status(emptied,200,'retention');assert.equal(emptied.data.messages.length,0);assert.equal(emptied.data.room_status,'open');
 f.advance(31*86400000);status(await f.call('room and private participant survive thirty-one days',one.owned.base+'/messages','POST',{text:'가상 재연결',client_message_id:'after-31-days'},p.participant.participant_token),201,'permanent');
 status(await f.call('anonymous room absolute expiry',demo.base,'GET',undefined,demo.read),410,'demo expiry');
 status(await f.call('owner closes permanent room',one.owned.base+'/close','POST',{},one.owned.owner_token),200,'close');status(await f.call('closed member cannot send',one.owned.base+'/messages','POST',{text:'blocked',client_message_id:'blocked'},p.participant.participant_token),410,'closed');
 for(const r of [one.owned,two.owned,fresh.owned])status(await f.call('owner cleanup',r.base,'DELETE',undefined,r.owner_token),204,'cleanup');
 state=await f.repo.transaction('control',tx=>new SettingsStore(tx).state());assert.equal(state.active_private,0);assert.equal(state.member_private,0);
 console.log('PRIVATE_LIFETIME_EVIDENCE '+JSON.stringify({member_budget_delta:0,demo_ttl_seconds:86400,member_expires_at:null,simulated_days:31,restart:true,retention_separate:true,technical_rate:429,wrong_room:403,public_auth_mail_exempt:false}));
});

test('HOSTED member and approved owned agent use permanent policy; unverified, unentitled and caller lifecycle fields cannot exempt',async t=>{
 const profile=structuredClone(DEFAULT_SETTINGS);profile.deployment={mode:'hosted',enabled:true};profile.private.persistenceAllowed=true;const f=await fixture(t,profile);
 for(const options of [{verified:false},{create:false}])status(await f.call('unadmitted options','/api/private/create-options','GET',undefined,undefined,await f.session({kind:'hosted',...options})),403,'DB membership');
 const headers=await f.session({kind:'hosted'}),g=await f.grant(headers);
 status(await f.call('caller lifecycle rejected','/api/v1/rooms','POST',{purpose:'fixture',client_request_id:randomUUID(),creation_grant:g.value,lifetime:'member_permanent'},undefined,g.headers),400,'untrusted lifecycle');
 status(await f.call('finite TTL cannot silently become permanent','/api/v1/rooms','POST',{purpose:'fixture',client_request_id:randomUUID(),creation_grant:g.value,ttl_seconds:60},undefined,g.headers),422,'explicit policy');
 const ownerId=await f.repo.transaction('control',async tx=>(await tx.get(C.sessions,await hash(headers.Cookie.split('=')[1])))!.owner_id);
 const {owned:r}=await f.create(g,{persist:true,retention_seconds:604800});assert.equal(r.room.expires_at,null);assert.equal(r.room.retention_mode,'persisted');
 const p=await f.participate(r),sent=await f.call<Message>('long retention write',r.base+'/messages','POST',{text:'가상 장기 보관',client_message_id:'long'},p.participant.participant_token);status(sent,201,'persist');await f.restart();
 f.advance(86400001);status(await f.call('long history beyond one-day room policy',r.base+'/messages','GET',undefined,r.read),200,'history');
 const token=newToken(),id=randomUUID();await f.repo.transaction('control',async tx=>{await tx.put(C.agents,'a:'+id,{id,name:'가상 소유 에이전트',token_hash:await hash(token),claim_hash:await hash(newToken()),status:'approved',pending_expiry:f.now+86400000,credential_expiry:f.now+86400000,owner_id:ownerId,expires_at:f.now+86400000});await tx.put(C.agents,'t:'+await hash(token),{id});});
 await exhaust(f);const before=await ledger(f),created=await f.call<{room:{id:string;expires_at:null};owner_token:string}>('approved agent creation','/api/v1/rooms','POST',{purpose:'가상 agent 방',client_request_id:'agent-create'},token);status(created,201,'agent');assert.equal(created.data.room.expires_at,null);assert.deepEqual(await ledger(f),before);
 await f.repo.transaction('control',async tx=>{const row=await tx.get(C.agents,'a:'+id);assert(row);await tx.put(C.agents,'a:'+id,{...row,status:'revoked'});});status(await f.call('revoked agent no exemption','/api/v1/rooms','POST',{purpose:'fixture',client_request_id:'revoked'},token),403,'revoked');
 f.advance(7*86400000);const page=await f.call<Page>('long history retention expires independently',r.base+'/messages','GET',undefined,r.read);status(page,200,'retention');assert.equal(page.data.messages.length,0);
 const maintenance=await f.app.privateRooms.room(r.room.id).maintenance(r.room.id) as {next_maintenance_at:number|null};assert.equal(maintenance.next_maintenance_at,null);
 status(await f.call('long room cleanup',r.base,'DELETE',undefined,r.owner_token),204,'cleanup');status(await f.call('agent room cleanup','/api/v1/rooms/'+created.data.room.id,'DELETE',undefined,created.data.owner_token),204,'agent cleanup');
 console.log('PRIVATE_LIFETIME_EVIDENCE '+JSON.stringify({mode:'HOSTED',account_and_agent_verified:true,caller_lifetime_denied:400,revoked_agent_denied:403,retention_seconds:604800,empty_room_timer:null}));
});

test('existing snapshots keep finite expiry and demo budget; invalid permanent snapshots fail closed',async t=>{
 const f=await fixture(t),now=f.now,{snapshot,tokens}=await privateSnapshot('legacy-finite',false,now);let count=0;
 const core=new PrivateRoomCore({origin:f.origin,repo:f.repo,budget:{...TEST_BUDGET,async reserve(){count++;}},clock:()=>f.now});t.after(()=>core.shutdown());
 await core.initialize(snapshot);const stored=await f.repo.transaction('room:'+snapshot.id,tx=>tx.get(C.private_rooms,snapshot.id));assert.equal((stored?.snapshot as {expires_at:number}).expires_at,now+120000);assert(count>0);
 const invalid={...snapshot,id:'invalid-permanent',expires_at:null,lifetime:'member_permanent' as const};await assert.rejects(()=>new PrivateRoomCore({origin:f.origin,repo:f.repo,budget:TEST_BUDGET}).initialize(invalid),(e:unknown)=>(e as {code:string}).code==='INVALID_SNAPSHOT');
 const blocked=new PrivateRoomCore({origin:f.origin,repo:f.repo,clock:()=>f.now,budget:{...TEST_BUDGET,async reserve(){throw new (await import('../src/http')).HttpError(429,'BUDGET_EXCEEDED','fixture');}}});t.after(()=>blocked.shutdown());const denied=await blocked.fetch(new Request(f.origin+'/api/v1/rooms/'+snapshot.id,{headers:{Authorization:'Bearer '+newToken()}}));assert.equal(denied.status,429);await denied.arrayBuffer();
 f.advance(120001);const r=await core.fetch(new Request(f.origin+'/api/v1/rooms/'+snapshot.id,{headers:{Authorization:'Bearer '+tokens.read}}));assert.equal(r.status,410);await r.arrayBuffer();
 console.log('PRIVATE_LIFETIME_EVIDENCE '+JSON.stringify({existing_snapshot_unchanged:true,old_expiry:410,old_budget_metered:true,anonymous_null_expiry_denied:true}));
});
