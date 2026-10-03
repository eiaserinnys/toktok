// Local test entry only: fictional identities/inbox/clock; no production bypass flag.
import {DurableObject} from 'cloudflare:workers';
import {IdentityRegistry as Registry} from '../src/identity-registry';
import {identityRoute} from '../src/identity-http';
import {adminRoute,configResponse} from '../src/admin-http';
import {secure,json,errorResponse,fail} from '../src/http';
import type {IdentityEnv} from '../src/identity-types';
import type {EmailDelivery} from '../src/email';
export {Room} from '../src/index';
export {Registry as IdentityRegistry};
export class UnconfiguredRegistry extends Registry {constructor(ctx:DurableObjectState,env:IdentityEnv){super(ctx,{...env,ADMIN_BOOTSTRAP_EMAIL:undefined});}}
let now=Date.UTC(2030,0,1),calls=0;const inbox=new Map<string,EmailDelivery>();
export default {async fetch(request:Request,env:IdentityEnv){
 const path=new URL(request.url).pathname;
 if(path==='/__control/reset'){now=Date.UTC(2030,0,1);calls=0;inbox.clear();return json({reset:true});}
 if(path==='/__control/time'){now=(await request.json() as {now:number}).now;return json({now});}
 if(path==='/__control/metrics')return json({calls});
 if(path==='/__control/code')return json({code:inbox.get(new URL(request.url).searchParams.get('email')!)?.code});
 try{
  if(path==='/api/config')return await configResponse(env);
  const controlled={...env,IP_RATE_LIMIT:{async limit(){return {success:request.headers.get('X-Test-Edge')!=='deny'};}}};
  return secure(await adminRoute(request,controlled,now)??await identityRoute(request,controlled,{now:()=>now,trustedIP:()=> '192.0.2.1',sendEmail:async d=>{calls++;inbox.set(d.to,d);}})??json({error:{code:'NOT_FOUND'}},404));
 }catch(e){return secure(errorResponse(e));}
}};
