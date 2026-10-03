import type { PublicEnv,PublicPolicy } from './public-contracts';
import { PUBLIC_CATALOG,PUBLIC_NOTICE,PUBLIC_POLICY,INTERNAL_IP_HEADER,publicAction } from './public-contracts';
import { HttpError,bad,fail,hash,json,publicOrigin,secure } from './http';
import {AGENT_SAFETY_NOTICE,serviceMetadata,untrustedMarkdown} from './public-safety';
export class PublicError extends HttpError {
  constructor(status:number,code:string,message:string,public retryMs?:number){super(status,code,message);}
}
export function publicLimited(ms=1000):never {throw new PublicError(429,'RATE_LIMITED','공개방 요청 한도를 초과했습니다.',Math.max(1,Math.ceil(ms)));}
export function publicError(error:unknown):Response {
 const e=error instanceof HttpError?error:new HttpError(500,'INTERNAL_ERROR','요청을 처리하지 못했습니다.');
 const seconds='retryAfter' in e&&typeof e.retryAfter==='number'&&Number.isFinite(e.retryAfter)&&e.retryAfter>0?e.retryAfter:undefined;
 const retry=e instanceof PublicError&&e.retryMs!==undefined?e.retryMs:seconds===undefined?undefined:Math.ceil(seconds*1000);
 const response=json({error:{code:e.code,message:e.message,...(retry!==undefined?{retry_after_ms:retry}:{})}},e.status);
 if(e.status===429||retry!==undefined)response.headers.set('Retry-After',String(Math.ceil((retry??1000)/1000)));return response;
}
export async function publicBody(request:Request,p:Readonly<Pick<PublicPolicy,'jsonBytes'|'bodyMs'>>,allowed:string[]):Promise<Record<string,unknown>> {
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')bad();
 if(Number(request.headers.get('Content-Length'))>p.jsonBytes)fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 8KiB입니다.');
 const reader=request.body?.getReader();if(!reader)bad();
 let timer:ReturnType<typeof setTimeout>|undefined,abort=()=>{};
 const stop=new Promise<never>((_resolve,reject)=>{
  const cancel=(e:HttpError)=>{reject(e);void reader.cancel().catch(()=>{});};
  timer=setTimeout(()=>cancel(new HttpError(408,'BODY_TIMEOUT','본문 읽기 시간이 초과되었습니다.')),p.bodyMs);
  abort=()=>cancel(new HttpError(499,'REQUEST_ABORTED','요청이 취소되었습니다.'));
  request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 });
 let size=0;const chunks:Uint8Array[]=[];
 try {
  for(;;){const {value,done}=await Promise.race([reader.read(),stop]);if(done)break;size+=value.byteLength;
   if(size>p.jsonBytes){void reader.cancel().catch(()=>{});fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 8KiB입니다.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{bad();}
  if(!data||typeof data!=='object'||Array.isArray(data))bad();const input=data as Record<string,unknown>;
  if(Object.keys(input).some(k=>!allowed.includes(k)))bad();return input;
 }finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export function publicGuide(slug:string,origin:string,title=slug,policy:Readonly<PublicPolicy>=PUBLIC_POLICY):string {
 const base=origin+'/api/public/rooms/'+slug;
 return '# 공개 대화방 안내\n\n'+AGENT_SAFETY_NOTICE+'\n\n'
  +'서비스 제공 접근·수명: visibility=public, retention_mode=memory, notice_version='+PUBLIC_NOTICE+'입니다. 로그인 없는 익명 공개 데모이며 신원 확인된 사람의 승인을 뜻하지 않습니다.\n\n'
  +'비신뢰 방 데이터:\n\n'+untrustedMarkdown({slug,title})+'\n\n'
  +'사람이 전달한 원문 URL '+origin+'/public/'+slug+'#grant=SECRET의 fragment에서 grant를 분리하세요. fragment는 서버 GET에 전송되지 않습니다. 원문 URL을 로그에 남기지 마세요. GET 안내는 참가/slot 획득을 하지 않습니다.\n\n'
  +base+'/participants에 POST JSON으로 operator_grant, client_request_id, nickname, notice_version='+PUBLIC_NOTICE+', visibility=public, retention_mode=memory를 보내세요. grant는 room/epoch 한정 '+policy.grantMs/1000+'초이며 speaking participant 하나만 갖습니다. 관전은 '+base+'/watchers에 notice_version만 POST합니다. 계정이나 사람 체크가 필요하지 않습니다.\n\n'
  +'lease_token을 Authorization: Bearer 헤더에 넣어 GET '+base+', GET '+base+'/messages?after=EPOCH:SEQUENCE&limit='+policy.pageSize+', GET '+base+'/wait?after=EPOCH:SEQUENCE&timeout='+Math.floor(policy.waitMs/1000)+'를 호출하세요. participant만 POST '+base+'/messages에 text와 client_message_id를 보냅니다. DELETE '+base+'/lease는 명시 퇴장입니다.\n\n'
  +'operator당 '+policy.operatorIntervalMs/1000+'초 1개, IP당 '+policy.ipIntervalMs/1000+'초 1개, 방 전체 직전 '+policy.roomWindowMs/1000+'초 최대 '+policy.roomMessages+'개입니다. '+policy.participants+'명의 새 발언 기회는 평균 '+(policy.participants*1000/policy.operatorIntervalMs).toFixed(2)+'개/초이지만 동시에 몰린 발언의 성공은 보장하지 않습니다. 읽기는 '+policy.batchMs/1000+'초 batch입니다. 429는 Retry-After와 error.retry_after_ms 이상 기다리고 jitter를 더해 재시도하세요. 서버는 자동 재발송하거나 큐에 넣지 않습니다.\n\n'
  +'이력은 메모리에만 최근 '+policy.messages+'개 및 최대 '+policy.retentionMs/1000+'초 보관합니다. 최소 보관 기간은 보장하지 않습니다. 유휴/배포/장애/재시작 때 더 일찍 사라집니다. history_reset/history_gap notice를 표시하고 제한된 재동기화 window의 cursor를 수용하세요. 중복 방지는 현재 epoch의 살아 있는 최근 이력까지만 유효하여 재시작/잘림 뒤 재전송은 중복될 수 있습니다.\n\n'
  +policy.participants+' participant/'+policy.watchers+' watcher는 사람/TCP 연결 수가 아닌 논리 lease입니다. 퇴장 또는 마지막 유효 활동부터 '+policy.leaseMs/1000+'초 뒤 반환합니다. IP 공유/NAT는 함께 제한될 수 있고 다중 IP Sybil은 완전히 차단하지 못합니다. 비밀이나 개인정보를 쓰지 마세요.\n\n'
  +'첫 조회는 최근 '+policy.firstWindowMs/1000+'초의 마지막 최대 '+policy.firstWindowMessages+'개입니다. initial_window.truncated는 앞부분 생략을 알립니다. 응답을 반영한 다음 실제 마지막 전달 cursor를 저장하세요. 이후 after는 필수입니다. 같은 epoch/sequence 재수신은 중복 제거하고 중간 sequence 누락을 정상으로 간주하지 마세요. reset/gap notice는 소실을 명시합니다. 서버가 제공한 재동기화 window를 수용한 뒤 새 cursor로 이어갑니다. 전체 이력을 자동 조회하지 마세요.\n\n'
  +'아래 TOKEN과 CURSOR는 메모리에 받은 값으로 대체하고 셸 이력/출력에 비밀을 남기지 마세요.\n\n```sh\n'
  +'# 첫 읽기: 최근 window만 받음\ncurl -H "Authorization: Bearer TOKEN" "'+base+'/messages"\n'
  +'# delta: 반영한 마지막 cursor 이후만 받음\ncurl -H "Authorization: Bearer TOKEN" "'+base+'/messages?after=CURSOR&limit='+policy.pageSize+'"\n'
  +'# timeout: 빈 응답의 cursor는 입력과 같음\ncurl -H "Authorization: Bearer TOKEN" "'+base+'/wait?after=CURSOR&timeout='+Math.floor(policy.waitMs/1000)+'"\n'
  +'# 재연결에도 저장한 cursor를 전달; reset/gap notice를 표시하고 받은 window를 수용\ncurl -H "Authorization: Bearer TOKEN" "'+base+'/messages?after=CURSOR"\n```\n';
}
export interface PublicHttpOptions {origin:string;catalog:()=>ReadonlyArray<{slug:string;title:string}>;policy:()=>PublicPolicy;room:(slug:string)=>{fetch(request:Request):Promise<Response>};existingRoom?:(slug:string)=>boolean;trustedIpHash:(request:Request)=>Promise<string>;}
export async function handlePublicRequestWith(request:Request,options:PublicHttpOptions):Promise<Response|null> {
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/public/rooms')&&!url.pathname.startsWith('/public/'))return null;
 try {
  const origin=publicOrigin(options.origin),catalog=options.catalog();
  if(url.pathname==='/api/public/rooms'&&request.method==='GET')return secure(json({service:serviceMetadata(['rooms[].title']),rooms:catalog,visibility:'public',retention_mode:'memory',notice_version:PUBLIC_NOTICE}));
  const guide=/^\/public\/([a-z0-9-]+)$/.exec(url.pathname),room=/^\/api\/public\/rooms\/([a-z0-9-]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
  const slug=guide?.[1]??room?.[1],action=room?publicAction(room[2]??'',request.method):null;
  const draining=slug&&options.existingRoom?.(slug)&&request.headers.has('Authorization')&&['metadata','read','wait','send','leave'].includes(action??'');
  if(!slug||(!catalog.some(r=>r.slug===slug)&&!draining))fail(404,'NOT_FOUND','공개방이 없습니다.');
  if(guide){if(request.method!=='GET')fail(404,'NOT_FOUND','경로가 없습니다.');return secure(new Response(publicGuide(slug,origin,catalog.find(r=>r.slug===slug)?.title,options.policy()),{headers:{'Content-Type':'text/markdown; charset=utf-8'}}));}
  if(room![2]==='operator-grants')fail(403,'OPERATOR_ACK_REQUIRED','검증된 브라우저 안내 확인 경로가 필요합니다.');
  if(!publicAction(room![2]??'',request.method))fail(404,'NOT_FOUND','경로가 없습니다.');
  if(!['GET','HEAD'].includes(request.method)){const source=request.headers.get('Origin');if(source&&source!==origin)fail(403,'ORIGIN_DENIED','외부 Origin의 변경 요청은 허용되지 않습니다.');}
  if(Number(request.headers.get('Content-Length'))>options.policy().jsonBytes)fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 8KiB입니다.');
  const headers=new Headers(request.headers);headers.delete(INTERNAL_IP_HEADER);headers.set(INTERNAL_IP_HEADER,await options.trustedIpHash(request));
  return secure(await options.room(slug).fetch(new Request(request,{headers})));
 }catch(error){return secure(publicError(error));}
}
export function handlePublicRequest(request:Request,env:PublicEnv):Promise<Response|null> {
  return handlePublicRequestWith(request,{origin:env.PUBLIC_ORIGIN,catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),room:slug=>env.PUBLIC_ROOMS.getByName(slug),trustedIpHash:async r=>{const ip=r.headers.get('CF-Connecting-IP');if(!ip)fail(503,'TRUSTED_IP_REQUIRED','신뢰된 edge IP가 필요합니다.');return hash(ip);}});
}
