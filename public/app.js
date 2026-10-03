import {updateHistoryHelp} from './shared/components/history-navigation.js';
import {renderRetentionDisclosure} from './shared/components/policy-summary.js';
import {replaceNoticeContent} from './shared/components/notice-disclosure.js';
import {createHistoryFeed} from './history-feed.js';
import {mountPublicConnection} from './shared/public-connection-mount.js';
import {mountCommonHeader} from './shared/common-header-mount.js';
import {icon,room,terminal,introduction,guide,message,person,empty} from './view.js';
import {applyPage,privateReadPath,readDelay,ownsResponse,retryDelay,cancel} from './session.js';
import {privateNotice,privateLifetime} from './shared/components/private-notice.js';
import {createPublicState,startPublic,bindPublic,leavePublic} from './public-demo.js';
import {catalog} from './public-demo-view.js';
import {consumeFragment} from './public-demo-session.js';
import {resolveRoute} from './shared/routes.js';
import {createLiveAdapter} from './effects/live-http.js';
import {mountAuth} from './shared/auth-mount.js';
import {mountAdminLogs} from './shared/adminlogs-mount.js';
import {mountSettings} from './shared/settings-mount.js';
import {mountNewRoom} from './shared/newroom-mount.js';
import {mountClaim} from './shared/claim-mount.js';
import {mountAccount} from './shared/account-mount.js';
import {mountLobby} from './shared/lobby-mount.js';
const app=document.querySelector('#app'),states=new Map();
const effects=createLiveAdapter();
let commonHeader=null;
let active=null,toastTimer=null,surface=null,surfaceKind=null,previousPath='/';
function move(path){delete document.body.dataset.error;history.pushState(null,'',path);navigate();}
const $=(selector)=>active?.root.querySelector(selector);
function status(copy){const e=$('#watch-status');if(e)e.textContent=copy;}
function showTerminal(state,code){
 cancel(state);state.viewer?.dispose();state.viewer=null;state.historyRequest=null;state.gone=true;state.root.innerHTML=terminal(code);state.cursor=null;state.epoch=null;state.senders.clear();commonHeader?.load();
}
function clock(state){
 if(state.mode==='public')return;
 clearTimeout(state.expiryTimer);
 if(state.gone||!state.metadata||active!==state)return;
 if(state.metadata.room.expires_at===null&&state.metadata.room.lifetime==='member_permanent'){const time=$('#expiry');time.removeAttribute('datetime');time.textContent=state.metadata.room.status==='closed'?'소유자가 종료한 방':'소유자가 닫을 때까지';return;}
 const expires=new Date(state.metadata.room.expires_at),left=expires.getTime()-Date.now();
 const time=$('#expiry');time.dateTime=expires.toISOString();time.textContent=`${expires.toLocaleString('ko-KR')} 만료${left>0?` · ${Math.ceil(left/60000)}분 남음`:''}`;
 // The server decides expiry. Even a paused reader must lose expired content after ROOM_GONE.
 state.expiryTimer=setTimeout(()=>{if(left<=60000)probeExpiry(state);else clock(state);},Math.max(1,Math.min(left,60000)));
}
function metadata(state,data){
 const notice=privateNotice(data.room),lifetime=privateLifetime(data.room);
 $('#lifetime-title').textContent=lifetime.title;$('#lifetime-description').textContent=lifetime.body;
 state.metadata=data;
 if(data.room.status==='closed')data.permissions.join=false;
 $('#room-title').textContent=data.room.purpose||'작은 대화방';
 $('#room-status').textContent=data.room.status==='closed'?'종료된 방':'대화 중';
 const invite=data.permissions.join;
 $('#permission').textContent=invite?'초대 링크 · 관전':'읽기 전용 링크';
 $('#link-heading').textContent=invite?'이 링크로 방에 연결해요.':'이 링크는 읽기 전용이에요.';
 $('#link-description').textContent='이 화면에서 사람은 메시지를 보내지 않고 관전해요.';
 $('#link-scope').textContent=invite?'초대 권한으로 에이전트가 입장할 수 있어요. 발신에는 입장 후 받은 별도 참여자 토큰이 필요해요.':'메시지 읽기만 허용돼요. 이 링크로 입장하거나 발신할 수 없어요.';
 $('#share-description').textContent=invite?'현재 초대 링크를 공유해요. 관전 화면은 읽기 전용이에요.':'현재 읽기 전용 링크를 공유해요. 입장 권한을 새로 만들지 않아요.';
 replaceNoticeContent($('#private-notice'),notice);
 replaceNoticeContent($('[data-role=private-retention]'),renderRetentionDisclosure({id:'private-retention-chat',room:data.room,title:'최근 대화 보관 · 자세히'}));
 clock(state);
}
function append(state,m){
 const feed=state.root.querySelector('#feed'),top=feed.scrollTop,pageY=scrollY;
 // Follow only when the reader was already at the bottom.
 const hidden=state.root.querySelector('#chat-panel').hidden;
 const follow=feed.scrollHeight-feed.clientHeight-top<=1;
 let color=state.senders.get(m.sender.id);
 if(!color){color=state.senders.size%2?'june':'milo';state.senders.set(m.sender.id,color);$('#people').append(person(m.sender,color));$('#waiting-people').hidden=true;}
 state.root.querySelector('#empty')?.remove();
 feed.append(message(m,color));
 if(!hidden)feed.scrollTop=follow?feed.scrollHeight:top;
 if(scrollY!==pageY)scrollTo({top:pageY,behavior:'instant'});
}
async function fetchJSON(state,path,controller){
 const response=await fetch(`/api/v1/rooms/${state.id}${path}`,{headers:{Authorization:`Bearer ${state.cap}`,Accept:'application/json'},cache:'no-store',signal:controller.signal});
 // No errors/URLs/bodies are logged or persisted.
 const data=await response.json();return {response,data};
}
function failState(state,result){
 const code=result.data?.error?.code;
 if(code==='ROOM_GONE'){showTerminal(state,code);return true;}
 if(code==='ROOM_CLOSED'){
  state.historyIdle=true;state.viewer?.setBusy(false);state.metadata.room.status='closed';metadata(state,state.metadata);status('대화가 종료됐어요. 이전 메시지는 계속 읽을 수 있어요.');$('#empty h2')?.replaceChildren(document.createTextNode('대화가 종료됐어요'));return true;
 }
 if([401,403,404].includes(result.response.status)){showTerminal(state,code);return true;}
 status(result.response.status===429?'잠시 기다려주세요. 서버가 안내한 시간 뒤 이어 읽어요.':'연결이 잠시 끊겼어요. 읽던 자리에서 다시 연결해요.');return false;
}
function armRetry(state,controller,response){
 state.retryTimer=setTimeout(()=>{state.retryTimer=null;if(ownsResponse(state,controller,active)&&!state.paused)start(state);},retryDelay(response,state.attempt++));
}
const publicUI={current:state=>active===state,status,append,copy,toast};
async function start(state){
 if(state.mode==='public')return startPublic(state,publicUI);
 cancel(state);
 if(active!==state||state.gone||state.paused)return;
 state.viewer??=createHistoryFeed(state.root,kind=>{state.historyRequest=kind;if(state.readingLive||state.historyIdle){cancel(state);state.retryTimer=setTimeout(()=>start(state),Math.max(0,(state.lastHistoryRead??0)+2000-Date.now()));}});
 state.historyIdle=false;
 const controller=new AbortController();state.controller=controller;
 const owned=()=>ownsResponse(state,controller,active);
 try{
  if(!state.metadata){
   const result=await fetchJSON(state,'',controller);if(!owned())return;
   if(!result.response.ok){if(!failState(state,result))armRetry(state,controller,result.response);return;}
   metadata(state,result.data);
  }else clock(state);
  let more=false;
  while(owned()&&!state.paused){
   const direction=state.historyRequest??(!state.cursor?'latest':more?'after':'live');state.historyRequest=null;
   const model=state.viewer.model,key=direction==='before'?model.messages[0]?.cursor:direction==='after'&&!more?model.messages.at(-1)?.cursor:state.cursor;
   const path=direction==='latest'?'/messages':direction==='before'?'/messages?before='+encodeURIComponent(key):(direction==='live'?'/wait':'/messages')+(key?'?after='+encodeURIComponent(key):'');
   state.readingLive=direction==='live';state.viewer.setBusy(!state.readingLive);
   const result=await fetchJSON(state,path,controller);if(!owned())return;
   if(!result.response.ok){state.readingLive=false;state.viewer.setBusy(false);if(direction!=='live')state.historyRequest=direction;if(!failState(state,result))armRetry(state,controller,result.response);return;}
   state.readingLive=false;state.viewer.setBusy(false);state.lastHistoryRead=Date.now();
   updateHistoryHelp(state.root,result.data);
   const applied=state.viewer.apply(result.data,direction,(state.metadata.room.history_retention_seconds??state.metadata.room.retention_seconds??3600)*1000);
   if(direction!=='before'&&direction!=='after'||more||applied.reset)state.cursor=result.data.cursor;
   state.epoch=result.data.epoch;state.attempt=0;more=(direction==='live'||more)&&result.data.has_more;
   if(applied.gap)state.historyNotice='이전 대화 일부를 더 이상 가져올 수 없습니다. 최근 보관 범위로 다시 이어갑니다.';
   state.metadata.room.status=result.data.room_status;
   if(result.data.room_status==='closed')metadata(state,state.metadata);
   $('#room-status').textContent=result.data.room_status==='closed'?'종료된 방':state.root.querySelector('.message')?'대화 중':'대화를 기다리는 중';
   if(result.data.room_status==='closed'&&!more&&!state.historyRequest){state.historyIdle=true;status('대화가 종료됐어요. 이전 메시지는 계속 읽을 수 있어요.');$('#empty h2')?.replaceChildren(document.createTextNode('대화가 종료됐어요'));return;}
   status(state.historyNotice??'편하게 지켜보세요. 새 대화를 기다리고 있어요.');
   // The shared engine has a minimum 2s read cadence, also for pagination.
   // Higher policy limits are communicated by Retry-After, not a client override.
   await readDelay(2000,controller.signal);
  }
 }catch{
  if(!owned())return;
  status('연결이 잠시 끊겼어요. 읽던 자리에서 다시 연결해요.');armRetry(state,controller);
 }
}
async function probeExpiry(state){
 if(active!==state||state.gone)return;
 cancel(state);const controller=new AbortController();state.controller=controller;
 const retry=response=>{state.expiryTimer=setTimeout(()=>{if(ownsResponse(state,controller,active))probeExpiry(state);},retryDelay(response,state.attempt++));};
 try{
  const result=await fetchJSON(state,'',controller);if(!ownsResponse(state,controller,active))return;
  if(!result.response.ok){if(!failState(state,result))retry(result.response);return;}
  else {state.attempt=0;metadata(state,result.data);}
 }catch{if(!ownsResponse(state,controller,active))return;status('연결이 잠시 끊겼어요. 읽던 자리에서 다시 연결해요.');retry();return;}
 if(!state.paused)start(state);
 // A paused client retries only the expiry check, without fetching new messages.
 else if(!state.gone)state.expiryTimer=setTimeout(()=>probeExpiry(state),15000);
}
function tab(name,focus=false){
 if(!active||active.gone)return;
 const y=scrollY;
 active.root.querySelectorAll('[data-tab]').forEach(e=>{const selected=e.dataset.tab===name;e.setAttribute('aria-selected',String(selected));e.tabIndex=selected?0:-1;if(selected&&focus)e.focus({preventScroll:true});});
 const feed=$('#feed');
 if(!$('#chat-panel').hidden){active.feedTop=feed.scrollTop;active.follow=feed.scrollHeight-feed.clientHeight-feed.scrollTop<=1;}
 $('#chat-panel').hidden=name!=='chat';$('#connect-panel').hidden=name!=='connect';
 if(name==='chat'){feed.scrollTop=active.follow?feed.scrollHeight:active.feedTop;active.viewer?.refresh();}
 scrollTo({top:y,behavior:'instant'});
}
function toast(text){clearTimeout(toastTimer);const e=document.querySelector('#toast');e.textContent=text;e.classList.add('visible');toastTimer=setTimeout(()=>e.classList.remove('visible'),3500);}
async function copy(state,url=state.url,selector='#shared-url'){
 try{await navigator.clipboard.writeText(url);if(active===state)toast('현재 링크를 복사했어요');}
 catch{if(active!==state)return;tab('connect');toast('자동 복사를 사용할 수 없어요. 링크를 길게 눌러 복사해주세요');$(selector).focus({preventScroll:true});}
}
function bind(state){
 const url=state.url;
 state.root.querySelector('#shared-url').textContent=url;
 state.root.querySelector('#markdown-link').href=url+'?format=md';
 state.root.querySelectorAll('[data-action=copy]').forEach(e=>e.addEventListener('click',()=>copy(state)));
 state.root.querySelector('[data-action=connect]').addEventListener('click',()=>tab('connect'));
 state.root.querySelectorAll('[data-tab]').forEach(e=>e.addEventListener('click',()=>tab(e.dataset.tab)));
 state.root.querySelector('[data-action=pause]').addEventListener('click',()=>{
  state.paused=!state.paused;cancel(state);
  const button=$('[data-action=pause]');button.innerHTML=icon(state.paused?'play':'pause');button.setAttribute('aria-label',state.paused?'대화 재개':'대화 일시정지');
  if(state.paused){status('대화를 잠시 멈췄어요. 읽던 자리를 그대로 두어요.');clock(state);}else start(state);
 });
}
function navigate(){
 commonHeader?.dispose();commonHeader=null;
 if(active){active.pageY=scrollY;cancel(active);if(active.mode==='public')leavePublic(active);else{active.viewer?.dispose();active.viewer=null;active.cursor=null;active.historyRequest=null;}}clearTimeout(toastTimer);
 document.querySelector('#toast').classList.remove('visible');active=null;
 const error=document.body.dataset.error;
 if(error){app.innerHTML=terminal(error);commonHeader=mountCommonHeader(app,{effects,navigate:move,route:location.pathname});return;}
 const resolved=resolveRoute(location.pathname);
 const connectionId=resolved?.routeId==='public-room'?new URLSearchParams(location.search).get('connect'):null;
 const nextKind=connectionId?'publicconnection':resolved?.screenId==='auth'?'auth':resolved?.routeId==='admin-settings'?'settings':resolved?.routeId==='admin-invitations'||resolved?.routeId==='admin-audit'?'adminlogs':resolved?.routeId==='rooms'?'rooms':resolved?.routeId==='account'?'account':resolved?.routeId==='claim'?'claim':resolved?.routeId==='new-room'?'newroom':null;
 if(surfaceKind!==nextKind){surface?.dispose();surface=null;surfaceKind=null;}
 if(nextKind==='publicconnection'){surface?.dispose();surface=mountPublicConnection(app,{effects,slug:resolved.params.slug,requestId:connectionId,navigate:move});surfaceKind='publicconnection';surface.load();previousPath=location.pathname;return;}
 if(nextKind==='auth'){
  const screen=resolved.routeId==='auth-verify'?'verify':resolved.routeId==='auth-signup'?'signup':'login';
  if(!surface){surface=mountAuth(app,{effects,navigate:move});surfaceKind='auth';surface.load(screen,previousPath);}else surface.enter(screen);
  previousPath=location.pathname;return;
 }
 if(nextKind==='settings'){
  const section=resolved.params.section||'overview';
  if(!surface){surface=mountSettings(app,{effects,section});surfaceKind='settings';surface.load();}else surface.enter(section);
  previousPath=location.pathname;return;
 }
 if(nextKind==='adminlogs'){
  surface?.dispose();surface=mountAdminLogs(app,{effects,section:resolved.routeId==='admin-invitations'?'invitations':'audit',navigate:move});surfaceKind='adminlogs';surface.load();previousPath=location.pathname;return;
 }
 if(nextKind==='newroom'){
  surface?.dispose();surface=mountNewRoom(app,{effects,navigate:move});surfaceKind='newroom';surface.load();previousPath=location.pathname;return;
 }
 if(nextKind==='claim'){
  surface?.dispose();surface=mountClaim(app,{effects,navigate:move,...resolved.params});surfaceKind='claim';surface.load();previousPath=location.pathname;return;
 }
 if(nextKind==='account'){
  if(!surface){surface=mountAccount(app,{effects,navigate:move});surfaceKind='account';}surface.load();previousPath=location.pathname;return;
 }
 if(nextKind==='rooms'){
  if(!surface){surface=mountLobby(app,{effects,navigate:move});surfaceKind='rooms';}surface.load();previousPath=location.pathname;return;
 }
 previousPath=location.pathname;
 if(resolved?.routeId==='public-room'){
  const grant=consumeFragment(location,history),key='public:'+resolved.params.slug;let state=states.get(key);
  if(!state){const root=document.createElement('div');root.innerHTML=room({ui:{route:location.pathname}});state=createPublicState(root,resolved.params.slug,location.origin+location.pathname,grant);states.set(key,state);bind(state);bindPublic(state,publicUI);}
  active=state;app.replaceChildren(state.root);commonHeader=mountCommonHeader(state.root,{effects,navigate:move,route:location.pathname});scrollTo({top:state.pageY,behavior:'instant'});if(!state.paused)start(state);return;
 }
 if(resolved?.routeId!=='private-room'){app.innerHTML=resolved?.screenId==='guide'?guide():introduction();commonHeader=mountCommonHeader(app,{effects,navigate:move,route:location.pathname});if(resolved?.routeId==='introduction')catalog(app);return;}
 const {id,cap}=resolved.params,key=id+':'+cap;let state=states.get(key);
 if(!state){
  const root=document.createElement('div');root.innerHTML=room();
  state={id,cap,url:location.origin+location.pathname,root,cursor:null,epoch:null,senders:new Map(),paused:false,gone:false,metadata:null,controller:null,attempt:0,retryTimer:null,expiryTimer:null,pageY:0,feedTop:0,follow:true};states.set(key,state);bind(state);
 }
 active=state;app.replaceChildren(state.root);commonHeader=mountCommonHeader(state.root,{effects,navigate:move,route:location.pathname});scrollTo({top:state.pageY,behavior:'instant'});
 if(state.paused)clock(state);else start(state);
}
document.addEventListener('click',e=>{
 const a=e.target.closest('a');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
 if(a.classList.contains('skip')){e.preventDefault();const main=document.querySelector('#content');main.setAttribute('tabindex','-1');main.focus();return;}
 const url=new URL(a.href);if(url.origin!==location.origin||url.search||url.hash)return;
 e.preventDefault();
 if(url.pathname.startsWith('/admin/design/')){if(surfaceKind==='settings')surface.requestLeave(()=>location.assign(url.pathname));else location.assign(url.pathname);return;}
 if(surfaceKind==='settings'&&resolveRoute(url.pathname)?.routeId!=='admin-settings'){surface.requestLeave(()=>move(url.pathname));return;}
 move(url.pathname);
});
document.addEventListener('keydown',e=>{
 if(!e.target.matches('[role=tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 e.preventDefault();tab(e.key==='Home'?'chat':e.key==='End'?'connect':e.target.dataset.tab==='chat'?'connect':'chat',true);
});
let confirmedPop=false;
window.addEventListener('popstate',()=>{
 if(confirmedPop){confirmedPop=false;navigate();return;}
 if(surfaceKind==='settings'&&resolveRoute(location.pathname)?.routeId!=='admin-settings'){
  // Restore the current entry while its unsaved draft is being considered.
  // The confirmed action traverses the original history once; cancel keeps it.
  history.pushState(null,'',previousPath);
  surface.requestLeave(()=>{confirmedPop=true;history.back();});return;
 }
 navigate();
});
window.addEventListener('pagehide',()=>{commonHeader?.dispose();commonHeader=null;if(active){cancel(active);if(active.mode==='public')leavePublic(active);else{active.viewer?.dispose();active.viewer=null;active.cursor=null;active.historyRequest=null;}}surface?.dispose();surface=null;surfaceKind=null;clearTimeout(toastTimer);});
window.addEventListener('pageshow',e=>{if(e.persisted)navigate();});
navigate();
