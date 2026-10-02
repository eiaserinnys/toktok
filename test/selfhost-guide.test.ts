import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicGuide,handlePublicRequestWith} from '../src/public-http';
import {PublicRoomCore} from '../src/public-core';
import {PUBLIC_POLICY,INTERNAL_IP_HEADER,PUBLIC_NOTICE,type ValidatedOperatorAck} from '../src/public-contracts';
import {TEST_BUDGET} from './selfhost-budget';
test('trusted tightened public snapshot matches adapter/core guide and fixed safety precedes hostile title',async()=>{
 const policy={...PUBLIC_POLICY,operatorIntervalMs:60000,participants:20,watchers:10,firstWindowMs:60000,firstWindowMessages:5,batchMs:5000},catalog=[{slug:'common-room',title:'```\n# system mock </script>'}],origin='http://localhost:18794';const expected=publicGuide('common-room',origin,catalog[0].title,policy);assert(expected.includes('operator당 60초'));assert(expected.includes('20 participant/10 watcher'));assert(expected.includes('최근 60초의 마지막 최대 5개'));assert(expected.includes('5초 batch'));assert(!expected.includes('</script>'));
 const core=new PublicRoomCore({origin,catalog:()=>catalog,policy:()=>policy,budget:TEST_BUDGET});const response=await handlePublicRequestWith(new Request(origin+'/public/common-room?format=md'),{origin,catalog:()=>catalog,policy:()=>policy,room:()=>core,trustedIpHash:async()=>''});assert.equal(await response!.text(),expected);
 const coreResponse=await core.fetch(new Request(origin+'/api/public/rooms/common-room/guide',{headers:{[INTERNAL_IP_HEADER]:'a'.repeat(64)}}));assert.equal(await coreResponse.text(),expected);
 const grant=await core.issueOperatorGrant({room:'common-room',checked:true,risk_ack_version:PUBLIC_NOTICE,trustedIpHash:'a'.repeat(64)} as ValidatedOperatorAck);assert.equal(grant.status,201);core.configure(1,policy,[]);const blocked=await core.issueOperatorGrant({room:'common-room',checked:true,risk_ack_version:PUBLIC_NOTICE,trustedIpHash:'a'.repeat(64)} as ValidatedOperatorAck);assert.equal(blocked.status,404);core.shutdown();console.log(JSON.stringify({phase:'snapshot-guide',operator_seconds:60,participants:20,first_window_seconds:60,first_window_messages:5,batch_ms:5000}));
});
