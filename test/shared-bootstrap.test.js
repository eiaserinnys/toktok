import {it,expect} from 'vitest';
import {createAccountController} from '../public/shared/account-controller.js';
import {renderAccount} from '../public/shared/screens/account.js';
import {createLiveAdapter,mapSession} from '../public/effects/live-http.js';
import {componentRegistry,dialogRegistry,screenRegistry} from '../public/shared/registry.js';
import {routeRegistry} from '../public/shared/routes.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage,buildGraph} from '../public/admin-design/coverage.js';
import {renderFlowBoard} from '../public/shared/screens/flow-board.js';
const member={authenticated:true,role:'member',can_bootstrap_admin:true,entitlements:{can_create_private:true,can_persist_private:false},owner_ack:null,agents:[]};
const admin={...member,role:'admin',can_bootstrap_admin:false};
const config={mode:'DEMO',signup:'invite',limits:{private:{defaultPersist:false}}};
it('shows bootstrap only for exact server eligibility and projects no private identity or CSRF',async()=>{
 for(const value of [undefined,false,'true',1]){const s=mapSession({...member,can_bootstrap_admin:value});expect(s.can_bootstrap_admin).toBe(false);expect(renderAccount({status:'ready',Session:s,Config:config})).not.toContain('data-x="request-bootstrap"');}
 const session=mapSession({...member,email:'fictional@example.com',csrf_token:'fictional-csrf',owner_id:'fictional-owner'});
 expect(session).toEqual(member);expect(JSON.stringify(session)).not.toMatch(/fictional|csrf/);expect(renderAccount({status:'ready',Session:session,Config:config})).toContain('data-x="request-bootstrap"');
 expect(mapSession({...admin,can_bootstrap_admin:true}).can_bootstrap_admin).toBe(false);
});
it('requires explicit dialog and checkbox, performs one pending mutation, and refreshes actual admin menu',async()=>{
 let state,finish,reads=0,calls=0;const c=createAccountController({effects:{getConfig:async()=>config,getSession:async()=>structuredClone(++reads===1?member:admin),bootstrapAdmin:confirm=>{expect(confirm).toBe(true);calls++;return new Promise(resolve=>finish=resolve);}},paint:v=>state=v});
 await c.load();await c.confirmBootstrap();c.requestBootstrap();await c.confirmBootstrap();expect(calls).toBe(0);c.closeDialog();expect(calls).toBe(0);
 c.requestBootstrap();c.checkBootstrap(true);const first=c.confirmBootstrap();await c.confirmBootstrap();c.closeDialog();expect(state.dialog).toBe('admin-bootstrap');expect(calls).toBe(1);
 finish({bootstrapped:true});await first;expect(state.Session).toEqual(admin);expect(state.dialog).toBe(null);expect(renderAccount(state)).toContain('/admin/overview');expect(renderAccount(state)).not.toContain('data-x="request-bootstrap"');
 c.requestBootstrap();await c.confirmBootstrap();expect(calls).toBe(1);
});
it('fails closed after denial or a disposed response and uses current CSRF without retry',async()=>{
 const requests=[];let version=0;const adapter=createLiveAdapter({fetch:async(path,init)=>{requests.push({path,init});return path==='/api/session'?Response.json({...member,csrf_token:'fictional-'+(++version)}):Response.json({error:{code:'CSRF_DENIED'}},{status:403});}});
 await expect(adapter.bootstrapAdmin(true)).rejects.toMatchObject({code:'SESSION_REQUIRED'});expect(requests).toHaveLength(0);
 await adapter.getSession();await adapter.getSession();await expect(adapter.bootstrapAdmin(true)).rejects.toMatchObject({code:'CSRF_DENIED'});expect(requests.at(-1).init.headers['X-CSRF-Token']).toBe('fictional-2');expect(requests.at(-1).init.body).toBe('{"confirm":true}');expect(requests.at(-1).init.credentials).toBe('same-origin');expect(requests).toHaveLength(3);
 let state;const c=createAccountController({effects:{getConfig:async()=>config,getSession:async()=>structuredClone(member),bootstrapAdmin:adapter.bootstrapAdmin},paint:v=>state=v});await c.load();c.requestBootstrap();c.checkBootstrap(true);await c.confirmBootstrap();expect(state.Session.role).toBe('member');expect(state.error.code).toBe('CSRF_DENIED');
 let finish,reads=0;const pending=createAccountController({effects:{getConfig:async()=>config,getSession:async()=>{reads++;return structuredClone(member);},bootstrapAdmin:()=>new Promise(r=>finish=r)},paint:()=>{}});await pending.load();pending.requestBootstrap();pending.checkBootstrap(true);const result=pending.confirmBootstrap();pending.dispose();finish({bootstrapped:true});await result;expect(reads).toBe(1);
});
it('registers the shared bootstrap component/dialog/action flow and missing boundaries fail coverage',()=>{
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures:createFixtureAdapter().catalog()};expect(validateCoverage(input)).toEqual([]);
 const missing=structuredClone(input.fixtures);missing.dialogs=missing.dialogs.filter(f=>f.dialogId!=='admin-bootstrap');expect(validateCoverage({...input,fixtures:missing})).toContain('dialog:admin-bootstrap:unchecked');
 const graph=buildGraph(input);expect(()=>renderFlowBoard(graph,{boardMode:'DEMO',boardRole:'all'})).not.toThrow();expect(graph.edges.some(e=>e.transitionId==='bootstrap-denied'&&e.kind==='error')).toBe(true);expect(graph.nodes.find(n=>n.id==='account-bootstrap-review').dialog.dialogId).toBe('admin-bootstrap');
});
