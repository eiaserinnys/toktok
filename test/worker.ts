// Local tests only: simulated inbox/clock never enter the production entry/bundle.
import {makeWorker} from '../src/index';
import {normalizeIP,type EmailDelivery} from '../src/email';
import type {Env} from '../src/contracts';
export {Room,IdentityRegistry} from '../src/index';
const inbox=new Map<string,EmailDelivery>();let calls=0;let clock:number|undefined;let failure=false;
const worker=makeWorker({trustedIP:r=>normalizeIP(r.headers.get('CF-Connecting-IP')??'192.0.2.254'),now:()=>clock??Date.now(),sendEmail:async delivery=>{calls++;inbox.set(delivery.to,delivery);if(failure)throw Error('fixture delivery outcome');}});
export default {
 async fetch(request:Request,env:Env){
  const path=new URL(request.url).pathname;
  if(path==='/__fixture/inbox')return Response.json({delivery:inbox.get(new URL(request.url).searchParams.get('email')??''),calls});
  if(path==='/__fixture/control'&&request.method==='POST'){
   const input=await request.json() as {now?:number;failure?:boolean;reset?:boolean};
   if(input.reset){inbox.clear();calls=0;clock=undefined;failure=false;}
   if(input.now!==undefined)clock=input.now;if(input.failure!==undefined)failure=input.failure;return Response.json({calls});
  }
  return worker.fetch(request,env);
 }
};
