import {it,expect} from 'vitest';
import {createClaimController} from '../public/shared/claim-controller.js';
import {createAuthController} from '../public/shared/auth-controller.js';
import {createLiveAdapter} from '../public/effects/live-http.js';
const agent={id:'00000000-0000-4000-8000-000000000001',name:'<가상 에이전트>',status:'pending',pending_expires_at:'2026-10-04T00:00:00.000Z',credential_expires_at:null};
const session={authenticated:true,role:'member',entitlements:{can_create_private:true,can_persist_private:false},owner_ack:null,agents:[agent]};
it('keeps claim bearer out of projections and requires a new checked approval without email for an existing session',async()=>{
 let state,calls=0;const cap='fictional-claim-capability';const c=createClaimController({id:agent.id,cap,effects:{getConfig:async()=>({mode:'DEMO'}),getSession:async()=>session,getClaim:async(id,bearer)=>{expect(bearer).toBe(cap);return agent;},approveClaim:async(id,bearer)=>{calls++;expect(bearer).toBe(cap);return {...agent,status:'approved',credential_expires_at:'2026-10-30T00:00:00.000Z'};}},paint:v=>state=v});
 await c.load();expect(JSON.stringify(state)).not.toContain(cap);await c.approve();expect(calls).toBe(0);c.setChecked(true);await c.approve();expect(calls).toBe(1);expect(state.agent.status).toBe('approved');expect(state.checked).toBe(false);c.dispose();
});
it('binds anonymous claim OTP to the same claim and preserves server expiry/denial rather than approving from verified alone',async()=>{
 const cap='fictional-claim-bearer',calls=[];let state;const c=createAuthController({claim:{id:agent.id,cap},effects:{getConfig:async()=>({mode:'DEMO'}),getSession:async()=>({authenticated:false}),startAuth:async body=>{calls.push(body);return {flow:'fictional-flow',nonce:'fictional-nonce',provider_configured:true,expires_at:'2026-10-04T00:00:00.000Z'};},sendEmail:async()=>({state:'attempted',retry_after:0}),completeAuth:async body=>{calls.push(body);return {verified:true};}},paint:v=>state=v,navigate:path=>calls.push(path),newRequestId:()=> 'fictional-request'});
 await c.load('login','/rooms');await c.sendEmail('fictional@example.com');expect(calls[0]).toEqual({purpose:'claim',claim_id:agent.id,claim_token:cap});expect(JSON.stringify(state)).not.toContain(cap);await c.verify('123456');expect(calls[2]).toMatchObject({flow:'fictional-flow',nonce:'fictional-nonce',claim_id:agent.id,claim_token:cap,otp:'123456'});c.dispose();
 let vm;const denied=createClaimController({id:agent.id,cap,effects:{getConfig:async()=>({mode:'DEMO'}),getSession:async()=>session,getClaim:async()=>{throw Object.assign(Error(),{code:'CLAIM_GONE',status:410});}},paint:v=>vm=v});await denied.load();expect(vm.status).toBe('unavailable');expect(vm.error).toMatchObject({code:'CLAIM_GONE',status:410});
});
it('sends bearer and session CSRF only at the HTTP boundary and keeps them out of the public agent DTO',async()=>{
 const seen=[];const adapter=createLiveAdapter({fetch:async(path,init)=>{seen.push({path,init});return Response.json(path==='/api/session'?{...session,csrf_token:'fictional-csrf'}:{agent});}});
 await adapter.getSession();expect(await adapter.getClaim(agent.id,'fictional-cap')).toEqual(agent);expect(seen[1].init.headers.Authorization).toBe('Bearer fictional-cap');
 await adapter.approveClaim(agent.id,'fictional-cap');expect(seen[2].init.headers['X-CSRF-Token']).toBe('fictional-csrf');expect(JSON.parse(seen[2].init.body)).toEqual({risk_ack_version:'toktok-risk-v2'});
});
it('connects the signed claim header logout and preserves a failed actual session mutation',async()=>{
 let state,path,attempts=0;const c=createClaimController({id:agent.id,cap:'fictional-cap',effects:{getConfig:async()=>({mode:'DEMO'}),getSession:async()=>session,getClaim:async()=>agent,logout:async()=>{attempts++;if(attempts===1)throw Object.assign(Error(),{code:'SESSION_REQUIRED',status:401});return {logged_out:true};}},paint:v=>state=v,navigate:p=>path=p});
 await c.load();await c.logout();expect(state.Session.authenticated).toBe(true);expect(state.error.code).toBe('SESSION_REQUIRED');expect(path).toBeUndefined();await c.logout();expect(path).toBe('/rooms');
});
