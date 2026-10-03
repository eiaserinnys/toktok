import {SELF,runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {it,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {C,save} from '../src/control-records';
import {hash,newToken} from '../src/http';
import {PRIVATE_NOTICE} from '../src/private-contracts';
import type {PrivateRoom} from '../src/cloudflare-host';
import {origin,raw,privateRoom,records,takeCookie,call,parsed,bearer,asRoom,anonymousGrant,create,join,send,waitCadence,readPage,installApplicationFixture,type OwnedRoom,type Participant,type Room,type Message,type Page} from './application-fixture';

installApplicationFixture();
const diagnostics=(r:OwnedRoom)=>runInDurableObject<DurableObject,ReturnType<PrivateRoom['diagnostics']>>(privateRoom(r.room.id),i=>(i as PrivateRoom).diagnostics());
async function registered(r:OwnedRoom){
 let state=await diagnostics(r);for(let n=0;state.active_waits!==1&&n<100;n++){await new Promise(resolve=>setTimeout(resolve,5));state=await diagnostics(r);}
 raw.push({step:'actual private wait registration',status:state.active_waits===1?200:500,retry_after:null,state:{active_waits:state.active_waits,active_handlers:state.active_handlers}});
 expect(state.active_waits,'actual wait registered before racing action').toBe(1);
}
const post=(r:OwnedRoom,p:Participant,input:Record<string,unknown>)=>call('remaining message contract',r.base+'/messages',input,bearer(p.participant_token));
async function persistedRoom(){
 await parsed(await call('initialize control fixture','/api/config'));
 const id=crypto.randomUUID(),token=newToken(),csrf=newToken(),sessionHash=await hash(token),now=Date.now();
 // Test-only DB principal fixture. Production context/grant/create still perform their normal authorization.
 await records(async tx=>{
  const row=(await tx.get(C.settings,'config'))!,settings=row.settings as unknown as {private:{persistenceAllowed:boolean}};settings.private.persistenceAllowed=true;
  await tx.put(C.settings,'config',{...row,settings:settings as unknown as import('../src/storage/repository').JsonValue,revision:Number(row.revision)+1});
  await save(tx,C.accounts,'a:'+id,{id,provider:'email',subject:'member@fixture.example',email:'member@fixture.example',email_verified:1,role:'member',admission_kind:'invited',can_create_private:1,can_persist_private:1});
  await save(tx,C.sessions,sessionHash,{owner_id:id,csrf,expires_at:now+60000});
 });
 // Reset only test-host IO/cache, preserving the actual CONTROL records.
 await (await SELF.fetch(origin+'/__application/reset')).arrayBuffer();
 const headers={Origin:origin,Cookie:'__Host-toktok_session='+token,'X-CSRF-Token':csrf};
 const response=await call('member create context','/api/private/create-context',{},headers),context=await parsed<{nonce:string}>(response);
 const grant=await parsed<{creation_grant:string}>(await call('member explicit risk acknowledgement','/api/private/create-grants',{nonce:context.nonce,risk_ack:true,risk_ack_version:PRIVATE_NOTICE},{...headers,Cookie:headers.Cookie+'; '+takeCookie(response,'__Host-toktok_create')}));
 return asRoom(await parsed<Room>(await call('member opt-in persist create','/api/v1/rooms',{purpose:'창작 보관 삭제 검증',ttl_seconds:60,retention_seconds:60,persist:true,creation_grant:grant.creation_grant,client_request_id:crypto.randomUUID()},headers),201));
}

it('remaining capability secrets are distinct 256-bit values and secure entry errors keep their representations',async()=>{
 const r=await create(),p=await join(r,'창작');const caps=[r.invite,r.read,r.owner_token,p.participant_token];
 expect(new Set(caps).size).toBe(4);expect(caps.every(c=>/^[\w-]{43}$/.test(c)),'all four opaque credentials are URLsafe43; values omitted').toBe(true);
 expect((await call('metadata missing bearer',r.base)).status).toBe(401);expect((await call('metadata invalid bearer',r.base,undefined,bearer('invalid'))).status).toBe(403);
 const owner=await call('owner capability is not a shared HTML link','/r/'+r.room.id+'/'+r.owner_token,undefined,{Accept:'text/html'});expect(owner.status).toBe(403);expect(owner.headers.get('Content-Type')).toContain('text/html');
 const bad=await call('invalid Markdown entry remains JSON','/r/'+r.room.id+'/'+'x'.repeat(43),undefined,{Accept:'text/markdown'});expect(bad.status).toBe(403);expect(bad.headers.get('Content-Type')).toContain('application/json');
 for(const response of [owner,bad]){expect(response.headers.get('Cache-Control')).toBe('no-store');expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();}
});

it('remaining distinct concurrent writes retain sequence and sender identity and reject reply or sender spoofing',async()=>{
 const r=await create(),a=await join(r,'같은 이름'),b=await join(r,'같은 이름');
 const messages=await Promise.all(Array.from({length:12},async(_,n)=>parsed<Message>(await send(r,n%2?a:b,'concurrent-'+n),201)));
 expect(messages.map(m=>m.sequence).sort((x,y)=>x-y)).toEqual(Array.from({length:12},(_,n)=>n+1));expect(new Set(messages.map(m=>m.sender.id)).size).toBe(2);
 const original=messages[0],first=messages.find(m=>m.sequence===1)!;
 expect((await post(r,b,{text:'concurrent-0',client_message_id:'concurrent-0',reply_to:first.cursor})).status).toBe(409);
 expect((await post(r,a,{text:'창작',client_message_id:'invalid-reply',reply_to:original.cursor.split(':')[0]+':999'})).status).toBe(400);
 expect((await post(r,a,{text:'창작',client_message_id:'forged-sender',sender:b.sender.id})).status).toBe(400);
});

it('remaining real timeout and registered write or close wakes retain unread history and terminate empty closed waits',async()=>{
 const r=await create(),p=await join(r,'창작'),epoch=(await diagnostics(r)).epoch!;
 const before=Date.now(),empty=await parsed<Page>(await call('real one second wait',r.base+'/wait?timeout=1&after='+encodeURIComponent(epoch+':0'),undefined,bearer(r.read)));
 const elapsed=Date.now()-before;raw.push({step:'actual timeout elapsed',status:200,retry_after:null,state:{elapsed_ms:elapsed,messages:empty.messages.length}});expect(elapsed).toBeGreaterThanOrEqual(900);expect(empty.messages).toHaveLength(0);expect(empty.cursor===epoch+':0').toBe(true);
 await waitCadence();const waiting=call('registered wait write wake',r.base+'/wait?timeout=2&after='+encodeURIComponent(empty.cursor),undefined,bearer(r.read));await registered(r);
 const message=await parsed<Message>(await send(r,p,'wake'),201),woke=await parsed<Page>(await waiting);expect(woke.messages.map(m=>m.sequence)).toEqual([message.sequence]);expect(woke.cursor===message.cursor).toBe(true);
 await waitCadence();const closedWait=call('registered wait close wake',r.base+'/wait?timeout=2&after='+encodeURIComponent(message.cursor),undefined,bearer(r.read));await registered(r);expect((await call('owner closes pending wait',r.base+'/close',{},bearer(r.owner_token))).status).toBe(200);
 expect((await closedWait).status).toBe(410);
 const unread=await parsed<Page>(await call('closed unread history',r.base+'/wait?after='+encodeURIComponent(epoch+':0'),undefined,bearer(p.participant_token)));expect(unread.messages).toHaveLength(1);expect(unread.room_status).toBe('closed');
 await waitCadence();expect((await call('closed empty cursor terminates',r.base+'/wait?after='+encodeURIComponent(unread.cursor),undefined,bearer(p.participant_token))).status).toBe(410);expect((await diagnostics(r)).active_waits).toBe(0);
});

it('remaining opted-in persisted DELETE removes body and dedupe records and wakes an actual pending wait',async()=>{
 const r=await persistedRoom(),p=await parsed<Participant>(await call('persist participant notice',r.base+'/participants',{nickname:'창작',client_request_id:crypto.randomUUID(),notice_version:PRIVATE_NOTICE,visibility:'private',retention_mode:'persisted'},bearer(r.invite)),201);
 const m=await parsed<Message>(await send(r,p,'stored-body','창작 삭제 데이터'),201);
 const stored=()=>runInDurableObject(privateRoom(r.room.id),async(_i,state)=>new CloudflareRepository(state.storage).transaction('room:'+r.room.id,async tx=>({body:(await tx.list(C.private_messages,{prefix:'m:',limit:100})).length,dedupe:(await tx.list(C.private_messages,{prefix:'d:',limit:100})).length})));
 const before=await stored();raw.push({step:'persisted rows before DELETE',status:200,retry_after:null,state:before});expect(before).toEqual({body:1,dedupe:1});
 const pending=call('persisted pending wait DELETE wake',r.base+'/wait?timeout=2&after='+encodeURIComponent(m.cursor),undefined,bearer(r.read));await registered(r);
 const removed=await call('persisted owner DELETE',r.base,undefined,bearer(r.owner_token),'DELETE'),woken=await pending,after=await stored();
 raw.push({step:'persisted rows after DELETE before assertions',status:removed.status,retry_after:null,state:{...after,wait_status:woken.status}});
 expect(removed.status).toBe(204);expect(woken.status).toBe(410);expect(after).toEqual({body:0,dedupe:0});
});

it('remaining registered wait rejects exactly when its server snapshot expires',async()=>{
 const r=await create(),expires=Date.now()+1000;
 await runInDurableObject(privateRoom(r.room.id),async(_i,state)=>new CloudflareRepository(state.storage).transaction('room:'+r.room.id,async tx=>{const row=(await tx.get(C.private_rooms,r.room.id))!,snapshot=row.snapshot as {[key:string]:import('../src/storage/repository').JsonValue};snapshot.expires_at=expires;await tx.put(C.private_rooms,r.room.id,row);}));
 await evictDurableObject(privateRoom(r.room.id));
 const epoch=await runInDurableObject<DurableObject,string>(privateRoom(r.room.id),async instance=>{const room=instance as PrivateRoom;await room.inspect(r.room.id);return room.diagnostics().epoch!;});
 const pending=call('wait returns at server expiry',r.base+'/wait?timeout=2&after='+encodeURIComponent(epoch+':0'),undefined,bearer(r.read));await registered(r);const response=await pending;
 raw.push({step:'wait expiry observed before assertion',status:response.status,retry_after:null,state:{server_expired:Date.now()>=expires,active_waits:(await diagnostics(r)).active_waits}});expect(response.status).toBe(410);expect(Date.now()).toBeGreaterThanOrEqual(expires);expect((await diagnostics(r)).active_waits).toBe(0);
});

it('remaining current private input and query limits fail safely through actual HTTP',async()=>{
 const r=await create(),p=await join(r,'창작'),grant=await anonymousGrant();
 for(const input of [{purpose:'x'.repeat(1001)},{purpose:'창작',ttl_seconds:59},{purpose:'창작',ttl_seconds:86401}])expect((await call('invalid creation bounds','/api/v1/rooms',{...input,creation_grant:grant,client_request_id:crypto.randomUUID()})).status).toBe(400);
 for(const nickname of ['', 'x'.repeat(65)])expect((await call('invalid participant name',r.base+'/participants',{nickname,client_request_id:crypto.randomUUID(),notice_version:PRIVATE_NOTICE,visibility:'private',retention_mode:'memory'},bearer(r.invite))).status).toBe(400);
 for(const input of [{text:'',client_message_id:'empty'},{text:'창작',client_message_id:'x'.repeat(129)}])expect((await post(r,p,input)).status).toBe(400);
 expect((await post(r,p,{text:'가'.repeat(5462),client_message_id:'too-many-bytes'})).status).toBe(413);
 expect((await post(r,p,{text:'x'.repeat(65536),client_message_id:'too-large-json'})).status).toBe(413);
 const malformed=await SELF.fetch(origin+r.base+'/messages',{method:'POST',headers:{...bearer(p.participant_token),'Content-Type':'application/json'},body:'{'}),malformedData=await malformed.json() as {error:{code:string}};raw.push({step:'malformed JSON response consumed',status:malformed.status,code:malformedData.error.code,retry_after:malformed.headers.get('Retry-After')});expect(malformed.status).toBe(400);
 const epoch=(await diagnostics(r)).epoch!;for(const query of ['after=-1','after=1.5','after='+encodeURIComponent(epoch+':1'),'limit=21','limit=0','timeout=26','timeout=-1'])expect((await call('invalid cursor or bounded query',r.base+'/wait?'+query,undefined,bearer(r.read))).status).toBe(400);
 const error=await call('unknown path secure error','/no-such-remaining-path');expect(error.status).toBe(404);expect(error.headers.get('Cache-Control')).toBe('no-store');expect(error.headers.get('Referrer-Policy')).toBe('no-referrer');expect(error.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');expect(error.headers.get('X-Content-Type-Options')).toBe('nosniff');expect(error.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
