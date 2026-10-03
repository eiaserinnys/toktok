import {it,expect} from 'vitest';
import {createAccountController} from '../public/shared/account-controller.js';
import {renderAccount} from '../public/shared/screens/account.js';
import {createLiveAdapter} from '../public/effects/live-http.js';
const agent={id:'00000000-0000-4000-8000-000000000001',name:'<가상 에이전트>',status:'approved',pending_expires_at:'2026-10-04T00:00:00.000Z',credential_expires_at:'2026-11-01T00:00:00.000Z'};
const session={authenticated:true,role:'member',entitlements:{can_create_private:true,can_persist_private:false},owner_ack:null,agents:[agent]};
const config={mode:'DEMO',signup:'invite',limits:{private:{defaultPersist:false}}};
it('uses own server agents without exposing email/owner/token fields or inventing an unavailable list',async()=>{
 const adapter=createLiveAdapter({fetch:async()=>Response.json({...session,csrf_token:'fictional-csrf',agents:[{...agent,email:'private@example.com',owner_id:'fictional-owner',token_hash:'fictional-fingerprint'}]})});
 const mapped=await adapter.getSession();expect(mapped.agents).toEqual([agent]);expect(mapped).not.toHaveProperty('csrf_token');
 const html=renderAccount({status:'ready',Session:mapped,Config:config});expect(html).toContain('&lt;가상 에이전트&gt;');expect(html).not.toContain('private@example.com');expect(html).not.toContain('fictional-owner');
 let state;const c=createAccountController({effects:{getConfig:async()=>config,getSession:async()=>({...session,agents:undefined})},paint:v=>state=v});await c.load();expect(state.status).toBe('unavailable');expect(renderAccount(state)).not.toContain('연결한 에이전트가 없어요');
});
it('requires explicit revoke confirmation and sends a single actual mutation while pending',async()=>{
 let state,finish;const calls=[];const c=createAccountController({effects:{getConfig:async()=>config,getSession:async()=>structuredClone(session),revokeAgent:id=>{calls.push(id);return new Promise(r=>finish=r);}},paint:v=>state=v});
 await c.load();c.requestRevoke(agent.id);expect(state.dialog).toBe('agent-revoke');expect(calls).toEqual([]);c.closeDialog();expect(calls).toEqual([]);
 c.requestRevoke(agent.id);const pending=c.confirmRevoke();await c.confirmRevoke();expect(calls).toEqual([agent.id]);finish({...agent,status:'revoked'});await pending;expect(state.Session.agents[0].status).toBe('revoked');expect(state.dialog).toBe(null);
});
it('binds revocation to the actual session CSRF and preserves server denial without changing the list',async()=>{
 const requests=[];const adapter=createLiveAdapter({fetch:async(path,init)=>{requests.push({path,init});return path==='/api/session'?Response.json({...session,csrf_token:'fictional-csrf'}):Response.json({error:{code:'ADMISSION_DENIED'}},{status:403});}});
 await adapter.getSession();await expect(adapter.revokeAgent(agent.id)).rejects.toMatchObject({code:'ADMISSION_DENIED',status:403});
 expect(requests[1].init.headers['X-CSRF-Token']).toBe('fictional-csrf');expect(requests[1].init.credentials).toBe('same-origin');expect(requests[1].init.body).toBe('{}');
 let state;const c=createAccountController({effects:{getConfig:async()=>config,getSession:async()=>structuredClone(session),revokeAgent:adapter.revokeAgent},paint:v=>state=v});await c.load();c.requestRevoke(agent.id);await c.confirmRevoke();expect(state.Session.agents[0].status).toBe('approved');expect(state.dialog).toBe('agent-revoke');expect(state.error.code).toBe('ADMISSION_DENIED');
});
