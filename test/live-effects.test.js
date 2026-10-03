import {it,expect} from 'vitest';
import {createLiveAdapter,mapSession,mapConfig} from '../public/effects/live-http.js';
import {loadResource} from '../public/shared/effect-interface.js';
const anonymous={authenticated:false,role:'anonymous',entitlements:{can_create_private:false,can_persist_private:false},csrf_token:null,owner_ack:null};
const member={...anonymous,authenticated:true,role:'member',csrf_token:'fictional-csrf'};
it('projects server identity without secrets, query roles or account-derived entitlements',()=>{
 expect(mapSession({...anonymous,fixtureRole:'admin',email:'fictional@example.com',sessionsecret:'fictional'})).toEqual({authenticated:false,role:'anonymous',entitlements:anonymous.entitlements,owner_ack:null});
 expect(mapSession(member).entitlements.can_persist_private).toBe(false);
 expect(()=>mapSession({...anonymous,role:'admin'})).toThrow('INVALID_SESSION');
});
it('preserves pending/lost room identifiers and Retry-After without retrying creation',async()=>{
 for(const code of ['CREATE_PENDING','CREATE_RESULT_NOT_RECOVERABLE']){
  let calls=0;const adapter=createLiveAdapter({fetch:async()=>{calls++;return Response.json({error:{code,message:'가상 생성 응답'},room_id:'00000000-0000-4000-8000-000000000001'},{status:409,headers:{'Retry-After':'2'}});}});
  await expect(adapter.createRoom({purpose:'가상 방',client_request_id:'same-request',persist:false})).rejects.toMatchObject({code,status:409,retryAfter:'2',room_id:'00000000-0000-4000-8000-000000000001'});
  expect(calls).toBe(1);
 }
});
it('maps server limits and catalog without a count/default/30-day fallback',()=>{
 const priv={anonymousDefaultTtlSeconds:3600,anonymousMaxTtlSeconds:86400,authenticatedDefaultTtlSeconds:86400,authenticatedMaxTtlSeconds:604800,defaultRetentionSeconds:86400,maxRetentionSeconds:604800,defaultPersist:false,anonymousEnabled:false};
 const projection=mapConfig({revision:4,mode:'demo',enabled:false,signup:'invite',public:{catalog:[],firstWindowSeconds:70,firstWindowMessages:20,pageSize:3,agentReadCadenceSeconds:11,browserReadCadenceSeconds:4},private:priv});
 expect(projection.catalog).toEqual([]);expect(projection.limits.private).toEqual(priv);expect(projection.limits.public.pageSize).toBe(3);
 expect(projection.limits.public.firstWindowMessages).toBe(20);
 expect(()=>mapConfig({revision:4,mode:'demo',enabled:false,signup:'invite',public:{catalog:[],firstWindowSeconds:70,pageSize:3,agentReadCadenceSeconds:11,browserReadCadenceSeconds:4},private:priv})).toThrow('INVALID_CONFIG');
 expect(()=>mapConfig({revision:4,mode:'demo'})).toThrow('INVALID_CONFIG');
});
it('maps invitation/start/send/complete field names explicitly and keeps same-origin cookies',async()=>{
 const calls=[];const adapter=createLiveAdapter({fetch:async(path,options)=>{calls.push({path,options});return Response.json({verified:true});}});
 await adapter.startAuth({purpose:'signup',invite_validation_id:'fictional-validation'});
 await adapter.sendEmail({flow:'fictional-flow',email:'fictional@example.com',client_request_id:'fictional-request'});
 await adapter.completeAuth({flow:'fictional-flow',nonce:'fictional-nonce',otp:'123456'});
 expect(JSON.parse(calls[0].options.body)).toEqual({purpose:'signup',invitation_validation_id:'fictional-validation'});
 expect(JSON.parse(calls[1].options.body).flow_id).toBe('fictional-flow');
 expect(JSON.parse(calls[2].options.body).flow).toBe('fictional-flow');
 expect(calls.every(c=>c.options.credentials==='same-origin'&&c.options.cache==='no-store')).toBe(true);
});
it('retains 401/403/429 as unavailable without mock success or automatic resend',async()=>{
 for(const status of [401,403,429]){
  let calls=0;const observed=[];
  const adapter=createLiveAdapter({fetch:async()=>{calls++;return Response.json({error:{code:'SERVER_DENIED'}},{status,headers:{'Retry-After':'120'}});}});
  const result=await loadResource(()=>adapter.getSession(),state=>observed.push(state));
  expect(result).toEqual({status:'unavailable',value:null,error:{code:'SERVER_DENIED',status,retryAfter:'120'}});
  expect(observed[0].status).toBe('loading');expect(calls).toBe(1);
 }
});
it('keeps CSRF in adapter memory and prevents mutations before a server session',async()=>{
 const calls=[];const adapter=createLiveAdapter({fetch:async(path,options)=>{calls.push({path,options});return Response.json(path==='/api/session'?member:{logged_out:true});}});
 await expect(adapter.createInvitation()).rejects.toThrow('SESSION_REQUIRED');expect(calls).toHaveLength(0);
 const session=await adapter.getSession();expect(session).not.toHaveProperty('csrf_token');
 await adapter.saveSettings({revision:9,settings:{fictional:true}});
 expect(calls[1].options.headers['X-CSRF-Token']).toBe('fictional-csrf');
 expect(JSON.parse(calls[1].options.body).expected_revision).toBe(9);
 await adapter.logout();await expect(adapter.createInvitation()).rejects.toThrow('SESSION_REQUIRED');
});
it('uses separate browser context/grant and the new private creation payload for anonymous users',async()=>{
 const calls=[];const adapter=createLiveAdapter({fetch:async(path,options)=>{calls.push({path,options});return Response.json({fixture:true});}});
 await adapter.createContext();
 await adapter.creationGrant({nonce:'fictional-nonce',risk_ack:true});
 await adapter.createRoom({purpose:'가상 방',ttl_seconds:3600,persist:false,retention_seconds:99,client_request_id:'stable-request',creation_grant:'fictional-grant',role:'admin'});
 expect(calls.map(c=>c.path)).toEqual(['/api/private/create-context','/api/private/create-grants','/api/v1/rooms']);
 expect(JSON.parse(calls[1].options.body)).toEqual({nonce:'fictional-nonce',risk_ack:true,risk_ack_version:'toktok-risk-v2'});
 expect(JSON.parse(calls[2].options.body)).toEqual({purpose:'가상 방',ttl_seconds:3600,persist:false,client_request_id:'stable-request',creation_grant:'fictional-grant'});
 expect(calls.every(c=>c.options.credentials==='same-origin')).toBe(true);
});
