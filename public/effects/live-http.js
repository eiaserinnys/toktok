import {mapBudget} from './budget-projection.js';
import {invitations,audit} from '../shared/adminlogs-projection.js';
// Product-only HTTP adapter. No fixture import, storage, synthetic identity or retry loop.
export class EffectError extends Error {
 constructor(code,status=null,retryAfter=null,room_id){super(code);this.code=code;this.status=status;this.retryAfter=retryAfter;if(typeof room_id==='string')this.room_id=room_id;}
}
const invalid=kind=>{throw new EffectError('INVALID_'+kind);};
export function mapAgent(data){
 if(typeof data?.id!=='string'||typeof data.name!=='string'||!['pending','approved','revoked','expired'].includes(data.status)||typeof data.pending_expires_at!=='string'||!(data.credential_expires_at===null||typeof data.credential_expires_at==='string'))invalid('AGENT');
 return {id:data.id,name:data.name,status:data.status,pending_expires_at:data.pending_expires_at,credential_expires_at:data.credential_expires_at};
}
export function mapSession(data){
 if(typeof data?.authenticated!=='boolean'||!['anonymous','member','admin'].includes(data.role)
  ||data.authenticated===(data.role==='anonymous')
  ||typeof data.entitlements?.can_create_private!=='boolean'||typeof data.entitlements?.can_persist_private!=='boolean'
  ||!(data.owner_ack===null||(typeof data.owner_ack?.version==='string'&&Number.isFinite(data.owner_ack.confirmed_at))))invalid('SESSION');
 return {authenticated:data.authenticated,role:data.role,can_bootstrap_admin:data.authenticated&&data.role==='member'&&data.can_bootstrap_admin===true,entitlements:{
  can_create_private:data.entitlements.can_create_private,can_persist_private:data.entitlements.can_persist_private},
  owner_ack:data.owner_ack===null?null:{version:data.owner_ack.version,confirmed_at:data.owner_ack.confirmed_at},
  ...(data.authenticated&&data.agents!==undefined?{agents:Array.isArray(data.agents)?data.agents.map(mapAgent):invalid('SESSION')}:{})};
}
export function mapConfig(data){
 if(!Number.isSafeInteger(data?.revision)||!['demo','hosted'].includes(data.mode)||typeof data.enabled!=='boolean'
  ||!['closed','invite','open'].includes(data.signup)||!Array.isArray(data.public?.catalog)||!data.private)invalid('CONFIG');
 const limits={public:{},private:{}};
 for(const key of ['firstWindowSeconds','firstWindowMessages','pageSize','agentReadCadenceSeconds','browserReadCadenceSeconds']){
  if(!Number.isFinite(data.public[key]))invalid('CONFIG');limits.public[key]=data.public[key];
 }
 for(const key of ['anonymousDefaultTtlSeconds','anonymousMaxTtlSeconds','authenticatedDefaultTtlSeconds','authenticatedMaxTtlSeconds','defaultRetentionSeconds','maxRetentionSeconds']){
  if(!Number.isFinite(data.private[key]))invalid('CONFIG');limits.private[key]=data.private[key];
 }
 if(data.private.defaultPersist!==false||typeof data.private.anonymousEnabled!=='boolean')invalid('CONFIG');
 const lifetime=data.private.lifetime;if(lifetime?.version!=='member-permanent-v1'||lifetime.anonymous_seconds!==86400||lifetime.member!=='owner_close'||lifetime.member_demo_budget_exempt!==true)invalid('CONFIG');
 limits.private.lifetime={version:lifetime.version,anonymous_seconds:lifetime.anonymous_seconds,member:lifetime.member,member_demo_budget_exempt:true};
 limits.private.defaultPersist=false;limits.private.anonymousEnabled=data.private.anonymousEnabled;
 const catalog=data.public.catalog.map(room=>{
  if(typeof room.slug!=='string'||typeof room.title!=='string'||room.enabled!==true)invalid('CONFIG');
  return {slug:room.slug,title:room.title};
 });
 return {revision:data.revision,mode:data.mode==='demo'?'DEMO':'HOSTED',enabled:data.enabled,signup:data.signup,catalog,limits};
}
function settingsEffects(schema,path='',out={}){
 if(schema?.applyTo)out[path]=schema.applyTo;
 if(schema?.fields)for(const [key,field] of Object.entries(schema.fields))settingsEffects(field,path?path+'.'+key:key,out);
 if(schema?.items)settingsEffects(schema.items,path+'[]',out);
 return out;
}
export function createLiveAdapter({fetch:fetchHTTP=globalThis.fetch}={}){
 let csrf=null,sessionGeneration=0;
 async function request(path,{method='GET',body,sessionMutation=false,capability}={}){
  if(sessionMutation&&!csrf)throw new EffectError('SESSION_REQUIRED',401);
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(sessionMutation)headers['X-CSRF-Token']=csrf;
  if(capability!==undefined)headers.Authorization='Bearer '+capability;
  const response=await fetchHTTP(path,{method,credentials:'same-origin',cache:'no-store',headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await response.json();}catch{throw new EffectError('INVALID_RESPONSE',response.status);}
  if(!response.ok)throw new EffectError(data.error?.code??'HTTP_ERROR',response.status,response.headers.get('Retry-After'),data.room_id);
  return data;
 }
 return Object.freeze({
  publicConnection:(slug,body)=>{if(!/^[a-z0-9-]+$/.test(slug))invalid('ROOM');return request('/api/public/rooms/'+slug+'/connection-approval',{method:'POST',body});},
  getCreationOptions:async()=>{
   const own=++sessionGeneration;csrf=null;const data=await request('/api/private/create-options'),Session=mapSession(data.session),Config=mapConfig(data.config);
   if(Session.authenticated&&typeof data.session.csrf_token!=='string')invalid('SESSION');
   if(own===sessionGeneration)csrf=Session.authenticated?data.session.csrf_token:null;
   return {Session,Config};
  },
  getConfig:async()=>mapConfig(await request('/api/config')),
  getSession:async()=>{
   const own=++sessionGeneration;csrf=null;const data=await request('/api/session');
   const session=mapSession(data);
   if(session.authenticated&&typeof data.csrf_token!=='string')invalid('SESSION');
   if(own===sessionGeneration)csrf=session.authenticated?data.csrf_token:null;return session;
  },
  validateInvitation:code=>request('/api/auth/invitations/validate',{method:'POST',body:{code}}),
  startAuth:({purpose,invite_validation_id,claim_id,claim_token})=>request('/api/auth/start',{method:'POST',body:{purpose,
   ...(invite_validation_id===undefined?{}:{invitation_validation_id:invite_validation_id}),
   ...(claim_id===undefined?{}:{claim_id,claim_token})}}),
  sendEmail:({flow,email,client_request_id})=>request('/api/auth/email/send',{method:'POST',body:{flow_id:flow,email,client_request_id}}),
  completeAuth:({flow,nonce,otp,claim_id,claim_token})=>request('/api/auth/complete',{method:'POST',body:{flow,nonce,otp,
   ...(claim_id===undefined?{}:{claim_id,claim_token})}}),
  getAdminSettings:async()=>{
   const data=await request('/api/admin/settings'),schema=await request('/api/admin/settings/schema');
   if(!Number.isSafeInteger(data.revision)||!data.settings||!schema.schema)invalid('ADMIN_SETTINGS');
   return {revision:data.revision,settings:data.settings,schema:schema.schema,effects:settingsEffects(schema.schema)};
  },
  bootstrapAdmin:confirm=>{if(confirm!==true)invalid('BOOTSTRAP_CONFIRMATION');return request('/api/admin/bootstrap',{method:'POST',sessionMutation:true,body:{confirm:true}});},
  getClaim:async(id,cap)=>mapAgent((await request('/api/claims/'+encodeURIComponent(id),{capability:cap})).agent),
  approveClaim:async(id,cap)=>mapAgent((await request('/api/claims/'+encodeURIComponent(id)+'/approve',{method:'POST',sessionMutation:true,capability:cap,body:{risk_ack_version:'toktok-risk-v2'}})).agent),
  revokeAgent:async id=>mapAgent((await request('/api/agents/'+encodeURIComponent(id)+'/revoke',{method:'POST',sessionMutation:true,body:{}})).agent),
  getBudget:async()=>mapBudget(await request('/api/admin/budget')),
  getInvitations:async()=>invitations(await request('/api/admin/invitations')),
  getAudit:async()=>audit(await request('/api/admin/audit')),
  saveSettings:({revision,settings})=>request('/api/admin/settings',{method:'PUT',sessionMutation:true,body:{expected_revision:revision,settings}}),
  createInvitation:ttl_seconds=>request('/api/admin/invitations',{method:'POST',sessionMutation:true,body:ttl_seconds===undefined?{}:{ttl_seconds}}),
  revokeInvitation:id=>request('/api/admin/invitations/'+encodeURIComponent(id)+'/revoke',{method:'POST',sessionMutation:true,body:{}}),
  logout:async()=>{const result=await request('/api/auth/logout',{method:'POST',sessionMutation:true,body:{}});sessionGeneration++;csrf=null;return result;},
  createContext:()=>request('/api/private/create-context',{method:'POST',sessionMutation:!!csrf,body:{}}),
  creationGrant:({nonce,risk_ack})=>request('/api/private/create-grants',{method:'POST',sessionMutation:!!csrf,
   body:{nonce,risk_ack,risk_ack_version:'toktok-risk-v2'}}),
  // The response contains one-time owner material; controllers must never put it in a normal ViewModel/DOM.
  createRoom:({purpose,ttl_seconds,persist,retention_seconds,client_request_id,creation_grant})=>request('/api/v1/rooms',{
   method:'POST',sessionMutation:!!csrf,body:{purpose,ttl_seconds,persist,client_request_id,creation_grant,
    ...(persist?{retention_seconds}:{})}})
 });
}
