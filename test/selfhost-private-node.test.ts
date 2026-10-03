import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
import {PrivateRooms} from '../src/runtime/private-rooms';
import {createServer} from '../src/runtime/node-http';
import {privateSnapshot} from './selfhost-private-fixture';
import {TEST_BUDGET} from './selfhost-budget';
test('Node private HTTP two clients exchange three cursor pages and graceful stop recovers wait',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'toktok-private-http-')),file=join(dir,'db');applySQLite(file);const repo=new SQLiteRepository(file);let now=Date.now();const rooms=new PrivateRooms({origin:'http://localhost',repo,budget:TEST_BUDGET,clock:()=>now});
 const {snapshot,tokens}=await privateSnapshot('http-room',false,now);await rooms.initialize(snapshot);const runtime=createServer({origin:'http://localhost',repo,close:()=>rooms.shutdown(),handler:async r=>await rooms.fetch(r)??new Response(null,{status:404})});runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');const address=runtime.server.address();assert(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port+'/api/v1/rooms/http-room';
 try{
 const call=(path:string,method='GET',data?:object,token=tokens.read)=>fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const participants:string[]=[];
 for(let n=0;n<2;n++){const r=await call('/participants','POST',{nickname:'mock',client_request_id:'join-'+n,notice_version:snapshot.notice_version,visibility:'private',retention_mode:'memory'},tokens.invite);assert.equal(r.status,201);participants.push((await r.json()).participant_token);}
 let cursor='';for(let n=0;n<3;n++){const r=await call('/messages','POST',{text:'mock',client_message_id:'send-'+n},participants[n%2]);assert.equal(r.status,201);await r.arrayBuffer();now+=2000;const page=await call('/messages'+(cursor?'?after='+encodeURIComponent(cursor):''));assert.equal(page.status,200);const data=await page.json();assert.equal(data.messages.length,1);assert.equal(data.messages[0].sequence,n+1);cursor=data.cursor;}
 now+=2000;const pending=call('/wait?after='+encodeURIComponent(cursor));for(let n=0;n<50&&rooms.room(snapshot.id).diagnostics().active_waits!==1;n++)await new Promise(r=>setTimeout(r,10));assert.equal(rooms.room(snapshot.id).diagnostics().active_waits,1);const started=Date.now(),stopped=runtime.stop();const response=await pending;assert.equal(response.status,503);assert.equal((await response.json()).cursor,cursor);await stopped;assert(Date.now()-started<25000);assert.equal(rooms.diagnostics().timers,0);assert.equal(rooms.room(snapshot.id).diagnostics().active_waits,0);assert.equal(rooms.room(snapshot.id).diagnostics().active_handlers,0);console.log(JSON.stringify({phase:'private-node-http',clients:2,cursor_pages:3,shutdown_ms:Date.now()-started,waits:0,handlers:0,timers:0}));
 }finally{await runtime.stop();rmSync(dir,{recursive:true,force:true});}
});
