import {publicTestRepo} from './selfhost-recent-repo';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PublicRoomCore} from '../src/public-core';
import {PUBLIC_POLICY,PUBLIC_CATALOG,PUBLIC_NOTICE,INTERNAL_IP_HEADER} from '../src/public-contracts';
import {handlePublicBrowserWith} from '../src/public-browser';
import {handlePublicRequestWith} from '../src/public-http';
import {hash,newToken} from '../src/http';
import {TEST_BUDGET} from './selfhost-budget';
const catalog=PUBLIC_CATALOG.map(r=>({...r,generation:'11111111-1111-4111-8111-111111111111'}));
const origin='https://example.test',base='/api/public/rooms/common-room';
function fixture(repo:import('../src/storage/repository').RepositoryPort){
 let now=Date.now();const rooms=new Map<string,PublicRoomCore>();
 const room=(slug:string)=>{let r=rooms.get(slug);if(!r){r=new PublicRoomCore({repo,origin,catalog:()=>catalog,policy:()=>({...PUBLIC_POLICY}),clock:()=>now,budget:TEST_BUDGET});rooms.set(slug,r);}return r;};
 async function call(path:string,method='GET',body?:object,headers:Record<string,string>={}){
  const request=new Request(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const response=await handlePublicBrowserWith(request,{origin,catalog,policy:{...PUBLIC_POLICY},assets:{fetch:async()=>new Response('<html><head></head><body><div id="app"></div></body></html>',{headers:{'Content-Type':'text/html'}})},trustedIP:()=> '192.0.2.1',limit:async()=>({success:true}),room:async slug=>room(slug),dispatch:r=>handlePublicRequestWith(r,{origin,catalog:()=>catalog,policy:()=>({...PUBLIC_POLICY}),room, trustedIpHash:()=>hash('192.0.2.1')})});
  assert(response);const text=await response.text();let data:Record<string,string>;try{data=JSON.parse(text);}catch{data={text};}return {status:response.status,data,headers:response.headers};
 }
 const newRequest=()=>({request_secret:newToken(),client_request_id:crypto.randomUUID(),nickname:'Dot <untrusted>',notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'});
 const auth=(secret:string)=>({Authorization:'Bearer '+secret});
 async function preview(id:string){const r=await call(base+'/connection-approval','POST',{action:'preview',request_id:id},{Origin:origin});assert.equal(r.status,200);return {nonce:r.data.nonce,cookie:r.headers.get('Set-Cookie')!.split(';')[0]};}
 const decide=(id:string,p:{nonce:string;cookie:string},action='approve',extra:object={})=>call(base+'/connection-approval','POST',{action,request_id:id,nonce:p.nonce,checked:true,risk_ack_version:PUBLIC_NOTICE,entry_notice_version:'toktok-entry-30d-v1',...extra},{Origin:origin,Cookie:p.cookie});
 return {call,newRequest,auth,preview,decide,room,advance:(ms:number)=>{now+=ms;},stop:()=>rooms.forEach(r=>r.shutdown())};
}
test('bare URL discovers a complete guide; agent retrieves approval and joins/posts; human revocation closes only that lease',async(t)=>{
 const f=fixture(publicTestRepo(t));try{
  const html=await f.call('/public/common-room');assert.equal(html.status,200);assert.match(html.data.text,/public-agent-entry/);assert.match(html.headers.get('Link')!,/text\/markdown/);
  const md=await f.call('/public/common-room?format=md');assert.match(md.data.text,/connection-requests/);assert.match(md.data.text,/이미 #grant/);
  const input=f.newRequest(),created=await f.call(base+'/connection-requests','POST',input);assert.equal(created.status,201);
  const id=created.data.request_id;assert(!JSON.stringify(created.data).includes(input.request_secret));assert(!created.data.operator_grant);
  const pending=await f.call(base+'/connection-request','GET',undefined,f.auth(input.request_secret));assert.equal(pending.data.status,'pending');
  assert.equal((await f.call(base+'/connection-request','GET',undefined,f.auth(input.request_secret))).status,429);
  const p=await f.preview(id);assert.equal((await f.decide(id,p)).data.status,'approved');f.advance(5000);
  const approved=await f.call(base+'/connection-request','GET',undefined,f.auth(input.request_secret));assert(approved.data.operator_grant);
  const join={...input,operator_grant:approved.data.operator_grant};assert.equal((await f.call(base+'/participants','POST',{...join,request_secret:newToken()})).status,403);
  const joined=await f.call(base+'/participants','POST',join);assert.equal(joined.status,201);
  assert.equal((await f.call(base+'/participants','POST',join)).data.lease_token,joined.data.lease_token);
  assert.equal((await f.call(base+'/messages','POST',{text:'Fictional test message',client_message_id:'one'},f.auth(joined.data.lease_token))).status,201);
  assert.equal((await f.decide(id,p,'revoke')).data.status,'revoked');assert.equal(f.room('common-room').diagnostics().leases.participants,0);
  assert.equal((await f.call(base+'/messages','POST',{text:'not accepted',client_message_id:'two'},f.auth(joined.data.lease_token))).status,403);
 }finally{f.stop();}
});
test('human approval verifies Origin, issued proof, nonce, request, room, explicit acknowledgement; denial cannot become approval',async(t)=>{
 const f=fixture(publicTestRepo(t));try{
  const a=f.newRequest(),r=await f.call(base+'/connection-requests','POST',a),p=await f.preview(r.data.request_id);
  const body={action:'approve',request_id:r.data.request_id,nonce:p.nonce,checked:true,risk_ack_version:PUBLIC_NOTICE,entry_notice_version:'toktok-entry-30d-v1'};
  assert.equal((await f.call(base+'/connection-approval','POST',body,{Cookie:p.cookie})).status,403);
  assert.equal((await f.call(base+'/connection-approval','POST',body,{Origin:'https://elsewhere.test',Cookie:p.cookie})).status,403);
  assert.equal((await f.call(base+'/connection-approval','POST',body,{Origin:origin,Cookie:p.cookie+'tampered'})).status,403);
  assert.equal((await f.decide(r.data.request_id,p,'approve',{nonce:newToken()})).status,403);
  assert.equal((await f.decide(r.data.request_id,p,'approve',{checked:false})).status,403);
  assert.equal((await f.call('/api/public/rooms/workshop/connection-approval','POST',body,{Origin:origin,Cookie:p.cookie})).status,410);
  assert.equal((await f.decide(r.data.request_id,p,'deny')).data.status,'denied');assert.equal((await f.decide(r.data.request_id,p)).data.status,'denied');
  assert.equal((await f.call(base+'/connection-request','GET',undefined,f.auth(a.request_secret))).data.status,'denied');assert.equal(f.room('common-room').diagnostics().leases.participants,0);
 }finally{f.stop();}
});
test('request secret/idempotency/cancellation/expiry and a fresh epoch fail closed without issuing authority',async(t)=>{
 const f=fixture(publicTestRepo(t));try{
  const a=f.newRequest(),r=await f.call(base+'/connection-requests','POST',a);
  assert.equal((await f.call(base+'/connection-requests','POST',a)).data.request_id,r.data.request_id);
  assert.equal((await f.call(base+'/connection-requests','POST',{...a,nickname:'other'})).status,409);
  assert.equal((await f.call(base+'/connection-request','GET',undefined,f.auth(newToken()))).status,410);
  const p=await f.preview(r.data.request_id);
  assert.equal((await f.call(base+'/connection-request','DELETE',undefined,f.auth(a.request_secret))).data.status,'revoked');
  assert.equal((await f.decide(r.data.request_id,p)).data.status,'revoked');
  f.advance(PUBLIC_POLICY.grantMs+1);assert.equal((await f.decide(r.data.request_id,p)).status,410);
  const fresh=fixture(publicTestRepo(t));try{assert.equal((await fresh.call(base+'/connection-request','GET',undefined,fresh.auth(a.request_secret))).status,410);}finally{fresh.stop();}
 }finally{f.stop();}
});
test('one browser can approve two agents independently; nonces cannot cross requests; the other browser cannot revoke',async(t)=>{
 const f=fixture(publicTestRepo(t));try{
  const first=f.newRequest(),a=await f.call(base+'/connection-requests','POST',first),p=await f.preview(a.data.request_id);
  assert.equal((await f.decide(a.data.request_id,p)).status,200);
  const second=f.newRequest(),b=await f.call(base+'/connection-requests','POST',second);
  const response=await f.call(base+'/connection-approval','POST',{action:'preview',request_id:b.data.request_id},{Origin:origin,Cookie:p.cookie});assert.equal(response.status,200);assert.equal(response.headers.get('Set-Cookie'),null);
  assert.equal((await f.decide(b.data.request_id,p)).status,403);
  const p2={cookie:p.cookie,nonce:response.data.nonce};assert.equal((await f.decide(b.data.request_id,p2)).status,200);
  assert.equal((await f.decide(a.data.request_id,p,'revoke')).data.status,'revoked');
  assert.equal((await f.call(base+'/connection-request','GET',undefined,f.auth(second.request_secret))).data.status,'approved');
  const other=f.newRequest();f.advance(60000);const c=await f.call(base+'/connection-requests','POST',other),differentBrowser=await f.preview(c.data.request_id);
  assert.equal((await f.decide(b.data.request_id,differentBrowser,'revoke')).status,403);
  assert.equal((await f.decide(b.data.request_id,p2,'revoke')).data.status,'revoked');
 }finally{f.stop();}
});
