import {env as workerEnv} from 'cloudflare:workers';
const env=workerEnv as unknown as {IDENTITIES:DurableObjectNamespace};
import {runInDurableObject} from 'cloudflare:test';
import {ControlCore} from '../src/control-core';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {C,save,read,digest,type Tx} from '../src/control-records';
import {identityRoute,creatorAuthorization} from '../src/identity-http';
import {adminRoute,configResponse} from '../src/admin-http';
import {privateCreateRoute} from '../src/control-create-http';
import {controlErrorResponse,CreationResultError} from '../src/control-errors';
import {HttpError,json,secure,hash,newToken} from '../src/http';
import {normalizeIP,type IdentityOptions,type EmailDelivery} from '../src/email';
import type {IdentityEnv,RegistryInput,ControlHttpPort} from '../src/identity-types';
import {SettingsStore} from '../src/settings-store';
export const origin='http://localhost:8787';
export const stub=():DurableObjectStub=>env.IDENTITIES.get(env.IDENTITIES.idFromName('team'));
export async function reset(){await runInDurableObject(stub(),async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();await new CloudflareRepository(state.storage).apply();});}
export const records=<T>(fn:(tx:Tx)=>Promise<T>)=>runInDurableObject(stub(),(_i,state)=>new CloudflareRepository(state.storage).transaction('control',fn));
/** The domain alarm path with explicit fixture time; rejected HTTP transactions roll back cleanup. */
export const maintain=(now:number)=>runInDurableObject(stub(),(_i,state)=>new ControlCore(new CloudflareRepository(state.storage)).maintain(now));
type Result={ok:true;value:unknown}|{ok:false;status:number;code:string;message:string;retryAfter?:number;room_id?:string};
export function fixturePort(now:()=>number):ControlHttpPort {return {async execute(action,input){
 const result=await runInDurableObject<DurableObject,Result>(stub(),async(_i,state)=>{try{return {ok:true,value:await new ControlCore(new CloudflareRepository(state.storage)).execute(action,{...input,now:now()})};}catch(e){const error=e as HttpError&{room_id?:string};return {ok:false,status:error.status??500,code:error.code??'FIXTURE_FAILURE',message:error.status?'요청을 처리하지 못했습니다.':'fixture host failed',retryAfter:error.retryAfter,room_id:error.room_id};}});
 if(result.ok)return result.value;
 if(result.room_id&&['CREATE_PENDING','CREATE_RESULT_NOT_RECOVERABLE'].includes(result.code))throw new CreationResultError(result.code as 'CREATE_PENDING'|'CREATE_RESULT_NOT_RECOVERABLE',result.message,result.room_id);
 throw new HttpError(result.status,result.code,result.message,result.retryAfter);
 }};}
/** Same production handlers; data/provider/IP adapters only are replaced. No root Worker or DO shim. */
export function authHost(options:IdentityOptions={}){return {async fetch(request:Request,local:IdentityEnv){try{
 const path=new URL(request.url).pathname;
 if(path==='/api/config')return secure(await configResponse(local));
 return secure(await identityRoute(request,local,options)??await adminRoute(request,local,options.now?.())??await privateCreateRoute(request,local,options)??json({error:{code:'NOT_FOUND'}},404));
 }catch(e){return secure(controlErrorResponse(e));}}};}
export async function seedMember(email:string,eligible=true){await records(async tx=>{const s=new SettingsStore(tx);await s.init(Date.UTC(2030,0,1));const id=crypto.randomUUID();await save(tx,C.accounts,'a:'+id,{id,provider:'email-otp',subject:email,email,email_verified:1,role:'member',admission_kind:'invited',can_create_private:eligible?1:0,can_persist_private:eligible?1:0});await save(tx,C.accounts,'email:'+await digest(tx,'account-email',email),{id});});}
export interface Flow {flow:string;nonce:string;cookie:string;claim?:{agent_id:string;claim_token:string};}
export function harness(){
 let now=Date.UTC(2030,0,1),calls=0,failure=false,hold:Promise<void>|undefined;const deliveries:EmailDelivery[]=[];
 const options:IdentityOptions={now:()=>now,trustedIP:r=>normalizeIP(r.headers.get('CF-Connecting-IP')??'192.0.2.1'),sendEmail:async d=>{calls++;deliveries.push(d);if(hold)await hold;if(failure)throw Error('simulated unknown outcome');}};
 const worker=authHost(options),localEnv:IdentityEnv={PUBLIC_ORIGIN:origin,controlPort:fixturePort(()=>now),IP_RATE_LIMIT:{async limit(){return {success:true};}}};
 const raw:{path:string;status:number;code?:string;retry_after:string|null}[]=[];
 const call=async(path:string,data?:unknown,headers:Record<string,string>={},override=localEnv,method?:string)=>{
  const response=await worker.fetch(new Request(origin+path,{method:method??(data===undefined?'GET':'POST'),headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)}),override);
  let code:string|undefined;if(response.headers.get('Content-Type')?.includes('json'))code=(await response.clone().json() as {error?:{code:string}}).error?.code;
  raw.push({path:path.replace(/[a-f0-9-]{36}/g,'<id>'),status:response.status,code,retry_after:response.headers.get('Retry-After')});return response;
 };
 const cookie=(r:Response)=>r.headers.get('Set-Cookie')?.split(';')[0];
 async function begin(claim?:Flow['claim']):Promise<Flow>{const r=await call('/api/auth/start',{purpose:claim?'claim':'login',...(claim?{claim_id:claim.agent_id,claim_token:claim.claim_token}:{})},{Origin:origin});if(r.status!==200)throw Error('setup flow failed: '+r.status);return {...await r.json() as {flow:string;nonce:string},cookie:cookie(r)!,claim};}
 const send=(f:Flow,email='allowed@fixture.example',id=crypto.randomUUID(),ip='192.0.2.1')=>call('/api/auth/email/send',{flow_id:f.flow,email,client_request_id:id},{Origin:origin,Cookie:f.cookie,'CF-Connecting-IP':ip});
 const complete=(f:Flow,otp:string,headers:Record<string,string>={})=>call('/api/auth/complete',{flow:f.flow,nonce:f.nonce,...(f.claim?{claim_id:f.claim.agent_id,claim_token:f.claim.claim_token}:{}),otp},{Origin:origin,Cookie:f.cookie,...headers});
 return {call,begin,send,complete,worker,options,raw,deliveries,localEnv,cookie,get calls(){return calls;},get now(){return now;},advance:(ms:number)=>{now+=ms;},time:(ms:number)=>{now=ms;},fail:()=>{failure=true;},hold:(p:Promise<void>)=>{hold=p;},creator:(request:Request)=>creatorAuthorization(request,localEnv)};
}
export {C,save,read,hash,newToken,SettingsStore};
