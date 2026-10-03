import {renderPublicAgentEntry} from './public-connection-content';
import type {ValidatedOperatorAck,PublicPolicy,PublicRoomEndpoint,PublicEnv} from './public-contracts';
import type {AssetPort} from './site-assets';
import {PUBLIC_CATALOG,PUBLIC_NOTICE,PUBLIC_POLICY,INTERNAL_IP_HEADER,publicAction} from './public-contracts';
import {handlePublicRequest,publicBody,publicError,publicLimited} from './public-http';
import {fail,hash,json,newToken,publicOrigin,secure} from './http';
const APPROVAL_COOKIE='__Host-toktok-public-approval';
const COOKIE='__Host-toktok-public-flow';
const cookieFlags='; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=';
const nonceShape=/^[\w-]{43}$/;
export interface PublicBrowserDependencies {trustedIP:(request:Request)=>string;}
interface LegacyBrowserEnv extends PublicEnv {ASSETS:AssetPort;IP_RATE_LIMIT:{limit(input:{key:string}):Promise<{success:boolean}>};}
export interface PublicBrowserPorts {
 origin:string;assets:AssetPort;catalog:ReadonlyArray<{slug:string;title:string}>;policy:PublicPolicy;
 trustedIP:(request:Request)=>string;limit:(ip:string)=>Promise<{success:boolean}>;
 room:(slug:string)=>Promise<PublicRoomEndpoint>;
 dispatch:(request:Request)=>Promise<Response|null>;
}
function normalizeIP(ip:string):string {
 if(/^\d+\.\d+\.\d+\.\d+$/.test(ip)){
  const parts=ip.split('.');if(parts.some(p=>String(Number(p))!==p||Number(p)>255))fail(503,'TRUSTED_IP_REQUIRED','정상 edge IP가 필요합니다.');return ip;
 }
 if(!/^[a-f\d:]+$/i.test(ip)||!ip.includes(':'))fail(503,'TRUSTED_IP_REQUIRED','정상 edge IP가 필요합니다.');
 try{return new URL('http://['+ip+']/').hostname.slice(1,-1);}catch{return fail(503,'TRUSTED_IP_REQUIRED','정상 edge IP가 필요합니다.');}
}
export function edgeIP(request:Request):string {
 // cf is platform metadata, never reconstructed from client headers. Worker subrequests are unsupported.
 const cf=(request as Request&{cf?:{colo?:unknown}}).cf;
 if(!cf||typeof cf.colo!=='string'||request.headers.has('CF-Worker'))fail(503,'TRUSTED_IP_REQUIRED','직접 edge 요청만 허용됩니다.');
 const ip=request.headers.get('CF-Connecting-IP');
 if(!request.headers.has('CF-Connecting-IP')||!ip)fail(503,'TRUSTED_IP_REQUIRED','edge IP가 필요합니다.');
 const normalized=normalizeIP(ip);if(normalized==='2a06:98c0:3600::103')fail(503,'TRUSTED_IP_REQUIRED','Worker subrequest는 허용되지 않습니다.');return normalized;
}
function flowCookie(request:Request):{room:string;nonce:string;issued_at:number} {
 const raw=request.headers.get('Cookie')??'';if(raw.length>4096)fail(403,'OPERATOR_ACK_REQUIRED','브라우저 확인을 다시 진행해주세요.');
 const values=raw.split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));
 try{
  if(values.length!==1)throw Error();const v=JSON.parse(decodeURIComponent(values[0].slice(COOKIE.length+1)));
  if(!v||typeof v.room!=='string'||typeof v.nonce!=='string'||!nonceShape.test(v.nonce)||!Number.isSafeInteger(v.issued_at))throw Error();return v;
 }catch{return fail(403,'OPERATOR_ACK_REQUIRED','브라우저 확인을 다시 진행해주세요.');}
}
export async function handlePublicBrowser(request:Request,env:LegacyBrowserEnv,dependencies:PublicBrowserDependencies={trustedIP:edgeIP}):Promise<Response|null> {
 return handlePublicBrowserWith(request,{origin:env.PUBLIC_ORIGIN,assets:env.ASSETS,catalog:PUBLIC_CATALOG,policy:{...PUBLIC_POLICY},trustedIP:dependencies.trustedIP,limit:ip=>env.IP_RATE_LIMIT.limit({key:ip}),room:async slug=>env.PUBLIC_ROOMS.getByName(slug),dispatch:r=>handlePublicRequest(r,env)});
}
export async function handlePublicBrowserWith(request:Request,ports:PublicBrowserPorts):Promise<Response|null> {
 const url=new URL(request.url);if(!url.pathname.startsWith('/public/')&&!url.pathname.startsWith('/api/public/rooms'))return null;
 try{
  const origin=publicOrigin(ports.origin);
  if(url.pathname==='/api/public/rooms'&&request.method==='GET')return ports.dispatch(request);
  const page=/^\/public\/([a-z0-9-]+)$/.exec(url.pathname),api=/^\/api\/public\/rooms\/([a-z0-9-]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
  const slug=page?.[1]??api?.[1];if(!slug)fail(404,'NOT_FOUND','공개방이 없습니다.');
  if(!ports.catalog.some(r=>r.slug===slug))return ports.dispatch(request);
  if(page){
   if(request.method!=='GET')fail(404,'NOT_FOUND','경로가 없습니다.');
   if(url.searchParams.get('format')==='md'||request.headers.get('Accept')?.includes('text/markdown'))return ports.dispatch(request);
   const asset=await ports.assets.fetch(new Request(new URL('/index.html',request.url)));if(!asset.ok)return secure(asset);
   const markdown='/public/'+slug+'?format=md';
   const html=(await asset.text()).replace('</head>',`<link rel="alternate" type="text/markdown" href="${markdown}"></head>`).replace('<div id="app"></div>',`<div id="app"><main id="content" class="x-main x-wrap">${renderPublicAgentEntry({slug,title:ports.catalog.find(r=>r.slug===slug)?.title})}</main></div>`);
   const response=new Response(html,asset);response.headers.delete('Content-Length');response.headers.set('Link',`<${markdown}>; rel="alternate"; type="text/markdown"`);return secure(response);
  }
  const action=api![2]??'',browser=['ack-flow','operator-grants','connection-approval'].includes(action);
  if(browser?request.method!=='POST':!publicAction(action,request.method))fail(404,'NOT_FOUND','경로가 없습니다.');
  if(browser&&request.headers.get('Origin')!==origin)fail(403,'ORIGIN_DENIED','같은 Origin의 확인 요청이 필요합니다.');
  const ip=ports.trustedIP(request);
  if(!(await ports.limit(ip)).success)publicLimited(60000);
  if(browser){
   if(action==='connection-approval'){
    const input=await publicBody(request,ports.policy,['action','request_id','nonce','checked','risk_ack_version','entry_notice_version']);
    if(!['preview','approve','deny','revoke'].includes(String(input.action))||typeof input.request_id!=='string'||input.request_id.length>100)fail(400,'INVALID_INPUT','연결 요청을 확인해주세요.');
    const cookieName=APPROVAL_COOKIE+'-'+slug;
    const cookies=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
    const endpoint=await ports.room(slug);if(!endpoint.connectionApproval)fail(503,'CONNECTION_UNAVAILABLE','연결 확인이 준비되지 않았습니다.');
    const result=await endpoint.connectionApproval({action:input.action as 'preview'|'approve'|'deny'|'revoke',request_id:input.request_id,
     proof:cookies.length===1?cookies[0].slice(cookieName.length+1):undefined,nonce:typeof input.nonce==='string'?input.nonce:undefined,
     entry_notice_version:typeof input.entry_notice_version==='string'?input.entry_notice_version:undefined,checked:input.checked===true,risk_ack_version:typeof input.risk_ack_version==='string'?input.risk_ack_version:undefined},await hash(ip),slug);
    const response=json(result.data,result.status);if(result.cookie)response.headers.set('Set-Cookie',cookieName+'='+result.cookie+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000');
    if(result.status===429){const retry=(result.data.error as {retry_after_ms?:number}|undefined)?.retry_after_ms;response.headers.set('Retry-After',String(Math.max(1,Math.ceil((typeof retry==='number'&&Number.isFinite(retry)?retry:5000)/1000))));}return secure(response);
   }
   if(action==='ack-flow'){
    await publicBody(request,ports.policy,[]);
    const nonce=newToken(),issued_at=Date.now(),response=json({nonce,notice_version:PUBLIC_NOTICE,expires_at:new Date(issued_at+300000).toISOString()},201);
    response.headers.set('Set-Cookie',COOKIE+'='+encodeURIComponent(JSON.stringify({room:slug,nonce,issued_at}))+cookieFlags+'300');return secure(response);
   }
   const flow=flowCookie(request),input=await publicBody(request,ports.policy,['nonce','checked','risk_ack_version']),now=Date.now();
   if(flow.room!==slug||typeof input.nonce!=='string'||!nonceShape.test(input.nonce)||flow.nonce!==input.nonce||flow.issued_at>now||now-flow.issued_at>=300000||input.checked!==true||input.risk_ack_version!==PUBLIC_NOTICE)fail(403,'OPERATOR_ACK_REQUIRED','고지를 확인하고 브라우저 확인을 다시 진행해주세요.');
   // This sole brand construction follows validation, not an unchecked external boolean cast.
   const ack={room:slug,risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:await hash(ip)} as ValidatedOperatorAck;
   const result=await (await ports.room(slug)).issueOperatorGrant(ack),response=json(result.data,result.status);
   if(result.status===201)response.headers.set('Set-Cookie',COOKIE+'='+cookieFlags+'0');
   if(result.status===429)response.headers.set('Retry-After',String(Math.ceil((result.retry_after_ms??1000)/1000)));
   return secure(response);
  }
  const headers=new Headers(request.headers);headers.delete(INTERNAL_IP_HEADER);headers.set('CF-Connecting-IP',ip);
  return ports.dispatch(new Request(request,{headers}));
 }catch(error){return secure(publicError(error));}
}
