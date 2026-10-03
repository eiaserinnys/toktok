import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
import {createApplication} from '../src/selfhost/application';

// Real socket -> shared HTTP -> ControlCore/SQLite -> PrivateRoomCore, fake mail only.
test('single SQLite host bootstraps by OTP, guards QA, and creates memory/private rooms via HTTP',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'toktok-integrated-')),file=join(directory,'db.sqlite');applySQLite(file);const repo=new SQLiteRepository(file);
 let code='',mailCalls=0;const app=createApplication({origin:'http://localhost:18976',repo,assets:resolve('public'),bootstrapEmail:'admin@fixture.example',auth:{sendEmail:async delivery=>{code=delivery.code;mailCalls++;}}});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const address=app.server.address();assert(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
 const jar=new Map<string,string>();let csrf='';
 async function request(path:string,method='GET',body?:object,token?:string){
  const response=await fetch(base+path,{method,headers:{Origin:'http://localhost:18976',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(jar.size?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
  for(const value of response.headers.getSetCookie()){const part=value.split(';')[0],i=part.indexOf('=');if(part.slice(i+1))jar.set(part.slice(0,i),part.slice(i+1));else jar.delete(part.slice(0,i));}
  const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,headers:response.headers,data};
 }
 try{
  assert.equal((await request('/ready')).status,200);
  const denied=await request('/admin/design/flows');assert.equal(denied.status,401);assert(denied.headers.get('Content-Security-Policy')?.includes("connect-src 'none'"));
  const config=await request('/api/config');assert.equal(config.data.mode,'demo');assert.equal(config.data.public.catalog.length,2);
  const start=await request('/api/auth/start','POST',{purpose:'login'});assert.equal(start.status,200);
  const send=await request('/api/auth/email/send','POST',{flow_id:start.data.flow,email:'admin@fixture.example',client_request_id:'mail-one'});assert.equal(send.status,200);assert.equal(mailCalls,1);
  const complete=await request('/api/auth/complete','POST',{flow:start.data.flow,nonce:start.data.nonce,otp:code});assert.equal(complete.status,200);assert.equal(complete.headers.getSetCookie().length,2);
  const session=await request('/api/session');assert.equal(session.data.role,'member');csrf=session.data.csrf_token;
  assert.equal((await request('/api/admin/bootstrap','POST',{confirm:true})).status,200);
  const review=await request('/admin/design/flows');assert.equal(review.status,200);assert(review.data.includes('admin-design/bootstrap.js'));assert(review.headers.get('Content-Security-Policy')?.includes("connect-src 'none'"));
  assert.equal((await request('/admin/design/_assets/effects/live-http.js')).status,404);
  assert.equal((await request('/admin-design/bootstrap.js')).status,404);
  const context=await request('/api/private/create-context','POST',{});assert.equal(context.status,200);
  const grant=await request('/api/private/create-grants','POST',{nonce:context.data.nonce,risk_ack:true,risk_ack_version:'toktok-risk-v1'});assert.equal(grant.status,200);
  const created=await request('/api/v1/rooms','POST',{purpose:'mock private',client_request_id:crypto.randomUUID(),creation_grant:grant.data.creation_grant,persist:false});assert.equal(created.status,201,created.data.error?.code);
  const url=new URL(created.data.invite_url),id=created.data.room.id,invite=url.pathname.split('/').at(-1)!;
  const metadata=await request('/api/v1/rooms/'+id,'GET',undefined,invite);assert.equal(metadata.data.room.retention_mode,'memory');
  const joined=await request('/api/v1/rooms/'+id+'/participants','POST',{nickname:'fixture',client_request_id:'join-one',notice_version:'toktok-risk-v1',visibility:'private',retention_mode:'memory'},invite);assert.equal(joined.status,201);
  const sent=await request('/api/v1/rooms/'+id+'/messages','POST',{text:'mock relay body',client_message_id:'message-one'},joined.data.participant_token);assert.equal(sent.status,201);
  const page=await request('/api/v1/rooms/'+id+'/messages','GET',undefined,joined.data.participant_token);assert.equal(page.status,200);assert.equal(page.data.messages[0].text,'mock relay body');
  assert.equal((await request('/api/v1/rooms/'+id+'/close','POST',{},created.data.owner_token)).status,200);
  assert.equal(mailCalls,1);
 }finally{await app.stop();rmSync(directory,{recursive:true,force:true});}
});
