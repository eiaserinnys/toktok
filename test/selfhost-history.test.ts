import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicTestRepo} from './selfhost-recent-repo';
import {historyContract} from './history-contract';
import {PublicRoomCore} from '../src/public-core';
import {RecentBuffer} from '../src/recent-buffer';
import {PUBLIC_CATALOG,PUBLIC_POLICY,PUBLIC_NOTICE,INTERNAL_IP_HEADER} from '../src/public-contracts';
import {TEST_BUDGET} from './selfhost-budget';
import {PrivateRoomCore} from '../src/private-core';
import {privateSnapshot} from './selfhost-private-fixture';
test('SQLite bounded latest/backward history and expiry contract',async t=>{console.log(await historyContract(publicTestRepo(t)));});
test('public HTTP lease authority, old initial history, backwards and invalid combinations',async t=>{
 const repo=publicTestRepo(t),now=Date.now(),buffer=new RecentBuffer(repo,'public:common-room');await buffer.initialize();for(let n=0;n<25;n++)await buffer.append({sender:{id:'fixture',nickname:'fictional'},text:'history '+n,client_message_id:String(n)},{messages:500,retentionMs:3600000,expiresAt:null},now-600000+n);
 const core=new PublicRoomCore({repo,origin:'https://fixture.example',catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),budget:TEST_BUDGET});t.after(()=>core.shutdown());
 const call=(path:string,token?:string,body?:object)=>core.fetch(new Request('https://fixture.example/api/public/rooms/common-room'+path,{method:body?'POST':'GET',headers:{[INTERNAL_IP_HEADER]:'a'.repeat(64),...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
 assert.equal((await call('/messages?before=x')).status,401);const joined=await call('/watchers',undefined,{notice_version:PUBLIC_NOTICE});const {lease_token}=await joined.json() as {lease_token:string};
 const first=await call('/messages',lease_token);assert.equal(first.status,200);const page=await first.json() as {messages:{sequence:number}[];before_cursor:string;cursor:string};assert.equal(page.messages[0].sequence,6);assert.equal(page.messages.at(-1)?.sequence,25);
 assert.equal((await call('/messages?before='+page.before_cursor+'&after='+page.cursor,lease_token)).status,400);
 assert.equal((await call('/wait?before='+page.before_cursor,lease_token)).status,400);
 await new Promise(r=>setTimeout(r,2050));const previous=await call('/messages?before='+page.before_cursor,lease_token);assert.equal(previous.status,200);assert.deepEqual((await previous.json() as {messages:{sequence:number}[]}).messages.map(m=>m.sequence),[1,2,3,4,5]);assert.equal(core.diagnostics().active_waits,0);
});
test('private recent, opt-in persistence and legacy memory initial/backward retain access boundaries',async t=>{
 const repo=publicTestRepo(t);for(const mode of ['recent','persisted','memory']){let now=Date.now();const {snapshot,tokens}=await privateSnapshot('history-'+mode,mode==='persisted',now);snapshot.expires_at=now+3600000;if(snapshot.persist)snapshot.retention_seconds=3600;if(mode==='memory'){snapshot.notice_version='toktok-risk-v1';snapshot.creator_ack.version='toktok-risk-v1';}const core=new PrivateRoomCore({repo,origin:'https://fixture.example',budget:TEST_BUDGET,clock:()=>now});t.after(()=>core.shutdown());await core.initialize(snapshot);
 const base='https://fixture.example/api/v1/rooms/'+snapshot.id;
 const call=(path:string,token:string,body?:object)=>core.fetch(new Request(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
 const join=await call('/participants',tokens.invite,{nickname:'fixture',client_request_id:'join',notice_version:snapshot.notice_version,visibility:'private',retention_mode:mode==='persisted'?'persisted':mode==='recent'?'recent_buffer':'memory'});assert.equal(join.status,201);const {participant_token}=await join.json() as {participant_token:string};
 for(let n=0;n<24;n++){const sent=await call('/messages',participant_token,{text:'old '+n,client_message_id:String(n)});assert.equal(sent.status,201);await sent.arrayBuffer();}
 now+=600000;const latest=await call('/messages',tokens.read);assert.equal(latest.status,200);const page=await latest.json() as {messages:{sequence:number}[];before_cursor:string};assert.equal(page.messages.length,20);assert.equal(page.messages.at(-1)?.sequence,24);now+=2001;
 const previous=await call('/messages?before='+page.before_cursor,tokens.read);assert.equal(previous.status,200);assert.deepEqual((await previous.json() as {messages:{sequence:number}[]}).messages.map(m=>m.sequence),[1,2,3,4]);
 }});

import {historyPage} from '../src/history-page';
test('empty history reset normalizes backward cursor to the current epoch',()=>{const epoch=crypto.randomUUID(),old=crypto.randomUUID();const page=historyPage([],epoch,0,1,undefined,old+':19',20,20);assert.equal(page.history_status,'history_reset');assert.equal(page.before_cursor,epoch+':1');assert.equal(page.cursor,epoch+':0');assert.equal(page.has_older,false);});
