import {icon,room,terminal,introduction,guide,message,person} from './view.js';
import {applyPage,ownsResponse,retryDelay,cancel} from './session.js';
import {createPublicState,startPublic,bindPublic,leavePublic} from './public-demo.js';
import {catalog} from './public-demo-view.js';
import {consumeFragment} from './public-demo-session.js';
import {resolveRoute} from './shared/routes.js';
import {createLiveAdapter} from './effects/live-http.js';
import {mountAuth} from './shared/auth-mount.js';
import {mountSettings} from './shared/settings-mount.js';
import {mountAccount} from './shared/account-mount.js';
import {mountLobby} from './shared/lobby-mount.js';
const app=document.querySelector('#app'),states=new Map();
const effects=createLiveAdapter();
let active=null,toastTimer=null,surface=null,surfaceKind=null,previousPath='/';
function move(path){delete document.body.dataset.error;history.pushState(null,'',path);navigate();}
const $=(selector)=>active?.root.querySelector(selector);
function status(copy){const e=$('#watch-status');if(e)e.textContent=copy;}
function showTerminal(state,code){
 cancel(state);state.gone=true;state.root.innerHTML=terminal(code);state.cursor=0;state.senders.clear();
}
function clock(state){
 if(state.mode==='public')return;
 clearTimeout(state.expiryTimer);
 if(state.gone||!state.metadata||active!==state)return;
 const expires=new Date(state.metadata.room.expires_at),left=expires.getTime()-Date.now();
 const time=$('#expiry');time.dateTime=expires.toISOString();time.textContent=`${expires.toLocaleString('ko-KR')} 만료${left>0?` · ${Math.ceil(left/60000)}분 남음`:''}`;
 // The server decides expiry. Even a paused reader must lose expired content after ROOM_GONE.
 state.expiryTimer=setTimeout(()=>{if(left<=60000)probeExpiry(state);else clock(state);},Math.max(1,Math.min(left,60000)));
}
function metadata(state,data){
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
 const response=await fetch(`/api/rooms/${state.id}${path}`,{headers:{Authorization:`Bearer ${state.cap}`,Accept:'application/json'},cache:'no-store',signal:controller.signal});
 // No errors/URLs/bodies are logged or persisted.
 const data=await response.json();return {response,data};
}
function failState(state,result){
 const code=result.data?.error?.code;
 if(code==='ROOM_GONE'){showTerminal(state,code);return true;}
 if(code==='ROOM_CLOSED'){
  state.metadata.room.status='closed';metadata(state,state.metadata);status('대화가 종료됐어요. 이전 메시지는 계속 읽을 수 있어요.');$('#empty h2')?.replaceChildren(document.createTextNode('대화가 종료됐어요'));return true;
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
 const controller=new AbortController();state.controller=controller;
 const owned=()=>ownsResponse(state,controller,active);
 try{
  if(!state.metadata){
   const result=await fetchJSON(state,'',controller);if(!owned())return;
   if(!result.response.ok){if(!failState(state,result))armRetry(state,controller,result.response);return;}
   metadata(state,result.data);
  }else clock(state);
  let path=`/messages?after=${state.cursor}&limit=100`;
  while(owned()&&!state.paused){
   const result=await fetchJSON(state,path,controller);if(!owned())return;
   if(!result.response.ok){if(!failState(state,result))armRetry(state,controller,result.response);return;}
   applyPage(state,result.data,m=>append(state,m));state.attempt=0;
   state.metadata.room.status=result.data.room_status;
   if(result.data.room_status==='closed')metadata(state,state.metadata);
   $('#room-status').textContent=result.data.room_status==='closed'?'종료된 방':state.cursor?'대화 중':'대화를 기다리는 중';
   if(result.data.has_more){path=`/messages?after=${state.cursor}&limit=100`;continue;}
   if(result.data.room_status==='closed'){status('대화가 종료됐어요. 이전 메시지는 계속 읽을 수 있어요.');$('#empty h2')?.replaceChildren(document.createTextNode('대화가 종료됐어요'));return;}
   status('편하게 지켜보세요. 새 대화를 기다리고 있어요.');
   path=`/wait?after=${state.cursor}&limit=100&timeout=25`;
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
 if(name==='chat')feed.scrollTop=active.follow?feed.scrollHeight:active.feedTop;
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
 if(active){active.pageY=scrollY;cancel(active);if(active.mode==='public')leavePublic(active);}clearTimeout(toastTimer);
 document.querySelector('#toast').classList.remove('visible');active=null;
 const error=document.body.dataset.error;
 if(error){app.innerHTML=terminal(error);return;}
 const resolved=resolveRoute(location.pathname);
 const nextKind=resolved?.screenId==='auth'?'auth':resolved?.routeId==='admin-settings'?'settings':resolved?.routeId==='rooms'?'rooms':resolved?.routeId==='account'?'account':null;
 if(surfaceKind!==nextKind){surface?.dispose();surface=null;surfaceKind=null;}
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
 if(nextKind==='account'){
  if(!surface){surface=mountAccount(app,{effects,navigate:move});surfaceKind='account';}surface.load();previousPath=location.pathname;return;
 }
 if(nextKind==='rooms'){
  if(!surface){surface=mountLobby(app,{effects,navigate:move});surfaceKind='rooms';}surface.load();previousPath=location.pathname;return;
 }
 previousPath=location.pathname;
 if(resolved?.routeId==='public-room'){
  const grant=consumeFragment(location,history),key='public:'+resolved.params.slug;let state=states.get(key);
  if(!state){const root=document.createElement('div');root.innerHTML=room();state=createPublicState(root,resolved.params.slug,location.origin+location.pathname,grant);states.set(key,state);bind(state);bindPublic(state,publicUI);}
  active=state;app.replaceChildren(state.root);scrollTo({top:state.pageY,behavior:'instant'});if(!state.paused)start(state);return;
 }
 if(resolved?.routeId!=='private-room'){app.innerHTML=resolved?.screenId==='guide'?guide():introduction();if(location.pathname==='/')catalog(app);return;}
 const {id,cap}=resolved.params,key=id+':'+cap;let state=states.get(key);
 if(!state){
  const root=document.createElement('div');root.innerHTML=room();
  state={id,cap,url:location.origin+location.pathname,root,cursor:0,senders:new Map(),paused:false,gone:false,metadata:null,controller:null,attempt:0,retryTimer:null,expiryTimer:null,pageY:0,feedTop:0,follow:true};states.set(key,state);bind(state);
 }
 active=state;app.replaceChildren(state.root);scrollTo({top:state.pageY,behavior:'instant'});
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
window.addEventListener('pagehide',()=>{if(active){cancel(active);if(active.mode==='public')leavePublic(active);}surface?.dispose();surface=null;surfaceKind=null;clearTimeout(toastTimer);});
window.addEventListener('pageshow',e=>{if(e.persisted)navigate();});
navigate();
