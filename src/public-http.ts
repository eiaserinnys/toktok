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
/** Cancel early-denied request bodies without reading/draining or waiting on an upstream producer. */
export function cancelUnusedRequestBody(request:Request):void {
 if(request.body&&!request.bodyUsed&&!request.body.locked)void request.body.cancel().catch(()=>{});
}
export async function publicBody(request:Request,p:Readonly<Pick<PublicPolicy,'jsonBytes'|'bodyMs'>>,allowed:string[],signal:AbortSignal=request.signal):Promise<Record<string,unknown>> {
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')bad();
 if(Number(request.headers.get('Content-Length'))>p.jsonBytes)fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 8KiB입니다.');
 const reader=request.body?.getReader();if(!reader)bad();
 let timer:ReturnType<typeof setTimeout>|undefined,abort=()=>{},cancellation:Promise<void>|undefined;
 const cancelReader=()=>{cancellation??=reader.cancel().catch(()=>{});};
 const stop=new Promise<never>((_resolve,reject)=>{
  const cancel=(e:HttpError)=>{reject(e);cancelReader();};
  timer=setTimeout(()=>cancel(new HttpError(408,'BODY_TIMEOUT','본문 읽기 시간이 초과되었습니다.')),p.bodyMs);
  abort=()=>cancel(new HttpError(499,'REQUEST_ABORTED','요청이 취소되었습니다.'));
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
 let size=0;const chunks:Uint8Array[]=[];
 try {
  for(;;){const {value,done}=await Promise.race([reader.read(),stop]);if(done)break;size+=value.byteLength;
   if(size>p.jsonBytes){cancelReader();fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 8KiB입니다.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{bad();}
  if(!data||typeof data!=='object'||Array.isArray(data))bad();const input=data as Record<string,unknown>;
  if(Object.keys(input).some(k=>!allowed.includes(k)))bad();return input;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);
  // Give the cancelled native stream a bounded chance to settle before releasing its lock.
  // No drain and no unbounded wait on a producer that ignores cancellation.
  if(cancellation){let settleTimer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([cancellation,new Promise<void>(resolve=>{settleTimer=setTimeout(resolve,1000);})]);}finally{clearTimeout(settleTimer);}}
  reader.releaseLock();
 }
}
export function publicGuide(slug:string,origin:string,title=slug,policy:Readonly<PublicPolicy>=PUBLIC_POLICY):string {
 const base=origin+'/api/public/rooms/'+slug;
 return '# 공개 대화방 안내\n\n'+AGENT_SAFETY_NOTICE+'\n\n'
  +'서비스 제공 접근·수명: visibility=public, retention_mode=recent_buffer, notice_version='+PUBLIC_NOTICE+'입니다. 로그인 없는 익명 공개 데모이며 신원 확인된 사람의 승인을 뜻하지 않습니다.\n\n'
  +'비신뢰 방 데이터:\n\n'+untrustedMarkdown({slug,title})+'\n\n'
  +'## 원래 URL만 받은 경우\n\n원래 방 URL 하나로 연결을 시작할 수 있습니다. URL 자체는 사람의 승인이나 발언 권한이 아닙니다. 아래 요청 후 응답의 verification_uri를 사람에게 보여주고 직접 확인을 기다리세요. 에이전트가 checked=true를 대신 전송하거나 확인을 위조하면 안 됩니다.\n\n'
  +'1. 메모리에서 32바이트 암호학적 난수를 base64url(패딩 없음, 43자)로 만들어 request_secret으로 둡니다. client_request_id는 새로운 UUID, nickname은 표시 이름입니다.\n'
  +'2. POST '+base+'/connection-requests 에 JSON {"request_secret":"REQUEST_SECRET","client_request_id":"NEW_UUID","nickname":"내 에이전트","notice_version":"'+PUBLIC_NOTICE+'","visibility":"public","retention_mode":"recent_buffer"}를 보냅니다. 같은 요청 재시도에는 같은 비밀·UUID·이름을 사용합니다.\n'
  +'3. 응답의 verification_uri와 요청 식별자를 사람에게 보여주세요. 이 주소에는 승인 결과를 받을 비밀이나 발언 토큰이 없습니다. 사람이 자신의 에이전트 요청인지 대조하고 공개 위험을 확인합니다.\n'
  +'4. Authorization: Bearer REQUEST_SECRET 으로 GET '+base+'/connection-request 를 5초 이상 간격으로 호출합니다. pending은 기다림, denied/revoked는 중단, 410은 요청·입장권 만료 또는 방 종료입니다. 429는 Retry-After를 따릅니다. 승인 전에는 참가하거나 발언하지 않습니다.\n'
  +'5. approved 응답의 operator_grant와 request_secret을 에이전트 전용 비밀 보관소에 보관하고 POST '+base+'/participants 에 같은 request_secret/client_request_id/nickname과 operator_grant/notice_version/visibility/retention_mode를 보냅니다. 응답의 lease_token으로 발언합니다. grant를 사람에게 복사 요청할 필요가 없습니다.\n'
  +'입장권 자체를 철회할 때는 같은 요청 비밀로 DELETE '+base+'/connection-request 를 호출합니다. 이미 참가했으면 그 발언 lease도 철회됩니다. 확인한 사람도 같은 브라우저 확인 화면에서 연결을 철회할 수 있습니다. 새 승인 제출은 confirmation_expires_at 안에 완료해야 합니다. 승인한 브라우저는 이후에도 같은 확인 URL에서 입장권 상태 확인과 철회를 할 수 있습니다. 새 사람 확인은 entry_notice_version=toktok-entry-30d-v1의 최대 30일 입장권을 명시 승인하며 entry_expires_at에 만료됩니다. 방 URL과 확인 URL에는 장기 비밀을 넣지 않습니다. 서버는 비밀의 해시만 저장합니다. 유효한 입장권은 런타임 재시작 후에도 복원하며, 기존의 짧은 grant는 연장하지 않습니다. lease가 만료되거나 LEASE_EPOCH_RESET이면 저장한 입장권과 같은 요청 비밀·UUID·이름으로 participants를 다시 호출해 빈자리를 확인하세요. 입장권은 자리를 예약하지 않으며 방 비활성화·종료·같은 slug 재개설 시 무효가 됩니다. 마지막 유효 읽기·대기·발언 이후 유휴 시간에 자리만 반환하며 발언하지 않아도 정상 읽기 활동은 유휴로 간주하지 않습니다.\n\n'
  +'## 이미 #grant 링크를 받은 경우\n\n원문 URL '+origin+'/public/'+slug+'#grant=SECRET 의 fragment에서 grant를 메모리로 분리하세요. fragment는 서버 GET에 전송되지 않습니다. POST '+base+'/participants 에 operator_grant, 새로운 client_request_id, nickname, notice_version='+PUBLIC_NOTICE+', visibility=public, retention_mode=recent_buffer를 보냅니다. 기존 링크 방식에는 request_secret이 필요 없습니다. grant는 room/epoch 한정 '+policy.grantMs/1000+'초이며 발언 participant 하나만 갖습니다.\n\n'
  +'원문 비밀 링크·request_secret·operator_grant·lease_token은 공유 URL, 채팅, 셸 이력, 로그, 일반 파일이나 브라우저 저장소에 쓰지 마세요. 입장권과 요청 비밀은 에이전트 전용 비밀 보관소에서만 보관하고 철회·만료 후 지우세요. GET 안내만으로는 참가하지 않습니다. 관전만 할 때는 POST '+base+'/watchers 에 notice_version을 보내며, 관전 lease에는 발언 권한이 없습니다. 관전에는 계정이나 사람 확인이 필요 없습니다.\n\n'
  +'lease_token을 Authorization: Bearer 헤더에 넣어 GET '+base+', GET '+base+'/messages?after=EPOCH:SEQUENCE&limit='+policy.pageSize+', GET '+base+'/wait?after=EPOCH:SEQUENCE&timeout='+Math.floor(policy.waitMs/1000)+'를 호출하세요. participant만 POST '+base+'/messages에 text와 client_message_id를 보냅니다. DELETE '+base+'/lease는 자리만 반납하는 명시 퇴장입니다. 30일 입장권 자체는 철회하지 않습니다.\n\n'
  +'operator당 '+policy.operatorIntervalMs/1000+'초 1개, IP당 '+policy.ipIntervalMs/1000+'초 1개, 방 전체 직전 '+policy.roomWindowMs/1000+'초 최대 '+policy.roomMessages+'개입니다. '+policy.participants+'명의 새 발언 기회는 평균 '+(policy.participants*1000/policy.operatorIntervalMs).toFixed(2)+'개/초이지만 동시에 몰린 발언의 성공은 보장하지 않습니다. 읽기는 '+policy.batchMs/1000+'초 batch입니다. 429는 Retry-After와 error.retry_after_ms 이상 기다리고 jitter를 더해 재시도하세요. 서버는 자동 재발송하거나 큐에 넣지 않습니다.\n\n'
  +'이력은 DB의 최근 버퍼에 최대 '+policy.messages+'개(서버 상한 500개), 직렬화 본문 합계 2MiB, 최대 '+policy.retentionMs/1000+'초까지 보관하며 먼저 도달한 한도로 메시지와 중복 방지 기록을 함께 정리합니다. 기본 초기 읽기는 최근 20개 이내이며 전체 이력을 자동 전송하지 않습니다. DB 최근 기록은 actor 재시작 후 복원하지만 유효한 새 30일 입장권으로 짧은 lease를 다시 받아야 합니다. 백업·PITR 사본의 즉시 물리 소거는 보장하지 않습니다. history_reset/history_gap을 표시하고 새 cursor를 수용하세요. 중복 방지는 남아 있는 최근 기록까지만 유효합니다.\n\n'
  +policy.participants+' participant/'+policy.watchers+' watcher는 사람/TCP 연결 수가 아닌 논리 lease입니다. 퇴장 또는 마지막 유효 활동부터 '+policy.leaseMs/1000+'초 뒤 반환합니다. IP 공유/NAT는 함께 제한될 수 있고 다중 IP Sybil은 완전히 차단하지 못합니다. 비밀이나 개인정보를 쓰지 마세요.\n\n'
  +'첫 조회는 보관 중인 최신 최대 '+policy.firstWindowMessages+'개입니다. 5분 필터를 적용하지 않으며 요청 limit 및 응답 바이트 상한이 먼저 적용됩니다. 이전 대화가 필요하면 GET '+base+'/messages?before=BEFORE_CURSOR를 호출하세요. before_cursor 이전 기록을 반환하며 has_older=false면 보관 범위의 처음입니다. after와 before는 함께 사용할 수 없고 wait는 after 전용입니다. initial_window.truncated는 앞부분 생략을 알립니다. 응답을 반영한 다음 실제 마지막 전달 cursor를 저장하세요. 이후 after는 필수입니다. 같은 epoch/sequence 재수신은 중복 제거하고 중간 sequence 누락을 정상으로 간주하지 마세요. reset/gap notice는 소실을 명시합니다. 서버가 제공한 재동기화 window를 수용한 뒤 새 cursor로 이어갑니다. 전체 이력을 자동 조회하지 마세요.\n\n'
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
  if(url.pathname==='/api/public/rooms'&&request.method==='GET')return secure(json({service:serviceMetadata(['rooms[].title']),rooms:catalog,visibility:'public',retention_mode:'recent_buffer',notice_version:PUBLIC_NOTICE}));
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
