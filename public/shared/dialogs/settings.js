import {escapeHtml as E,notice} from '../components/auth-primitives.js';

// Approved 736605b7 product dialog markup, parametrized with actual server
// revisions and draft changes. QA supplies these same parameters in memory.
export function renderSettingsReview({revision,changes=[],applicationNote,pending=false,error=''}={}){
 return `<span class="eyebrow">REVIEW YOUR CHANGES</span><h2 id="xDialogTitle">이렇게 바꿀까요?</h2><ul class="change-list">${changes.map(change=>`<li><span>${E(change.label)}</span><div><span>${E(change.before)}</span><b>${E(change.after)}</b></div></li>`).join('')}</ul>${notice('언제부터 바뀌나요?',applicationNote||'설정마다 적용 시점이 달라요. 각 항목의 안내를 확인해주세요.','peach')}<p>DB 설정 버전 ${Number.isSafeInteger(revision)?revision:'확인 필요'}를 기준으로 저장해요. 동시에 바뀐 내용이 있으면 덮어쓰지 않고 알려드려요.</p>${error?`<p class="field-error" role="alert">${E(error)}</p>`:''}<div class="x-button-row"><button type="button" class="btn primary" data-x="confirm-save" ${pending||!Number.isSafeInteger(revision)?'disabled':''}>${pending?'안전하게 저장 중…':'설정 저장하기'}</button><button type="button" class="btn soft" data-x="close-dialog" ${pending?'disabled':''}>돌아가서 수정</button></div>`;
}
export function renderSettingsConflict({baseRevision,latestRevision,changes=[]}={}){
 const value=v=>Number.isSafeInteger(v)?v:'확인 필요';
 return `<span class="eyebrow">LET'S KEEP BOTH THOUGHTS</span><h2 id="xDialogTitle">다른 관리자가<br>먼저 저장했어요.</h2><p>내 초안은 그대로 남겨뒀어요. 최신 설정을 확인한 뒤 다시 검토해주세요.</p><div class="conflict-comparison"><div><span>내가 시작한 버전</span><b>${value(baseRevision)}</b></div><div><span>서버의 최신 버전</span><b>${value(latestRevision)}</b></div></div><div class="change-list">${changes.map(change=>`<li><span>${E(change.label)}</span><div><span>내 초안 ${E(change.draft)}</span><b>최신 ${E(change.latest)}</b></div></li>`).join('')}</div><div class="x-button-row"><button type="button" class="btn primary" data-x="close-dialog">내 초안 유지하기</button><button type="button" class="btn soft" data-x="reload-settings">최신 설정 불러오기</button></div><p class="fineprint">불러오기를 선택하면 확인 후 초안을 버려요.</p>`;
}
export function renderSettingsReload({changedCount}={}){
 return `<h2 id="xDialogTitle">초안을 버리고<br>최신 설정을 볼까요?</h2><p>내 변경사항 ${Number.isSafeInteger(changedCount)?changedCount:'확인 필요'}개가 사라져요.</p><div class="x-button-row"><button type="button" class="btn primary" data-x="confirm-reload">최신 설정 불러오기</button><button type="button" class="btn soft" data-x="close-dialog">초안 유지</button></div>`;
}
export function createSettingsDialog(kind,params={},document=globalThis.document){
 const render={'settings-review':renderSettingsReview,'settings-conflict':renderSettingsConflict,'settings-reload':renderSettingsReload,'settings-leave':renderSettingsLeave}[kind];
 if(!render)throw Error('UNKNOWN_DIALOG');
 const dialog=document.createElement('dialog');dialog.className='x-dialog';dialog.setAttribute('aria-labelledby','xDialogTitle');
 dialog.innerHTML=`<button type="button" class="icon-btn x-dialog-close" data-x="close-dialog" aria-label="닫기">×</button>${render(params)}`;
 dialog.querySelector('.x-dialog-close').disabled=!!params.pending;
 dialog.addEventListener('cancel',event=>{if(params.pending)event.preventDefault();});
 dialog.tabIndex=-1;
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0&&x.getClientRects().length);
  const first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(!first){event.preventDefault();dialog.focus();}
  else if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!dialog.contains(active))){event.preventDefault();first.focus();}
 });
 return dialog;
}
export function renderSettingsLeave({changedCount}={}){
 return `<span class="eyebrow">A SMALL PAUSE</span><h2 id="xDialogTitle">변경한 설정을<br>두고 나갈까요?</h2><p>${Number.isSafeInteger(changedCount)?changedCount:'확인 필요'}개의 변경사항이 아직 저장되지 않았어요.</p><div class="x-button-row"><button type="button" class="btn primary" data-x="close-dialog">계속 수정하기</button><button type="button" class="btn soft" data-x="discard-leave">변경 버리고 나가기</button></div>`;
}
