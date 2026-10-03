// Local Workers pool only: same root HTTP application and real three actor namespaces.
import {createHttpApplication} from '../src/application';
import {cfControl,type CloudflareHostEnv} from '../src/cloudflare-host';
import {normalizeIP,type EmailDelivery} from '../src/email';
import {json} from '../src/http';
export {ControlPlane,PublicRoom,PrivateRoom} from '../src/cloudflare-host';
const inbox=new Map<string,EmailDelivery>();let calls=0,edgeSuccess=true,edgeCalls=0,controlCalls=0,assetCalls=0;
const applications=new WeakMap<object,ReturnType<typeof createHttpApplication>>();
export default {async fetch(request:Request,env:CloudflareHostEnv){
 const path=new URL(request.url).pathname;
 // Fixture IO only; no product domain implementation, remote binding or real sender.
 if(path==='/__application/reset'){inbox.clear();calls=0;edgeSuccess=true;edgeCalls=0;controlCalls=0;assetCalls=0;applications.delete(env);return json({reset:true});}
 if(path==='/__application/metrics')return json({calls,edge_calls:edgeCalls,control_calls:controlCalls,asset_calls:assetCalls});
 if(path==='/__application/edge'){const input=await request.json() as {success:boolean};edgeSuccess=input.success===true;return json({controlled:true});}
 if(path==='/__application/code')return json({code:inbox.get(new URL(request.url).searchParams.get('email')!)?.code});
 let app=applications.get(env);if(!app){const control=cfControl(env);app=createHttpApplication({
  origin:env.PUBLIC_ORIGIN,assets:{fetch:r=>{assetCalls++;return env.ASSETS.fetch(r);}},control:{execute:(action,input)=>{controlCalls++;return control.execute(action,input);}},edgeLimit:{async limit(){edgeCalls++;return {success:edgeSuccess};}},
  trustedIP:r=>normalizeIP(r.headers.get('X-Fixture-IP')??'192.0.2.1'),
  publicRoom:async(slug,config)=>{const room=env.PUBLIC_ROOMS.getByName(slug);await room.applyConfiguration(config);return room;},
  privateRoom:id=>env.PRIVATE_ROOMS.getByName(id),ready:()=>true,
  auth:{sendEmail:async delivery=>{calls++;inbox.set(delivery.to,delivery);}}
 });applications.set(env,app);}return app.fetch(request);
}};
