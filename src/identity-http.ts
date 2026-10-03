import type {IdentityEnv,RegistryInput,ClaimBinding} from './identity-types';
import {HttpError,fail,bad,body,bearer,hash,newToken,json,text,publicOrigin,limited} from './http';
import {normalizeEmail,normalizeIP,sender,trustedIP,type IdentityOptions} from './email';
import type {Reservation} from './otp-store';
import type {CreatorPrincipal} from './control-policy';
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function agentId(value:unknown){const id=text(value,36,36);if(!idPattern.test(id))bad();return id;}
function cookie(request:Request,name:string){return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);}
const flowCookie='__Host-toktok-flow';
function setCookie(name:string,token:string,maxAge:number){return `${name}=${token}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;}
export function requireOrigin(request:Request,env:Pick<IdentityEnv,'PUBLIC_ORIGIN'>){if(request.headers.get('Origin')!==publicOrigin(env.PUBLIC_ORIGIN))fail(403,'ORIGIN_DENIED','정확한 공개 Origin이 필요합니다.');}
export async function registry<T>(env:IdentityEnv,action:string,input:RegistryInput):Promise<T>{
 if(!env.controlPort)fail(503,'CONTROL_UNCONFIGURED','서비스 연결을 준비하고 있습니다.');
 return await env.controlPort.execute(action,input) as T;
}
async function claimBinding(id:unknown,token:unknown):Promise<ClaimBinding|null>{
 if(id===undefined&&token===undefined)return null;
 const cap=text(token,43,43);if(!/^[\w-]{43}$/.test(cap))bad();return {agent_id:agentId(id),claim_hash:await hash(cap)};
}
export async function sessionInput(request:Request,env:Pick<IdentityEnv,'PUBLIC_ORIGIN'>,mutation=false):Promise<RegistryInput>{
 if(mutation)requireOrigin(request,env);
 const token=cookie(request,'__Host-toktok_session');if(!token)fail(401,'SESSION_REQUIRED','사람 확인 세션이 필요합니다.');
 return {session_hash:await hash(token),csrf:mutation?request.headers.get('X-CSRF-Token')??undefined:undefined};
}
export async function creatorAuthorization(request:Request,env:IdentityEnv,agent_id?:unknown){
 if(request.headers.has('Origin'))requireOrigin(request,env);
 const input=request.headers.has('Authorization')?{token_hash:await hash(bearer(request))}:{...await sessionInput(request,env,true),id:agentId(agent_id)};
 return registry<{creator_id:string;principal:CreatorPrincipal}>(env,'creator',input);
}
export async function creatorIdentity(request:Request,env:IdentityEnv,agent_id?:unknown):Promise<string>{return (await creatorAuthorization(request,env,agent_id)).creator_id;}
async function authGuard(request:Request,env:IdentityEnv,options:IdentityOptions){
 requireOrigin(request,env);if(request.headers.has('CF-Worker'))fail(403,'ORIGIN_DENIED','직접 브라우저 확인만 허용합니다.');
 if(Number(request.headers.get('Content-Length'))>32768)fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 32KiB입니다.');
 const ip=normalizeIP((options.trustedIP??trustedIP)(request));if(!(await env.IP_RATE_LIMIT.limit({key:ip})).success)limited();return ip;
}
export const anonymousSession=()=>({authenticated:false,role:'anonymous',can_bootstrap_admin:false,entitlements:{can_create_private:false,can_persist_private:false},csrf_token:null,owner_ack:null});
export async function identityRoute(request:Request,env:IdentityEnv,options:IdentityOptions):Promise<Response|undefined>{
 const path=new URL(request.url).pathname,now=options.now?.()??Date.now();
 if(path==='/api/agents'&&request.method==='POST'){
  const ip=normalizeIP((options.trustedIP??trustedIP)(request)),input=await body(request,['name']),name=text(input.name,1,64);if(!name.trim())bad();
  const id=crypto.randomUUID(),token=newToken(),claim=newToken();
  const data=await registry<object>(env,'register',{id,name,token_hash:await hash(token),claim_hash:await hash(claim),ip,now});return json({...data,agent_token:token,claim_url:`${publicOrigin(env.PUBLIC_ORIGIN)}/claim/${id}/${claim}`},201);
 }
 if(path==='/api/agents/me'&&request.method==='GET')return json(await registry(env,'agent',{token_hash:await hash(bearer(request)),now}));
 const claim=/^\/api\/claims\/([^/]+)(\/approve)?$/.exec(path);
 if(claim&&request.method===(claim[2]?'POST':'GET')){
  const input={id:agentId(claim[1]),claim_hash:await hash(bearer(request)),...(claim[2]?await sessionInput(request,env,true):{})},acknowledgment=claim[2]?await body(request,['risk_ack_version']):{};
  return json(await registry(env,claim[2]?'approve':'claim',{...input,risk_ack_version:acknowledgment.risk_ack_version as string,now}));
 }
 if(path==='/api/auth/invitations/validate'&&request.method==='POST'){
  await authGuard(request,env,options);const b=await body(request,['code']);
  if(typeof b.code!=='string'||!/^[\w-]{43}$/.test(b.code))fail(400,'INVALID_INVITATION','초대 코드를 사용할 수 없습니다.');
  const browser=cookie(request,flowCookie)??newToken(),validation=newToken();
  const result=await registry<{expires_at:number}>(env,'invitation-validate',{token_hash:await hash(b.code),invitation_validation_hash:await hash(validation),browser_hash:await hash(browser),now});
  const response=json({valid:true,invite_validation_id:validation,expires_at:new Date(result.expires_at).toISOString()});response.headers.set('Set-Cookie',setCookie(flowCookie,browser,600));return response;
 }
 if(path==='/api/auth/start'&&request.method==='POST'){
  await authGuard(request,env,options);const b=await body(request,['purpose','invitation_validation_id','claim_id','claim_token']);
  if(!['login','signup','claim'].includes(String(b.purpose)))bad();const claim=await claimBinding(b.claim_id,b.claim_token);
  const validation=b.invitation_validation_id===undefined?undefined:text(b.invitation_validation_id,43,43);
  const flow=newToken(),nonce=newToken(),browser=cookie(request,flowCookie)??newToken();
  const data=await registry<{expires_at:number}>(env,'start',{flow_hash:await hash(flow),nonce_hash:await hash(nonce),browser_hash:await hash(browser),claim,purpose:b.purpose as RegistryInput['purpose'],invitation_validation_hash:validation?await hash(validation):undefined,now});
  const response=json({flow,nonce,provider_configured:Boolean(options.sendEmail||(env.EMAIL&&env.EMAIL_FROM)),expires_at:new Date(data.expires_at).toISOString()});response.headers.set('Set-Cookie',setCookie(flowCookie,browser,Math.ceil((data.expires_at-now)/1000)));return response;
 }
 if(path==='/api/auth/email/send'&&request.method==='POST'){
  const ip=await authGuard(request,env,options),input=await body(request,['flow_id','email','client_request_id']);
  const flow=text(input.flow_id,43,43),email=normalizeEmail(input.email),request_id=text(input.client_request_id,1,128),browser=cookie(request,flowCookie);
  if(!/^[\w-]{43}$/.test(flow)||!/^[-\w]+$/.test(request_id))bad();if(!browser)fail(403,'AUTH_FLOW_DENIED','인증 흐름 쿠키가 필요합니다.');
  const send=sender(env,options),binding={flow_hash:await hash(flow),browser_hash:await hash(browser),request_id,now};
  const reservation=await registry<Reservation>(env,'email-reserve',{...binding,email,ip});
  if(reservation.dispatch){let delivery_state:'sent'|'uncertain'='sent';try{await send(reservation.dispatch);}catch{delivery_state='uncertain';}await registry(env,'email-result',{...binding,delivery_state});}
  const response=json({...reservation.receipt,expires_at:new Date(reservation.receipt.expires_at).toISOString(),message:'허용된 주소라면 인증 코드를 보냈습니다. 도착하지 않으면 간격 후 다시 시도해주세요.'});response.headers.set('Retry-After',String(reservation.receipt.retry_after));return response;
 }
 if(path==='/api/auth/complete'&&request.method==='POST'){
  requireOrigin(request,env);const input=await body(request,['flow','nonce','claim_id','claim_token','otp']);
  const flow=text(input.flow,43,43),nonce=text(input.nonce,43,43),otp=text(input.otp,6,6),browser=cookie(request,flowCookie);
  if(!/^\d{6}$/.test(otp))bad();if(!browser)fail(403,'AUTH_FLOW_DENIED','인증 흐름 쿠키가 필요합니다.');
  const binding={flow_hash:await hash(flow),nonce_hash:await hash(nonce),browser_hash:await hash(browser),claim:await claimBinding(input.claim_id,input.claim_token)},token=newToken();
  const result=await registry<{session_ttl_seconds:number}>(env,'complete',{...binding,otp,session_hash:await hash(token),csrf:newToken(),now});
  const response=json({verified:true});response.headers.append('Set-Cookie',setCookie('__Host-toktok_session',token,result.session_ttl_seconds));response.headers.append('Set-Cookie',setCookie(flowCookie,'',0));return response;
 }
 if(path==='/api/session'&&request.method==='GET'){
  try{return json(await registry(env,'session',{...await sessionInput(request,env),now}));}catch(e){if(e instanceof HttpError&&e.status===401)return json(anonymousSession());throw e;}
 }
 if(path==='/api/auth/logout'&&request.method==='POST'){await body(request,[]);await registry(env,'logout',{...await sessionInput(request,env,true),now});const response=json({logged_out:true});response.headers.set('Set-Cookie',setCookie('__Host-toktok_session','',0));return response;}
 const revoke=/^\/api\/agents\/([^/]+)\/revoke$/.exec(path);
 if(revoke&&request.method==='POST'){await body(request,[]);return json(await registry(env,'revoke',{...await sessionInput(request,env,true),id:agentId(revoke[1]),now}));}
}
