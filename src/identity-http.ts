import type {Env} from './contracts';
import type {RegistryInput,ClaimBinding} from './identity-types';
import {HttpError,fail,bad,body,bearer,hash,newToken,json,text,publicOrigin} from './http';
import {normalizeEmail,normalizeIP,sender,trustedIP,type IdentityOptions} from './email';
import type {Reservation} from './otp-store';
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function agentId(value:unknown){const id=text(value,36,36);if(!idPattern.test(id))bad();return id;}
function cookie(request:Request,name:string){return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);}
function setCookie(name:string,token:string,maxAge:number){return `${name}=${token}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;}
export function requireOrigin(request:Request,env:Env){if(request.headers.get('Origin')!==publicOrigin(env.PUBLIC_ORIGIN))fail(403,'ORIGIN_DENIED','정확한 공개 Origin이 필요합니다.');}
export async function registry<T>(env:Env,action:string,input:RegistryInput):Promise<T>{
 const response=await env.IDENTITIES.get(env.IDENTITIES.idFromName('team')).fetch(new Request('https://identity/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
 const data=await response.json() as T&{error?:{code:string;message:string}};
 if(!response.ok)throw new HttpError(response.status,data.error!.code,data.error!.message,response.headers.has('Retry-After')?Number(response.headers.get('Retry-After')):undefined);return data;
}
async function claimBinding(value:unknown):Promise<ClaimBinding|null>{
 if(value===undefined)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))bad();
 const record=value as Record<string,unknown>;if(Object.keys(record).some(k=>!['agent_id','claim_token'].includes(k)))bad();
 const cap=text(record.claim_token,43,43);if(!/^[\w-]{43}$/.test(cap))bad();return {agent_id:agentId(record.agent_id),claim_hash:await hash(cap)};
}
export async function sessionInput(request:Request,env:Env,mutation=false):Promise<RegistryInput>{
 if(mutation)requireOrigin(request,env);
 const token=cookie(request,'__Host-toktok_session');if(!token)fail(401,'SESSION_REQUIRED','사람 확인 세션이 필요합니다.');
 return {session_hash:await hash(token),csrf:mutation?request.headers.get('X-CSRF-Token')??undefined:undefined,policy:env.SIGNUP_POLICY_JSON};
}
export async function creatorIdentity(request:Request,env:Env,agent_id?:unknown):Promise<string>{
 const input=request.headers.has('Authorization')?{token_hash:await hash(bearer(request)),policy:env.SIGNUP_POLICY_JSON}:{...await sessionInput(request,env,true),id:agentId(agent_id)};
 return (await registry<{creator_id:string}>(env,'creator',input)).creator_id;
}
export async function identityRoute(request:Request,env:Env,options:IdentityOptions):Promise<Response|undefined>{
 const url=new URL(request.url),path=url.pathname;
 const now=options.now?.()??Date.now();
 if(path==='/api/agents'&&request.method==='POST'){
  const ip=normalizeIP((options.trustedIP??trustedIP)(request));
  const input=await body(request,['name']),name=text(input.name,1,64);if(!name.trim())bad();
  const id=crypto.randomUUID(),token=newToken(),claim=newToken();
  const data=await registry<object>(env,'register',{id,name,token_hash:await hash(token),claim_hash:await hash(claim),ip,now});
  return json({...data,agent_token:token,claim_url:`${publicOrigin(env.PUBLIC_ORIGIN)}/claim/${id}/${claim}`},201);
 }
 if(path==='/api/agents/me'&&request.method==='GET')return json(await registry(env,'agent',{token_hash:await hash(bearer(request))}));
 const claim=/^\/api\/claims\/([^/]+)(\/approve)?$/.exec(path);
 if(claim&&request.method===(claim[2]?'POST':'GET')){
  const input={id:agentId(claim[1]),claim_hash:await hash(bearer(request)),...(claim[2]?await sessionInput(request,env,true):{})};
  const acknowledgment=claim[2]?await body(request,['risk_ack_version']):{};
  return json(await registry(env,claim[2]?'approve':'claim',{...input,risk_ack_version:acknowledgment.risk_ack_version as string,now}));
 }
 if(path==='/api/auth/start'&&request.method==='POST'){
  if(request.headers.has('CF-Worker'))fail(403,'ORIGIN_DENIED','직접 브라우저 확인만 허용합니다.');
  requireOrigin(request,env);normalizeIP((options.trustedIP??trustedIP)(request));const input=await body(request,['claim']),claim=await claimBinding(input.claim);
  const flow=newToken(),nonce=newToken(),browser=newToken();
  await registry(env,'start',{flow_hash:await hash(flow),nonce_hash:await hash(nonce),browser_hash:await hash(browser),claim,now});
  const response=json({flow,nonce,provider_configured:Boolean(options.sendEmail||(env.EMAIL&&env.EMAIL_FROM)),expires_at:new Date(now+600000).toISOString()});response.headers.set('Set-Cookie',setCookie('__Host-toktok_flow',browser,600));return response;
 }
 if(path==='/api/auth/email/send'&&request.method==='POST'){
  requireOrigin(request,env);
  if(request.headers.has('CF-Worker'))fail(403,'ORIGIN_DENIED','직접 브라우저 확인만 허용합니다.');
  const ip=normalizeIP((options.trustedIP??trustedIP)(request));
  if(Number(request.headers.get('Content-Length'))>32768)fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 32KiB입니다.');
  const input=await body(request,['flow_id','email','client_request_id']);
  const flow=text(input.flow_id,43,43),email=normalizeEmail(input.email),request_id=text(input.client_request_id,1,128),browser=cookie(request,'__Host-toktok_flow');
  if(!/^[\w-]{43}$/.test(flow)||!/^[-\w]+$/.test(request_id))bad();
  if(!browser)fail(403,'AUTH_FLOW_DENIED','인증 흐름 쿠키가 필요합니다.');
  const send=sender(env,options),binding={flow_hash:await hash(flow),browser_hash:await hash(browser),request_id,now};
  const reservation=await registry<Reservation>(env,'email-reserve',{...binding,email,ip,limits:env.EMAIL_LIMITS_JSON,policy:env.SIGNUP_POLICY_JSON});
  if(reservation.dispatch){
   let delivery_state:'sent'|'uncertain'='sent';try{await send(reservation.dispatch);}catch{delivery_state='uncertain';}
   await registry(env,'email-result',{...binding,delivery_state});
  }
  const response=json({...reservation.receipt,expires_at:new Date(reservation.receipt.expires_at).toISOString(),message:'허용된 주소라면 인증 코드를 보냈습니다. 도착하지 않으면 간격 후 다시 시도해주세요.'});
  response.headers.set('Retry-After',String(reservation.receipt.retry_after));return response;
 }
 if(path==='/api/auth/complete'&&request.method==='POST'){
  requireOrigin(request,env);const input=await body(request,['flow','nonce','claim','otp']);
  const flow=text(input.flow,43,43),nonce=text(input.nonce,43,43),otp=text(input.otp,6,6),browser=cookie(request,'__Host-toktok_flow');
  if(!/^\d{6}$/.test(otp))bad();
  if(!browser)fail(403,'AUTH_FLOW_DENIED','인증 흐름 쿠키가 필요합니다.');
  const binding={flow_hash:await hash(flow),nonce_hash:await hash(nonce),browser_hash:await hash(browser),claim:await claimBinding(input.claim)};
  const token=newToken();await registry(env,'complete',{...binding,otp,session_hash:await hash(token),csrf:newToken(),policy:env.SIGNUP_POLICY_JSON,now});
  const response=json({verified:true});response.headers.append('Set-Cookie',setCookie('__Host-toktok_session',token,43200));response.headers.append('Set-Cookie',setCookie('__Host-toktok_flow','',0));return response;
 }
 if(path==='/api/session'&&request.method==='GET')return json(await registry(env,'session',await sessionInput(request,env)));
 if(path==='/api/auth/logout'&&request.method==='POST'){
  await body(request,[]);await registry(env,'logout',await sessionInput(request,env,true));const response=json({logged_out:true});response.headers.set('Set-Cookie',setCookie('__Host-toktok_session','',0));return response;
 }
 const revoke=/^\/api\/agents\/([^/]+)\/revoke$/.exec(path);
 if(revoke&&request.method==='POST'){await body(request,[]);return json(await registry(env,'revoke',{...await sessionInput(request,env,true),id:agentId(revoke[1])}));}
}
