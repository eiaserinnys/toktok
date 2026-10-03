// Local test entry only: fictional identities/inbox/clock; no production bypass flag.
import {DurableObject} from 'cloudflare:workers';
import {ControlPlane as Registry} from '../src/control-runtime';
import {identityRoute} from '../src/identity-http';
import {adminRoute,configResponse} from '../src/admin-http';
import {privateCreateRoute,reserveCreation} from '../src/control-create-http';
import {controlErrorResponse} from '../src/control-errors';
import {hash,newToken} from '../src/http';
import {secure,json,errorResponse,fail} from '../src/http';
import type {IdentityEnv} from '../src/identity-types';
import type {EmailDelivery} from '../src/email';
import {responseControlPort} from '../src/control-transport';
export {Room} from '../src/index';
export {Registry as ControlPlane};
export class UnconfiguredRegistry extends Registry {constructor(ctx:DurableObjectState,env:IdentityEnv){super(ctx,{...env,ADMIN_BOOTSTRAP_EMAIL:undefined});}}
let now=Date.UTC(2030,0,1),calls=0;const inbox=new Map<string,EmailDelivery>();
interface TestHostEnv extends IdentityEnv {IDENTITIES:DurableObjectNamespace;}
export default {async fetch(request:Request,env:TestHostEnv){
 const path=new URL(request.url).pathname;
 if(path==='/__control/reset'){now=Date.UTC(2030,0,1);calls=0;inbox.clear();return json({reset:true});}
 if(path==='/__control/time'){now=(await request.json() as {now:number}).now;return json({now});}
 if(path==='/__control/metrics')return json({calls});
 if(path==='/__control/code')return json({code:inbox.get(new URL(request.url).searchParams.get('email')!)?.code});
 try{
  const controlled={...env,controlPort:responseControlPort((action,input)=>env.IDENTITIES.get(env.IDENTITIES.idFromName('team')).fetch(new Request('https://control/'+action,{method:'POST',body:JSON.stringify(input)}))),IP_RATE_LIMIT:{async limit(){return {success:request.headers.get('X-Test-Edge')!=='deny'};}}};
  if(path==='/api/config')return await configResponse(controlled);
  const options={now:()=>now,trustedIP:(r:Request)=>r.headers.get('X-Test-IP')??'192.0.2.1',sendEmail:async(d:EmailDelivery)=>{calls++;inbox.set(d.to,d);}};
  if(path==='/__creation/reserve')return secure(json(await reserveCreation(request,controlled,options,{invite_hash:await hash(newToken()),read_hash:await hash(newToken()),owner_hash:await hash(newToken())}),201));
  return secure(await privateCreateRoute(request,controlled,options)??await adminRoute(request,controlled,now)??await identityRoute(request,controlled,options)??json({error:{code:'NOT_FOUND'}},404));
 }catch(e){return secure(controlErrorResponse(e));}
}};
