import type {ControlHttpPort,IdentityEnv} from './identity-types';
import type {IdentityOptions} from './email';
import type {RuntimeConfig} from './control-contracts';
import type {PrivateRoomInit} from './private-contracts';
import type {PublicRoomEndpoint} from './public-contracts';
import {identityRoute,sessionInput} from './identity-http';
import {adminRoute,configResponse,requireAdmin} from './admin-http';
import {privateCreateRoute,reserveCreation,commitSlot} from './control-create-http';
import {controlErrorResponse,CreationResultError} from './control-errors';
import {handlePublicBrowserWith} from './public-browser';
import {handlePublicRequestWith,cancelUnusedRequestBody} from './public-http';
import {secureRouteResponse} from './response-security';
import {designSurface,isPublicAsset,type AssetPort} from './site-assets';
import {RuntimeSettings,publicPolicy,publicCatalog,requireRuntime} from './runtime-config';
import {controlBudget} from './host-budget';
import {HttpError,fail,json,hash,newToken,publicOrigin} from './http';

export interface PrivateEndpoint {
 initialize(input:PrivateRoomInit):Promise<object>;
 fetch(request:Request):Promise<Response>;
 inspect(id?:string):Promise<object>;
}
export interface ApplicationPorts {
 origin:string;assets:AssetPort;control:ControlHttpPort;
 edgeLimit:IdentityEnv['IP_RATE_LIMIT'];trustedIP:(request:Request)=>string;
 publicRoom:(slug:string,config:RuntimeConfig)=>Promise<PublicRoomEndpoint>;
 publicRoomExists?:(slug:string,config:RuntimeConfig)=>Promise<boolean>;
 privateRoom:(id:string)=>PrivateEndpoint;
 identity?:Pick<IdentityEnv,'EMAIL'|'EMAIL_FROM'>;
 auth?:Pick<IdentityOptions,'sendEmail'|'now'>;
 ready:()=>boolean;
}
const roomId='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const privateApi=new RegExp(`^/api/v1/rooms/(${roomId})(?:/(participants|messages|wait|close))?$`);
const privateEntry=new RegExp(`^/r/(${roomId})/[\\w-]{43}$`);
export const productHtmlPaths=Object.freeze(['/','/about','/rooms','/guide','/login','/signup','/invite','/verify','/account','/new-room']);
const recoveryAdminHtmlPaths=Object.freeze(['/admin','/admin/overview','/admin/public','/admin/private','/admin/budget','/admin/identity','/admin/signup','/admin/deployment']);
export const adminHtmlPaths=Object.freeze([...recoveryAdminHtmlPaths]);
const htmlRoutes=new Set(productHtmlPaths);
const recoveryReads=new Set([...recoveryAdminHtmlPaths,'/api/session','/api/admin/settings','/api/admin/settings/schema','/api/admin/budget']);
const recoveryAllowed=(request:Request)=>{const path=new URL(request.url).pathname;return request.method==='GET'&&recoveryReads.has(path)||request.method==='PUT'&&path==='/api/admin/settings'||request.method==='POST'&&path==='/api/auth/logout';};
const wantsHtml=(r:Request)=>r.method==='GET'&&new URL(r.url).searchParams.get('format')!=='md'&&(r.headers.get('Accept')??'').includes('text/html');

/** One HTTP application for CF and Node. Ports contain platform IO only. */
export function createHttpApplication(ports:ApplicationPorts){
 const origin=publicOrigin(ports.origin),settings=new RuntimeSettings(ports.control);
 const budget=controlBudget(ports.control,ports.auth?.now);
 const env:IdentityEnv={PUBLIC_ORIGIN:origin,IP_RATE_LIMIT:ports.edgeLimit,controlPort:ports.control,...ports.identity};
 let handlers=0,bodies=0;
 const recovery=new WeakMap<Request,number>();
 async function reserveHttp(request:Request,kind:'admission_requests'|'response_bytes',amount:number){
  if(!recovery.has(request)){
   try{await budget.reserve(budget.newOperationId(),kind,amount);return;}
   catch(error){
    if(!(error instanceof HttpError)||error.status!==429||!['BUDGET_EXCEEDED','ESTIMATED_BUDGET_EXCEEDED'].includes(error.code)||!recoveryAllowed(request))throw error;
    const mutation=request.method!=='GET',input=await sessionInput(request,env,mutation);
    const result=await ports.control.execute('admin-recovery-reserve',{...input,mutation,operation_id:budget.newOperationId(),now:ports.auth?.now?.()??Date.now()}) as {response_bytes_limit?:unknown};
    if(result.response_bytes_limit!==65536)fail(503,'CONTROL_STATE_INVALID','복구 응답 한도를 확인하지 못했습니다.');
    recovery.set(request,65536);
   }
  }
  if(kind==='response_bytes'&&amount>recovery.get(request)!)fail(503,'ADMIN_RECOVERY_RESPONSE_LIMIT','복구 응답 한도를 초과했습니다.');
 }
 async function html(request:Request,failure?:Response){
  const asset=await ports.assets.fetch(new Request(new URL('/index.html',origin)));
  if(!failure)return asset;
  const data=await failure.json() as {error?:{code?:string}};
  const code=/^[A-Z0-9_]+$/.test(data.error?.code??'')?data.error!.code!:'REQUEST_FAILED';
  return new Response((await asset.text()).replace('<body',`<body data-error="${code}"`),{status:failure.status,headers:asset.headers});
 }
 async function authorize(request:Request){
  try{await sessionInput(request,env);await reserveHttp(request,'admission_requests',1);await requireAdmin(request,env);return {authorized:true} as const;}
  catch(error){if(error instanceof HttpError&&(error.status===401||error.status===403))return {authorized:false,status:error.status} as const;throw error;}
 }
 async function responseBudget(response:Response,request:Request){
  let bytes:ArrayBuffer;
  if(recovery.has(request)&&response.body){
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>recovery.get(request)!){void reader.cancel().catch(()=>{});fail(503,'ADMIN_RECOVERY_RESPONSE_LIMIT','복구 응답 한도를 초과했습니다.');}chunks.push(value);}const joined=new Uint8Array(size);let at=0;for(const chunk of chunks){joined.set(chunk,at);at+=chunk.length;}bytes=joined.buffer;}finally{reader.releaseLock();}
  }else bytes=await response.arrayBuffer();
  if(bytes.byteLength)await reserveHttp(request,'response_bytes',bytes.byteLength);
  return new Response(response.status===204||response.status===304?null:bytes,response);
 }
 async function boundedControlBody(request:Request):Promise<Request>{
  if(!request.body)return request;
  if(bodies>=16)throw new HttpError(429,'RATE_LIMITED','본문 처리 한도를 초과했습니다.',1);
  bodies++;const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new HttpError(408,'BODY_TIMEOUT','본문 읽기 시간이 초과되었습니다.'));},5000);});
   let size=0;const chunks:Uint8Array[]=[];
   for(;;){const item=await Promise.race([reader.read(),deadline]);if(item.done)break;size+=item.value.byteLength;if(size>32768){void reader.cancel().catch(()=>{});fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 32KiB입니다.');}chunks.push(item.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   return new Request(request,{body:bytes});
  }finally{clearTimeout(timer);reader.releaseLock();bodies--;}
 }
 async function route(original:Request):Promise<Response>{
  const url=new URL(original.url),path=url.pathname;
  if(path==='/health'&&original.method==='GET')return json({status:'alive'});
  if(path==='/ready'&&original.method==='GET'){
   if(!ports.ready())return json({status:'unavailable'},503);
   const c=await settings.get();return json({status:c.readiness.budget_ready&&c.readiness.lifecycle_ready?'ready':'unavailable'},c.readiness.budget_ready&&c.readiness.lifecycle_ready?200:503);
  }
  if(!ports.ready())fail(503,'SERVICE_UNAVAILABLE','서버가 준비되지 않았습니다.');
  // Only explicitly public paths may bypass the cheap request gate.
  if(['GET','HEAD'].includes(original.method)&&isPublicAsset(path))return ports.assets.fetch(original);
  if(original.method==='GET'&&(htmlRoutes.has(path)||/^\/claim\/[^/]+\/[\w-]{43}$/.test(path)))return html(original);
  const rawIp=ports.trustedIP(original);
  if(!(await ports.edgeLimit.limit({key:rawIp})).success)throw new HttpError(429,'RATE_LIMITED','요청 한도를 초과했습니다.',60);
  // No Assets fallback can precede this server-side admin gate.
  const review=await designSurface(original,{assets:ports.assets,authorizeAdmin:authorize});if(review)return review.ok?responseBudget(review,original):review;
  if(path==='/admin'||path.startsWith('/admin/')){const allowed=await authorize(original);if(!allowed.authorized)fail(allowed.status,allowed.status===401?'AUTH_REQUIRED':'ADMIN_REQUIRED','관리자 로그인이 필요합니다.');if(original.method==='GET'){if(!adminHtmlPaths.includes(path))fail(404,'NOT_FOUND','경로가 없습니다.');return responseBudget(await html(original),original);}fail(405,'METHOD_NOT_ALLOWED','읽기 요청만 허용됩니다.');}
  if(!['GET','HEAD'].includes(original.method)&&original.headers.has('Origin')&&original.headers.get('Origin')!==origin)fail(403,'ORIGIN_DENIED','외부 Origin 변경 요청은 허용되지 않습니다.');
  const config=await settings.get(),api=privateApi.exec(path),entry=privateEntry.exec(path);
  const cleanup=!!api&&(original.method==='DELETE'||api[2]==='close')||original.method==='DELETE'&&/^\/api\/public\/rooms\/[^/]+\/lease$/.test(path);
  const controlPath=path.startsWith('/api/auth/')||path.startsWith('/api/admin/')||path==='/api/session'||path.startsWith('/api/agents')||path.startsWith('/api/claims/')||path==='/api/config';
  if(!controlPath&&!cleanup)requireRuntime(config);
  const publicRoomRequest=/^\/api\/public\/rooms\/[^/]+(?:\/(?:participants|watchers|messages|wait|lease|guide))?$/.test(path);
  // Room cores account for their own admission, duration, response and body writes.
  const metered=!(api||entry||publicRoomRequest)||wantsHtml(original)&&!!entry;
  if(metered)await reserveHttp(original,'admission_requests',1);
  const options:IdentityOptions={...ports.auth,trustedIP:()=>rawIp};
  let request=original,response:Response|undefined|null;
  if(!(api||entry||path.startsWith('/public/')||path.startsWith('/api/public/rooms'))&&!['GET','HEAD'].includes(request.method))request=await boundedControlBody(request);
  if(path==='/api/config'&&request.method==='GET')response=await configResponse(env);
  response??=await identityRoute(request,env,options);
  response??=await adminRoute(request,env,ports.auth?.now?.());
  response??=await privateCreateRoute(request,env,options);
  if(response){if(path==='/api/admin/settings'&&request.method==='PUT'&&response.ok)settings.invalidate();return metered?responseBudget(response,original):response;}
  if(path==='/api/v1/rooms'&&request.method==='POST'){
   const invite=newToken(),read=newToken(),owner=newToken();
   const [invite_hash,read_hash,owner_hash]=await Promise.all([hash(invite),hash(read),hash(owner)]);
   const reservation=await reserveCreation(request,env,options,{invite_hash,read_hash,owner_hash});
   let room:object;
   try{room=await ports.privateRoom(reservation.room_id).initialize(reservation.snapshot);await commitSlot(env,reservation.room_id,'initialized',ports.auth?.now?.());}
   catch{throw new CreationResultError('CREATE_PENDING','생성 상태를 확인 중입니다. 같은 요청 식별자로 확인하세요.',reservation.room_id);}
   try{return await responseBudget(json({...room,invite_url:`${origin}/r/${reservation.room_id}/${invite}`,read_url:`${origin}/r/${reservation.room_id}/${read}`,owner_token:owner},201),original);}
   catch{throw new CreationResultError('CREATE_RESULT_NOT_RECOVERABLE','방이 생성되었지만 첫 결과를 전달하지 못했습니다.',reservation.room_id);}
  }
  if(api||entry){
   const id=(api??entry)![1],room=ports.privateRoom(id);response=await room.fetch(request);
   if(cleanup&&response.ok){const proof=await room.inspect(id) as {status:string};if(['closed','deleted','expired'].includes(proof.status))await commitSlot(env,id,'closed',ports.auth?.now?.());}
   if(entry&&wantsHtml(request)){if(!response.ok)return html(request,response);await response.body?.cancel();return responseBudget(await html(request),original);}
   return response;
  }
  if(path.startsWith('/public/')||path.startsWith('/api/public/rooms')){
   const policy=publicPolicy(config),catalog=publicCatalog(config);
   const requestedSlug=/^\/api\/public\/rooms\/([a-z0-9-]+)(?:\/|$)/.exec(path)?.[1];
   const existing=requestedSlug&&ports.publicRoomExists?await ports.publicRoomExists(requestedSlug,config):true;
   const publicRequest=(r:Request)=>handlePublicRequestWith(r,{origin,catalog:()=>catalog,policy:()=>policy,room:slug=>({fetch:async q=>(await ports.publicRoom(slug,config)).fetch(q)}),existingRoom:slug=>existing&&slug===requestedSlug,trustedIpHash:()=>hash(rawIp)});
   response=await handlePublicBrowserWith(request,{origin,assets:ports.assets,catalog,policy,trustedIP:()=>rawIp,limit:async()=>({success:true}),room:slug=>ports.publicRoom(slug,config),dispatch:publicRequest});
   if(response)return metered?responseBudget(response,original):response;
  }
  fail(404,'NOT_FOUND','경로가 없습니다.');
 }
 return {
  async fetch(request:Request):Promise<Response>{
   if(handlers>=256){cancelUnusedRequestBody(request);return secureRouteResponse(request,controlErrorResponse(new HttpError(429,'RATE_LIMITED','서버 처리 한도를 초과했습니다.',1)));}
   handlers++;
   try{return secureRouteResponse(request,await route(request));}
   catch(error){return secureRouteResponse(request,controlErrorResponse(error));}
   finally{cancelUnusedRequestBody(request);handlers--;}
  },settings,diagnostics:()=>({handlers,bodies})
 };
}
