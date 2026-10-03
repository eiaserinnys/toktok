import type { Env } from './contracts';
import { secure, errorResponse, fail, limited, json, body, text, integer, newToken, hash, publicOrigin } from './http';
import { authenticateCreator } from './creator';
export { Room } from './room';
export {PublicRoom} from './public-room';
import {handlePublicBrowser} from './public-browser';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const apiRoom=new RegExp(`^/api/rooms/(${uuid})(?:/(participants|messages|wait|close))?$`);
const sharedRoom=new RegExp(`^/r/(${uuid})/[\\w-]{43}$`);
export default {
  async fetch(request: Request,env: Env): Promise<Response> {
    try {const response=await handlePublicBrowser(request,env);return secure(response??await route(request,env));} catch(error) {
      const response=errorResponse(error);
      if(wantsHTML(request)&&new URL(request.url).pathname.startsWith('/r/')) return secure(await html(env,request,response));
      return secure(response);
    }
  }
} satisfies ExportedHandler<Env>;
async function route(request: Request,env: Env): Promise<Response> {
  const url=new URL(request.url),origin=publicOrigin(env.PUBLIC_ORIGIN);
  if(request.method==='GET'&&url.pathname==='/health') return json({status:'ok'});
  if(request.method==='GET'&&['/','/guide'].includes(url.pathname)) return html(env,request);
  if(['GET','HEAD'].includes(request.method)&&(url.pathname.startsWith('/assets/')||['/styles.css','/app.js','/view.js','/session.js','/public-demo.js','/public-demo-session.js','/public-demo-view.js','/favicon.svg'].includes(url.pathname))) return env.ASSETS.fetch(request);
  const api=apiRoom.exec(url.pathname),shared=sharedRoom.exec(url.pathname);
  const creation=url.pathname==='/api/rooms'&&request.method==='POST';
  const validApi=api&&((!api[2]&&['GET','DELETE'].includes(request.method))||(api[2]==='messages'&&['GET','POST'].includes(request.method))||(api[2]==='wait'&&request.method==='GET')||(['participants','close'].includes(api[2])&&request.method==='POST'));
  if(!creation&&!validApi&&!(shared&&request.method==='GET')) fail(404,'NOT_FOUND','경로가 없습니다.');
  if(!['GET','HEAD'].includes(request.method)) {
    const source=request.headers.get('Origin');
    if(source&&source!==origin) fail(403,'ORIGIN_DENIED','외부 Origin의 변경 요청은 허용되지 않습니다.');
  }
  if(url.pathname.startsWith('/api/')) {
    const ip=request.headers.get('CF-Connecting-IP');
    // Local HTTP has no Cloudflare client-IP header; production injects it at the edge.
    if(ip&&!(await env.IP_RATE_LIMIT.limit({key:ip})).success) limited();
  }
  if(creation) {
    const creator_id=await authenticateCreator(request,env.CREATOR_CREDENTIALS_JSON);
    const input=await body(request,['purpose','ttl_seconds']);
    const purpose=text(input.purpose,0,1000),ttl_seconds=input.ttl_seconds===undefined?86400:integer(input.ttl_seconds,60,604800);
    if(!(await env.CREATOR_RATE_LIMIT.limit({key:creator_id})).success) limited();
    const id=crypto.randomUUID(),invite=newToken(),read=newToken(),owner=newToken();
    const [invite_hash,read_hash,owner_hash]=await Promise.all([hash(invite),hash(read),hash(owner)]);
    const room=await env.ROOMS.get(env.ROOMS.idFromName(id)).initialize({id,purpose,ttl_seconds,creator_id,invite_hash,read_hash,owner_hash});
    return json({room,invite_url:`${origin}/r/${id}/${invite}`,read_url:`${origin}/r/${id}/${read}`,owner_token:owner},201);
  }
  const id=(api??shared)![1];
  const response=await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(request);
  // The existing Room shared GET validates invite/read and expiry without joining.
  if(shared&&wantsHTML(request)) return html(env,request,response.ok?undefined:response);
  return response;
}

function wantsHTML(request:Request): boolean {
  const url=new URL(request.url),accept=request.headers.get('Accept')??'';
  return request.method==='GET'&&url.searchParams.get('format')!=='md'&&!accept.includes('text/markdown')&&accept.includes('text/html');
}
async function html(env:Env,request:Request,failure?:Response): Promise<Response> {
  const asset=await env.ASSETS.fetch(new Request(new URL('/index.html',request.url)));
  if(!failure)return asset;
  const data=await failure.json() as {error:{code:string}};
  const page=new HTMLRewriter().on('body',{element(e){e.setAttribute('data-error',data.error.code);}}).transform(asset);
  return new Response(page.body,{status:failure.status,headers:page.headers});
}
