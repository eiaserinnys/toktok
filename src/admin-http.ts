import type {IdentityEnv,RegistryInput} from './identity-types';
import {registry,sessionInput,agentId} from './identity-http';
import {body,newToken,hash,json,queryInt,secure} from './http';
/** Server role gate shared by API and the future admin HTML/QA dispatcher. */
export async function requireAdmin(request:Request,env:IdentityEnv,now=Date.now()){
 return registry(env,'admin-settings',{...await sessionInput(request,env),now});
}
export async function adminRoute(request:Request,env:IdentityEnv,now=Date.now()):Promise<Response|undefined>{
 const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/admin/'))return;
 const mutation=request.method!=='GET',input:RegistryInput={...await sessionInput(request,env,mutation),now};
 let action:string|undefined,result:unknown;
 if(path==='/api/admin/bootstrap'&&request.method==='POST'){const b=await body(request,['confirm']);input.confirm=b.confirm as boolean;action='admin-bootstrap';}
 if(path==='/api/admin/settings'){
  if(request.method==='GET')action='admin-settings';
  if(request.method==='PUT'){const b=await body(request,['expected_revision','settings']);input.expected_revision=b.expected_revision;input.settings=b.settings;action='admin-settings-update';}
 }
 if(path==='/api/admin/settings/schema'&&request.method==='GET')action='admin-schema';
 if(path==='/api/admin/audit'&&request.method==='GET'){action='admin-audit';input.limit=queryInt(url,'limit',50,1,50);}
 if(path==='/api/admin/invitations'){
  if(request.method==='GET'){action='admin-invitations';input.limit=queryInt(url,'limit',50,1,50);}
  if(request.method==='POST'){
   const b=await body(request,['ttl_seconds']),token=newToken();input.id=crypto.randomUUID();input.token_hash=await hash(token);input.ttl_seconds=b.ttl_seconds as number|undefined;
   result={...await registry<object>(env,'admin-invitation-create',input),code:token};return secure(json(result,201));
  }
 }
 const revoke=/^\/api\/admin\/invitations\/([^/]+)\/revoke$/.exec(path);
 if(revoke&&request.method==='POST'){await body(request,[]);input.id=agentId(revoke[1]);action='admin-invitation-revoke';}
 if(action)return secure(json(await registry(env,action,input)));
}
export async function configResponse(env:IdentityEnv){return secure(json(await registry(env,'config',{})));}
