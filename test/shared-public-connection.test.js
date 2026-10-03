import {it,expect} from 'vitest';
import {createPublicConnectionController} from '../public/shared/public-connection-controller.js';
import {renderPublicConnection} from '../public/shared/screens/public-connection.js';
import {renderPublicAgentEntry} from '../public/shared/components/public-agent-entry.js';
import {componentRegistry,dialogRegistry,screenRegistry} from '../public/shared/registry.js';
import {routeRegistry} from '../public/shared/routes.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage} from '../public/admin-design/coverage.js';
const requestId='fictional-request';
const payload={request_id:requestId,status:'pending',nickname:'<script>not trusted</script>',expires_at:'2026-10-03T00:05:00Z',confirmation_expires_at:'2026-10-03T00:05:00Z',entry_expires_at:null,entry_notice_version:'toktok-entry-30d-v1',entry_duration_seconds:2592000,lease_idle_seconds:300,nonce:'not-in-vm',operator_grant:'never-in-vm',participant_connected:false};
it('approval needs an explicit checked action; nonce/grant never enter renderer state; decline has no checked assertion',async()=>{
 const calls=[],paints=[];const effects={publicConnection:async(slug,body)=>{calls.push({slug,body});return {...payload,...(body.action==='approve'?{entry_expires_at:'2026-11-02T00:01:00Z'}:{}),status:body.action==='approve'?'approved':body.action==='deny'?'denied':'pending'};}};
 const c=createPublicConnectionController({effects,slug:'common-room',requestId,paint:vm=>paints.push(vm)});await c.load();c.open();await c.decide('approve',false);expect(calls).toHaveLength(1);
 await c.decide('approve',true);expect(calls[1].body).toMatchObject({checked:true,nonce:'not-in-vm',request_id:requestId});
 expect(JSON.stringify(paints)).not.toMatch(/not-in-vm|never-in-vm|operator_grant/);
 const html=renderPublicConnection(c.snapshot());expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 c.dispose();const denied=createPublicConnectionController({effects,slug:'common-room',requestId,paint:()=>{}});await denied.load();await denied.decide('deny');expect(calls.at(-1).body).not.toHaveProperty('checked');denied.dispose();
});
it('late previews after navigation cannot restore approval controls or perform actions',async()=>{
 let resolve;const paints=[];const c=createPublicConnectionController({effects:{publicConnection:()=>new Promise(r=>{resolve=r;})},slug:'common-room',requestId,paint:vm=>paints.push(vm)});
 const loading=c.load();c.dispose();resolve(payload);await loading;expect(paints).toHaveLength(1);await c.decide('approve',true);expect(paints).toHaveLength(1);
});
it('an expired approval clears nonce and controls and uses the same terminal state as the preview fixture',async()=>{
 let calls=0;const c=createPublicConnectionController({effects:{publicConnection:async()=>{if(++calls===1)return payload;throw Object.assign(Error('gone'),{code:'CONNECTION_GONE'});}},slug:'common-room',requestId,paint:()=>{}});
 await c.load();c.open();await c.decide('approve',true);expect(c.snapshot()).toMatchObject({status:'expired',connection:null,dialog:null,pending:false});
 expect(renderPublicConnection(c.snapshot())).not.toContain('data-x="review-public-connection"');await c.decide('approve',true);expect(calls).toBe(2);c.dispose();
 const expired=createFixtureAdapter().catalog().screens.find(f=>f.fixtureId==='public-connection-expired');expect(expired.args[0]).toMatchObject({status:'expired',connection:null});
});
it('one shared entry exposes Markdown discovery without participant authority',()=>{
 const html=renderPublicAgentEntry({slug:'common-room',title:'<img src=x>'});expect(html).toContain('/public/common-room?format=md');expect(html).toContain('&lt;img');expect(html).toContain('URL만으로 발언 권한');expect(html).not.toMatch(/operator_grant|request_secret/);
});
it('detects missing public connection component, consent dialog, expiry state and revocation action',()=>{
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures:createFixtureAdapter().catalog()};
 expect(validateCoverage(input)).toEqual([]);
 for(const [list,key,value,error] of [['components','componentId','public-agent-entry','component:public-agent-entry:bare-url'],['dialogs','dialogId','public-connection','dialog:public-connection:unchecked'],['screens','fixtureId','public-connection-expired','screen-state:public-connection:expired'],['transitions','transitionId','public-revoked','transition:public-revoked']]){
  const fixtures=structuredClone(input.fixtures);fixtures[list]=fixtures[list].filter(row=>row[key]!==value);expect(validateCoverage({...input,fixtures})).toContain(error);
 }
});
