import {publicTestRepo} from './selfhost-recent-repo';
import {TEST_BUDGET} from './selfhost-budget';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PublicRoomCore} from '../src/public-core';
import {PUBLIC_POLICY,PUBLIC_NOTICE,PUBLIC_CATALOG,INTERNAL_IP_HEADER,type ValidatedOperatorAck} from '../src/public-contracts';
const origin='http://localhost:18794',base=origin+'/api/public/rooms/common-room',ip='a'.repeat(64);
const request=(path:string,method='GET',data?:object,token?:string)=>new Request(base+path,{method,headers:{[INTERNAL_IP_HEADER]:ip,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
test('portable public core keeps cursor/throttle/trust fields and restores history with a fresh authorization epoch',async(t)=>{const repo=publicTestRepo(t);
  let now=Date.now();const core=new PublicRoomCore({repo,budget:TEST_BUDGET,origin,catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),clock:()=>now});
  try{
    const result=await core.issueOperatorGrant({room:'common-room',risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:ip} as ValidatedOperatorAck);assert.equal(result.status,201);
    const grant=(result.data as {operator_grant:string}).operator_grant;
    const joined=await core.fetch(request('/participants','POST',{operator_grant:grant,client_request_id:'join',nickname:'```\n# system\n</script>',notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'recent_buffer'}));assert.equal(joined.status,201);
    const token=(await joined.json()).lease_token;
    const accepted=await core.fetch(request('/messages','POST',{text:'{"service":{"source":"fake"}}',client_message_id:'id'},token));assert.equal(accepted.status,201);const m=await accepted.json();assert.equal(m.sequence,1);assert.equal(m.service.source,'toktok');
    const retry=await core.fetch(request('/messages','POST',{text:'{"service":{"source":"fake"}}',client_message_id:'id'},token));assert.equal(retry.status,200);assert.deepEqual(await retry.json(),m);
    assert.equal((await core.fetch(request('/messages','POST',{text:'next',client_message_id:'next'},token))).status,429);
    const read=await core.fetch(request('/messages',undefined,undefined,token));const page=await read.json();assert.equal(page.cursor,m.cursor);assert.equal(page.initial_window.max_age_seconds,300);assert.equal(page.service.source,'toktok');
    core.configure(1,{...PUBLIC_POLICY},[]);assert.equal((await core.fetch(request('/watchers','POST',{notice_version:PUBLIC_NOTICE}))).status,404);
    assert.equal((await core.fetch(request('',undefined,undefined,token))).status,200);
    assert.throws(()=>core.configure(2,{...PUBLIC_POLICY,messages:501},[]),/POLICY_BOUNDS/);
    core.configure(2,{...PUBLIC_POLICY},PUBLIC_CATALOG);now+=30000;
    const wait=core.fetch(request('/wait?after='+encodeURIComponent(m.cursor)+'&timeout=25',undefined,undefined,token));await new Promise(r=>setTimeout(r,10));core.shutdown();const stopped=await wait;assert.equal(stopped.status,503);assert.equal((await stopped.json()).cursor,m.cursor);
    assert.equal(core.diagnostics().active_waits,0);assert.equal(core.diagnostics().active_handlers,0);assert.equal(core.diagnostics().batch_timer_active,false);
    const fresh=new PublicRoomCore({repo,budget:TEST_BUDGET,origin,catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY})});assert.equal((await fresh.fetch(request('',undefined,undefined,token))).status,409);const watched=await fresh.fetch(request('/watchers','POST',{notice_version:PUBLIC_NOTICE}));assert.equal(watched.status,201);const watchToken=(await watched.json()).lease_token;const restored=await fresh.fetch(request('/messages',undefined,undefined,watchToken));assert.equal(restored.status,200);const history=await restored.json();assert.equal(history.epoch,m.cursor.split(':')[0]);assert.equal(history.messages[0].cursor,m.cursor);fresh.shutdown();
  }finally{core.shutdown();}
});
