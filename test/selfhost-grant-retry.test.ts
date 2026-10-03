import {publicTestRepo} from './selfhost-recent-repo';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PublicRoomCore} from '../src/public-core';
import {PUBLIC_CATALOG,PUBLIC_POLICY,PUBLIC_NOTICE,type ValidatedOperatorAck} from '../src/public-contracts';
import {HttpError} from '../src/http';
import {TEST_BUDGET} from './selfhost-budget';
test('operator grant outer JSON retry preserves control budget delay without RPC error properties',async(t)=>{const repo=publicTestRepo(t);
 const core=new PublicRoomCore({repo,origin:'http://localhost:18794',catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),budget:{...TEST_BUDGET,reserve:async()=>{throw Object.assign(new HttpError(429,'BUDGET_EXCEEDED','예산 한도'),{retryAfter:17});}}});
 try{
  const result=await core.issueOperatorGrant({room:'common-room',risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:'a'.repeat(64)} as ValidatedOperatorAck),wire=JSON.parse(JSON.stringify(result)) as typeof result;
  console.log(JSON.stringify({phase:'grant-retry-raw',status:wire.status,error_code:'error' in wire.data?wire.data.error.code:null,retry_after_ms:wire.retry_after_ms??null}));assert.equal(wire.status,429);assert.equal(wire.retry_after_ms,17000);assert.ok('error' in wire.data);assert.equal(wire.data.error.retry_after_ms,17000);assert.equal(wire.data.error.code,'BUDGET_EXCEEDED');assert.equal(core.diagnostics().pending_grants,0);assert.equal(core.diagnostics().active_handlers,0);
  console.log(JSON.stringify({phase:'grant-budget-retry',status:wire.status,retry_after_ms:wire.retry_after_ms,pending_grants:0,handlers:0}));
 }finally{core.shutdown();}
});
