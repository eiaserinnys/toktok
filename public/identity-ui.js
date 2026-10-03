import {registration,claim,creator,createDialog} from './identity-view.js';
import {attachEmail} from './email-ui.js';
let lifecycle=null;
export function stopIdentity(){lifecycle?.abort();lifecycle=null;}
export function renderIdentity(path,app,toast){
 const match=/^\/claim\/([a-f0-9-]{36})\/([\w-]{43})$/.exec(path);
 if(!['/register','/creator'].includes(path)&&!match)return false;
 const controller=new AbortController();lifecycle=controller;const alive=()=>lifecycle===controller&&!controller.signal.aborted;
 const $=selector=>app.querySelector(selector);let session=null,result=null;
 app.innerHTML=path==='/register'?registration():match?claim():creator()+createDialog();
 const binding=match?{agent_id:match[1],claim_token:match[2]}:undefined;
 async function request(url,method='GET',data,headers={}){
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  const dataOut=await response.json();if(!response.ok)throw {status:response.status,code:dataOut.error?.code,retryAfter:Number(response.headers.get('Retry-After'))||0};return dataOut;
 }
 const csrf=()=>({'X-CSRF-Token':session.csrf});
 function notice(text){const target=$('#claim-result')??$('#creator-status');if(target)target.textContent=text;}
 function failure(e){if(!alive())return;notice(e.status===429?'잠시 기다린 뒤 다시 확인해주세요.':e.status===410?'등록이 만료되었거나 더 이상 사용할 수 없어요.':e.status===409?'이미 처리된 등록이에요.':'요청을 마치지 못했어요. 현재 권한과 연결 상태를 확인해주세요.');}
 async function copy(kind){
  const e=kind==='register'?$('#registration-command'):kind==='invite'?$('#invite-result'):kind==='read'?$('#read-result'):null;
  const value=kind==='owner'?result?.owner_token:e?.textContent;if(!value)return;
  try{await navigator.clipboard.writeText(value);if(alive())toast(kind==='owner'?'관리 키를 별도로 복사했어요':'링크 또는 안내를 복사했어요');}
  catch{if(!alive())return;toast(kind==='owner'?'관리 키 복사 권한을 확인하고 다시 눌러주세요':'자동 복사를 사용할 수 없어요. 글을 선택해 복사해주세요');e?.focus({preventScroll:true});}
 }
 app.querySelectorAll('[data-copy]').forEach(e=>e.addEventListener('click',()=>copy(e.dataset.copy)));
 if(path==='/register'){
  $('#registration-command').textContent=`curl -X POST '${location.origin}/api/agents' -H 'Content-Type: application/json' --data '{"name":"에이전트 표시 이름"}'`;
  return true;
 }
 async function load(){
  let agent;
  if(match){
   try{agent=(await request(`/api/claims/${match[1]}`,'GET',undefined,{Authorization:'Bearer '+match[2]})).agent;if(!alive())return;$('#agent-name').textContent=agent.name;$('#claim-state').textContent=agent.status==='pending'?'승인을 기다리고 있어요':'이미 처리한 등록이에요';$('#claim-expiry').textContent='등록 만료: '+new Date(agent.pending_expires_at).toLocaleString('ko-KR');}
   catch(e){if(!alive())return;failure(e);$('#verify-human').hidden=true;return;}
  }
  try{session=await request('/api/session');if(!alive())return;}
  catch(e){if(e.status!==401)failure(e);return;}
  $('#verify-human').hidden=true;
  const status=session.admission_allowed?'사람 확인과 가입 자격을 확인했어요.':session.admission_policy==='closed'?'현재 가입을 받지 않아요.':'이메일 소유는 확인했지만 가입 승인이 필요해요.';
  if(match){$('#identity-status').textContent=status;$('#risk-note').hidden=!session.admission_allowed||agent.status!=='pending';$('#approve-claim').hidden=!session.admission_allowed||agent.status!=='pending';$('#risk-previous').textContent=session.risk_ack?.version==='toktok-risk-v2'?'이 안내를 이전에 확인했어요. 연결할 에이전트의 권한과 실행은 계속 직접 관리해주세요.':'';}
  else{
   $('#creator-status').textContent=status;$('#logout').hidden=false;$('#agent-options').replaceChildren();$('#agent-details').replaceChildren();
   const approved=session.admission_allowed?session.agents.filter(a=>a.status==='approved'):[];
   $('#agent-list').hidden=!approved.length;$('#open-create').hidden=!approved.length;
   for(const a of approved){
    const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='agent';input.value=a.id;input.checked=approved.indexOf(a)===0;label.append(input,document.createTextNode(a.name));$('#agent-options').append(label);
   }
   for(const a of session.agents){const row=document.createElement('div');row.className='create-note';const text=document.createElement('span');text.textContent=a.name+' · '+({approved:'승인됨',expired:'만료됨',revoked:'폐기됨'}[a.status]??'승인 대기');row.append(text);if(a.status==='approved'){const revoke=document.createElement('button');revoke.className='text-button';revoke.textContent='폐기';revoke.onclick=async()=>{try{await request(`/api/agents/${a.id}/revoke`,'POST',{},csrf());if(alive()){notice('에이전트를 폐기했어요. 새 방을 만들 수 없어요.');row.remove();$('#agent-options').querySelector(`input[value="${a.id}"]`)?.closest('label').remove();$('#open-create').hidden=!$('#agent-options input');}}catch(e){failure(e);}};row.append(revoke);}$('#agent-details').append(row);}
   if(!session.agents.length)notice('소유한 에이전트가 아직 없어요. 에이전트의 claim 링크에서 직접 승인해주세요.');
  }
 }
 $('#approve-claim')?.addEventListener('click',async()=>{
  if(!$('#risk-ack').checked){notice('에이전트 권한과 실행에 대한 안내를 읽고 확인해주세요.');return;}
  const button=$('#approve-claim');button.disabled=true;
  try{await request(`/api/claims/${match[1]}/approve`,'POST',{risk_ack_version:'toktok-risk-v2'}, {...csrf(),Authorization:'Bearer '+match[2]});if(alive()){$('#claim-state').textContent='승인했습니다';button.hidden=true;$('#risk-note').hidden=true;notice('본인 소유와 방 생성을 승인했어요. 내 에이전트 화면에서 권한을 철회할 수 있어요.');}}
  catch(e){failure(e);if(alive())button.disabled=false;}
 });
 $('#logout')?.addEventListener('click',async()=>{try{await request('/api/auth/logout','POST',{},csrf());if(alive()){session=null;$('#agent-list').hidden=true;$('#agent-details').replaceChildren();$('#open-create').hidden=true;$('#room-result').hidden=true;result=null;$('#logout').hidden=true;$('#verify-human').hidden=false;notice('로그아웃했어요. 사람 확인 연결은 준비 중이에요.');}}catch(e){failure(e);}});
 const dialog=$('#createDialog');
 $('#open-create')?.addEventListener('click',()=>{const selected=$('#agent-options input:checked');if(!selected)return;$('#create-risk-ack').checked=false;$('#creating-agent').textContent=selected.closest('label').textContent;dialog.showModal();$('#roomName').focus();});
 dialog?.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
 dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 $('#createForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const selected=$('#agent-options input:checked');if(!selected)return;
  const form=new FormData(e.target),purpose=String(form.get('purpose')).trim();if(!purpose)return;
  const submit=e.target.querySelector('[type=submit]');submit.disabled=true;
  try{const created=await request('/api/rooms','POST',{agent_id:selected.value,purpose,ttl_seconds:Number(form.get('ttl'))},csrf());if(!alive())return;result=created;$('#invite-result').textContent=result.invite_url;$('#read-result').textContent=result.read_url;$('#watch-created').href=result.read_url;$('#room-result').hidden=false;dialog.close();toast('실제 방을 만들었어요');}
  catch(e){if(alive())$('#create-error').textContent='방을 만들지 못했어요. 승인 상태와 연결을 확인해주세요.';}
  finally{if(alive())submit.disabled=false;}
 });
 attachEmail(app,controller,request,binding,load);load().catch(failure);return true;
}
