import {TEST_BUDGET} from './selfhost-budget';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PublicRoomCore} from '../src/public-core';
import {validatePublicPolicy} from '../src/public-policy';
import {PUBLIC_POLICY,PUBLIC_CATALOG,PUBLIC_NOTICE,INTERNAL_IP_HEADER,type ValidatedOperatorAck} from '../src/public-contracts';
test('public fixed envelope budgets and worst escaped message guarantee page progress',async()=>{
 for(const bad of [{responseBytes:1},{byteBurst:65535},{waits:150,handlers:149},{batchMs:10001},{batchMs:2000,waitMs:1999},{responseBurst:0}])assert.throws(()=>validatePublicPolicy({...PUBLIC_POLICY,...bad}),/POLICY_BOUNDS/);
 let now=Date.now();const core=new PublicRoomCore({budget:TEST_BUDGET,origin:'http://localhost:18794',catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),clock:()=>now});const ip='a'.repeat(64),base='http://localhost:18794/api/public/rooms/common-room';
 const call=(path:string,method='GET',data?:object,token?:string)=>core.fetch(new Request(base+path,{method,headers:{[INTERNAL_IP_HEADER]:ip,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined}));
 const grant=await core.issueOperatorGrant({room:'common-room',checked:true,risk_ack_version:PUBLIC_NOTICE,trustedIpHash:ip} as ValidatedOperatorAck);assert.equal(grant.status,201);const joined=await call('/participants','POST',{operator_grant:(grant.data as {operator_grant:string}).operator_grant,nickname:'\u0001'.repeat(64),client_request_id:'join',notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'memory'});assert.equal(joined.status,201);const token=(await joined.json()).lease_token;
 const text='\u0001'.repeat(2048),client_message_id='\u0001'.repeat(128);const posted=await call('/messages','POST',{text,client_message_id},token);assert.equal(posted.status,413); // JSON cap is checked before acceptance.
 const sent=await call('/messages','POST',{text:'\u0001'.repeat(1100),client_message_id},token);assert.equal(sent.status,201);const one=await sent.json();
 const page=await call('/messages','GET',undefined,token),raw=await page.text();assert(new TextEncoder().encode(raw).byteLength<=65536);const parsed=JSON.parse(raw);assert.equal(parsed.messages.length,1);assert.equal(parsed.cursor,one.cursor);assert.equal(parsed.has_more,false);
 now+=2000;const delta=await (await call('/messages?after='+encodeURIComponent(parsed.cursor),'GET',undefined,token)).json();assert.equal(delta.messages.length,0);assert.equal(delta.cursor,parsed.cursor);core.shutdown();
 console.log(JSON.stringify({phase:'public-envelope',bytes:new TextEncoder().encode(raw).byteLength,page_count:1,cursor_advanced:true}));
});
