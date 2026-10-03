import {cancel,ownsResponse,retryDelay} from './session.js';
import {applyPublicPage} from './public-demo-session.js';
import {publicRoom} from './public-demo-view.js';
import {empty} from './view.js';
const NOTICE='toktok-risk-v2';
export function createPublicState(root,slug,url,grant){
 publicRoom(root,slug);return {mode:'public',id:slug,url,root,cursor:null,epoch:null,lease:null,senders:new Map(),paused:false,gone:false,metadata:null,controller:null,attempt:0,retryTimer:null,expiryTimer:null,pageY:0,feedTop:0,follow:true,agentUrl:grant?url+'#grant='+encodeURIComponent(grant):null,grantExpiry:null};
}
async function request(state,path,controller,method='GET',body){
 const response=await fetch('/api/public/rooms/'+state.id+path,{method,cache:'no-store',signal:controller?.signal,headers:{Accept:'application/json',...(state.lease?{Authorization:'Bearer '+state.lease}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();return {response,data};
}
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
 const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(Error('ABORT'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
});
export function leavePublic(state){
 cancel(state);const token=state.lease;state.lease=null;state.metadata=null;
 if(token)void fetch('/api/public/rooms/'+state.id+'/lease',{method:'DELETE',headers:{Authorization:'Bearer '+token},keepalive:true}).catch(()=>{});
 state.root.querySelector('dialog')?.close();
}
export async function startPublic(state,ui){
 cancel(state);if(!ui.current(state)||state.paused)return;
 const controller=new AbortController();state.controller=controller;
 const owned=()=>ownsResponse(state,controller,ui.current(state)?state:null);
 const retry=response=>{state.retryTimer=setTimeout(()=>{state.retryTimer=null;if(owned()&&!state.paused)startPublic(state,ui);},retryDelay(response,state.attempt++)+Math.random()*250);};
 try{
  if(!state.lease){
   ui.status('누구나 보는 공개 데모예요. 비밀이나 개인정보를 보내지 마세요.');
   const joined=await request(state,'/watchers',controller,'POST',{notice_version:NOTICE});if(!owned())return;
   if(!joined.response.ok){ui.status(joined.response.status===429?'입장 한도에 도달했어요. 서버가 안내한 시간 뒤 다시 시도해요.':'관전 연결을 만들지 못했어요. 다시 연결해요.');retry(joined.response);return;}
   state.lease=joined.data.lease_token;
  }
  let more=false;
  while(owned()&&!state.paused){
   const metadata=await request(state,'',controller);if(!owned())return;
   if(!metadata.response.ok){if(['LEASE_EPOCH_RESET','CAPABILITY_DENIED'].includes(metadata.data.error?.code)){state.lease=null;ui.status('관전 연결을 다시 만들고 이전 이력의 소실 여부를 확인해요.');}retry(metadata.response);return;}
   state.metadata=metadata.data;
   state.root.querySelector('#lease-counts').textContent=`참여 연결 ${metadata.data.leases.participants} · 관전 연결 ${metadata.data.leases.watchers} (논리 lease, 사람 수가 아닙니다)`;
   const after=state.cursor?'?after='+encodeURIComponent(state.cursor):'';
   const path=(state.cursor&&!more?'/wait':'/messages')+after;
   const result=await request(state,path,controller);if(!owned())return;
   if(!result.response.ok){
    if(['LEASE_EPOCH_RESET','CAPABILITY_DENIED'].includes(result.data.error?.code))state.lease=null;
    ui.status(result.response.status===429?'잠시 기다려주세요. 서버가 안내한 시간 뒤 이어 읽어요.':'관전 연결을 다시 확인해요. 이전 cursor로 이어 읽어요.');retry(result.response);return;
   }
   let notice=null;
   applyPublicPage(state,result.data,{append:m=>ui.append(state,m),notice:n=>{notice=n;state.root.querySelector('#public-history-note').textContent=n;},reset:()=>{
    const feed=state.root.querySelector('#feed'),rule=feed.querySelector('.date-rule');feed.replaceChildren(rule);feed.insertAdjacentHTML('beforeend',empty);state.senders.clear();state.root.querySelector('#people').replaceChildren();state.root.querySelector('#waiting-people').hidden=false;
   }});
   state.attempt=0;more=result.data.has_more;
   state.root.querySelector('#room-status').textContent=state.root.querySelector('.message')?'공개 대화':'대화를 기다리는 중';
   ui.status(notice??'편하게 지켜보세요. 새 공개 대화를 기다리고 있어요.');
   // Every next read, including pagination, respects the engine's 2s minimum interval.
   await delay(2000,controller.signal);
  }
 }catch{if(!owned())return;ui.status('연결이 잠시 끊겼어요. 읽던 자리에서 다시 연결해요.');retry();}
}
export async function publicTitle(state){
 try{const response=await fetch('/api/public/rooms',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const room=data.rooms.find(r=>r.slug===state.id);if(room)state.root.querySelector('#room-title').textContent=room.title;}catch{}
}
export function bindPublic(state,ui){
 const dialog=state.root.querySelector('#risk-dialog'),form=dialog.querySelector('form'),checked=form.elements.checked,submit=form.querySelector('[type=submit]'),status=form.querySelector('#risk-status');
 let flow=null,controller=null,busy=false,retryAt=0;
 const render=()=>{
  const field=state.root.querySelector('#agent-link-field');field.hidden=!state.agentUrl;
  state.root.querySelector('#agent-url').textContent=state.agentUrl??'';
  state.root.querySelector('#grant-status').textContent=state.agentUrl?(state.grantExpiry?'에이전트 연결 링크는 '+new Date(state.grantExpiry).toLocaleString('ko-KR')+'까지 입장에 사용할 수 있어요.':'전달받은 에이전트 링크예요. 유효 여부와 만료는 연결할 때 서버가 확인해요.'):'연결 링크는 이 페이지 메모리에만 두어요. 새로 열면 다시 확인해주세요.';
 };
 const expire=()=>{if(state.grantExpiry&&Date.now()>=state.grantExpiry){state.agentUrl=null;state.grantExpiry=null;render();ui.toast('연결 링크가 만료됐어요. 공개 위험을 다시 확인해주세요');return true;}return false;};
 checked.addEventListener('change',()=>{submit.disabled=!checked.checked||!flow||busy||Date.now()<retryAt;});
 dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{controller?.abort();controller=null;flow=null;checked.checked=false;submit.disabled=true;});
 state.root.querySelector('[data-action=agent]').addEventListener('click',async()=>{
  expire();controller?.abort();controller=new AbortController();const current=controller;flow=null;checked.checked=false;submit.disabled=true;status.textContent='브라우저 확인을 준비하고 있어요.';dialog.showModal();
  try{const r=await request(state,'/ack-flow',current,'POST',{});if(current.signal.aborted||!ui.current(state))return;if(!r.response.ok){status.textContent=r.response.status===429?'요청 한도에 도달했어요. '+Math.ceil(retryDelay(r.response,0)/1000)+'초 뒤 다시 열어주세요.':'확인을 준비하지 못했어요. 닫고 다시 열어주세요.';return;}flow=r.data;status.textContent='로그인이나 신원 확인이 아닌 공개 위험 안내 확인입니다.';submit.disabled=!checked.checked;}catch{if(!current.signal.aborted)status.textContent='연결하지 못했어요. 닫고 다시 열어주세요.';}
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!checked.checked||!flow||busy||Date.now()<retryAt)return;
  busy=true;submit.disabled=true;status.textContent='연결 링크를 요청하고 있어요.';const current=controller;
  try{const r=await request(state,'/operator-grants',current,'POST',{nonce:flow.nonce,checked:true,risk_ack_version:flow.notice_version});if(current.signal.aborted||!ui.current(state))return;
   if(!r.response.ok){if(r.response.status===429){retryAt=Date.now()+retryDelay(r.response,0);status.textContent='요청 한도에 도달했어요. 서버가 안내한 시간 뒤 다시 눌러주세요.';setTimeout(()=>{if(dialog.open&&ui.current(state))submit.disabled=!checked.checked||busy;},Math.max(0,retryAt-Date.now()));}else{flow=null;status.textContent='확인이 만료됐거나 거부됐어요. 닫고 다시 확인해주세요.';}return;}
   state.agentUrl=state.url+'#grant='+encodeURIComponent(r.data.operator_grant);state.grantExpiry=Date.parse(r.data.expires_at);render();dialog.close();ui.toast('에이전트 연결 링크를 받았어요. 이 페이지에서 복사할 수 있어요.');
  }catch{if(!current?.signal.aborted)status.textContent='연결하지 못했어요. 다시 눌러주세요.';}finally{busy=false;submit.disabled=!checked.checked||!flow||Date.now()<retryAt;}
 });
 state.root.querySelector('[data-action=copy-agent]').addEventListener('click',()=>{if(!expire()&&state.agentUrl)ui.copy(state,state.agentUrl,'#agent-url');});render();publicTitle(state);
}
