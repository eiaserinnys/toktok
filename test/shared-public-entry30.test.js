import {it,expect} from 'vitest';
import {createPublicConnectionController} from '../public/shared/public-connection-controller.js';
import {renderPublicConnection} from '../public/shared/screens/public-connection.js';
import {renderPublicEntryTerms} from '../public/shared/components/public-entry-terms.js';
import {componentRegistry,dialogRegistry,screenRegistry} from '../public/shared/registry.js';
import {routeRegistry} from '../public/shared/routes.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage,buildGraph} from '../public/admin-design/coverage.js';
import {renderFlowBoard} from '../public/shared/screens/flow-board.js';
const pending={request_id:'fictional-entry',nickname:'가상 <agent>',status:'pending',participant_connected:false,expires_at:'2030-01-01T00:05:00Z',confirmation_expires_at:'2030-01-01T00:05:00Z',entry_expires_at:null,entry_notice_version:'toktok-entry-30d-v1',entry_duration_seconds:2592000,lease_idle_seconds:300,nonce:'fictional-nonce',operator_grant:'fictional-grant',request_secret:'fictional-secret',cookie:'fictional-cookie'};
const approved={...pending,status:'approved',expires_at:'2030-01-31T00:01:00Z',entry_expires_at:'2030-01-31T00:01:00Z'};
const controller=(effects,paint=()=>{})=>createPublicConnectionController({effects,paint,slug:'fictional-room',requestId:pending.request_id});
it('requires the server 30-day notice and checkbox, submits once, and projects authority-free dates',async()=>{
 let finish;const calls=[],paints=[],c=controller({publicConnection:async(_slug,body)=>{calls.push(body);return body.action==='preview'?pending:new Promise(r=>finish=r);}},vm=>paints.push(vm));
 await c.load();c.open();await c.decide('approve',false);expect(calls).toHaveLength(1);const first=c.decide('approve',true);await c.decide('approve',true);c.close();expect(c.snapshot().dialog).toBe('approve');expect(calls).toHaveLength(2);
 expect(calls[1]).toEqual({action:'approve',request_id:pending.request_id,nonce:pending.nonce,checked:true,risk_ack_version:'toktok-risk-v2',entry_notice_version:pending.entry_notice_version});finish(approved);await first;
 expect(c.snapshot().connection).toMatchObject({status:'approved',can_approve:false,confirmation_expires_at:pending.confirmation_expires_at,entry_expires_at:approved.entry_expires_at});await c.decide('approve',true);expect(calls).toHaveLength(2);
 expect(JSON.stringify(paints)).not.toMatch(/fictional-(nonce|grant|secret|cookie)|operator_grant|request_secret/);c.dispose();
});
it('missing, unknown, malformed and legacy entry metadata cannot open or submit approval, but denial remains available',async()=>{
 for(const patch of [{entry_notice_version:undefined},{entry_notice_version:'future-version'},{entry_duration_seconds:300},{confirmation_expires_at:'invalid'},{entry_expires_at:undefined},{entry_expires_at:approved.entry_expires_at},{nonce:undefined}]){
  const calls=[],c=controller({publicConnection:async(_slug,body)=>{calls.push(body);return {...pending,...patch};}});await c.load();c.open();expect(c.snapshot().dialog).toBe(null);expect(c.snapshot().connection.can_approve).toBe(false);await c.decide('approve',true);expect(calls).toHaveLength(1);
  expect(renderPublicConnection(c.snapshot())).toMatch(/data-x="review-public-connection" disabled/);if(patch.nonce!==undefined||!Object.hasOwn(patch,'nonce')){await c.decide('deny');expect(calls.at(-1).action).toBe('deny');expect(calls.at(-1)).not.toHaveProperty('entry_notice_version');}c.dispose();
 }
});
it('separates confirmation deadline, entry expiry, idle lease and unchanged legacy expiry',()=>{
 const vm={status:'ready',slug:'fictional-room',connection:{...approved,can_approve:false}},html=renderPublicConnection(vm);
 expect(html).toContain('사람 확인 요청의 기한');expect(html).toContain(pending.confirmation_expires_at);expect(html).toContain('입장권 만료');expect(html).toContain(approved.entry_expires_at);expect(html).toContain('5분 동안 유효한 읽기·대기·발언');expect(html).toContain('발언이 없어도 유휴 상태가 아니에요');expect(html).toContain('빈자리가 필요해요');expect(html).toContain('브라우저에서 언제든');expect(html).toContain('종료·비활성화');expect(html).toContain('다시 개설');expect(html).toContain('&lt;agent&gt;');
 expect(renderPublicEntryTerms({connection:{...approved,lease_idle_seconds:30}})).toContain('30초 동안');
 const legacy=renderPublicConnection({...vm,connection:{request_id:pending.request_id,nickname:'가상 legacy',status:'approved',expires_at:pending.expires_at}});expect(legacy).toContain('기존 연결 만료');expect(legacy).toContain('30일 입장권으로 전환되지 않아요');expect(legacy).not.toContain('승인한 입장권은 승인 시점부터 30일');
});
it('revoke keeps its existing proof boundary and stale preview/approval cannot repaint after navigation',async()=>{
 const calls=[],c=controller({publicConnection:async(_slug,body)=>{calls.push(body);return body.action==='revoke'?{...approved,status:'revoked',participant_connected:true,entry_expires_at:null}:approved;}});await c.load();c.open(true);await c.decide('revoke');expect(calls.at(-1)).toEqual({action:'revoke',request_id:pending.request_id,nonce:pending.nonce});expect(c.snapshot().connection).toMatchObject({status:'revoked',participant_connected:false});expect(renderPublicConnection(c.snapshot())).toContain('입장권을 철회했어요');c.dispose();
 let finish;const paints=[],late=controller({publicConnection:async(_slug,body)=>body.action==='preview'?pending:new Promise(r=>finish=r)},v=>paints.push(v));await late.load();late.open();const task=late.decide('approve',true);const count=paints.length;late.dispose();finish(approved);await task;expect(paints).toHaveLength(count);
});
it('registers entry terms, unavailable consent, idle reentry and expiry in the same action graph',()=>{
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures:createFixtureAdapter().catalog()};expect(validateCoverage(input)).toEqual([]);
 const graph=buildGraph(input);expect(()=>renderFlowBoard(graph,{boardMode:'DEMO',boardRole:'all'})).not.toThrow();expect(graph.edges.find(e=>e.transitionId==='public-reentered').kind).toBe('reference');expect(graph.nodes.find(n=>n.id==='public-connection-checked').dialog.state).toBe('checked');expect(graph.nodes.find(n=>n.id==='public-connection-revoke-error').dialog.state).toBe('revoke-error');
 for(const [list,keep,error] of [['components',f=>f.componentId!=='public-entry-terms','component:public-entry-terms:pending'],['dialogs',f=>f.dialogId!=='public-connection'||f.state!=='notice-unavailable','dialog:public-connection:notice-unavailable'],['screens',f=>f.fixtureId!=='public-connection-idle','screen-state:public-connection:idle'],['transitions',f=>f.transitionId!=='public-entry-expired','transition:public-entry-expired']]){const fixtures=structuredClone(input.fixtures);fixtures[list]=fixtures[list].filter(keep);expect(validateCoverage({...input,fixtures})).toContain(error);}
});

it('does not report revoked after budget refusal, and stale confirmation requires an explicit refresh',async()=>{
 let mode='revoke';const c=controller({publicConnection:async(_slug,body)=>{if(body.action==='preview')return mode==='revoke'?approved:pending;throw Object.assign(Error('denied'),{code:mode==='revoke'?'BUDGET_EXCEEDED':'OPERATOR_ACK_REQUIRED'});}});
 await c.load();c.open(true);await c.decide('revoke');expect(c.snapshot()).toMatchObject({dialog:'revoke',pending:false,error:{code:'BUDGET_EXCEEDED'},connection:{status:'approved'}});expect(renderPublicConnection(c.snapshot())).not.toContain('입장권을 철회했어요');
 mode='approve';await c.load();c.open();await c.decide('approve',true);expect(c.snapshot()).toMatchObject({dialog:'approve',connection:{status:'pending'},error:{code:'OPERATOR_ACK_REQUIRED'}});c.dispose();
});
