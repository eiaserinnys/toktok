import {createCommonDialog} from './common-dialog.js';
import {escapeHtml as E} from '../components/auth-primitives.js';
import {icon} from '../components/common-room.js';
import {renderSettingField} from '../screens/settings.js';
export function createInvitationDialog({kind='invitation-create',field,ttl_seconds,invitation,code,pending=false,error,retryAt=0}={},document=globalThis.document){
 let content;
 if(kind==='invitation-created')content=`<span class="eyebrow">ONE NEW FRIEND</span><h2 id="xDialogTitle">가입 초대를 만들었어요.</h2><p>이 코드는 대소문자를 바꾸지 않고 전달해주세요. 가입 자격만 부여하며 이메일 확인이 필요해요. 닫거나 이동하면 원문을 다시 보여드릴 수 없어요.</p><div class="url-field"><code tabindex="0" id="oneTimeInvitation" aria-label="한 번만 보여주는 가입 초대 코드">${E(code)}</code><button type="button" class="icon-btn" data-x="copy-invitation" aria-label="가입 초대 코드 복사">${icon('copy')}</button></div><p class="fineprint">${E(invitation?.expires_at)} 만료</p><p id="invitationCopyStatus" role="status"></p><div class="x-button-row"><button type="button" class="btn primary" data-x="close-dialog">원문을 보관했어요 · 닫기</button></div>`;
 else content=`<span class="eyebrow">${kind==='invitation-create'?'ONE NEW FRIEND':'YOUR INVITATION'}</span><h2 id="xDialogTitle">${kind==='invitation-create'?'가입 초대를 만들까요?':'이 초대를 취소할까요?'}</h2><p>${kind==='invitation-create'?'명시적으로 발급하면 가입에 한 번 사용할 수 있는 초대 코드를 받아요. 원문은 이 화면에서만 보여요.':'사용 전 초대의 가입 자격을 취소해요. 이미 가입한 계정이나 연결된 에이전트의 권한을 취소하는 동작은 아니에요.'}</p>${kind==='invitation-create'&&field?renderSettingField(field,ttl_seconds,'invitation_ttl_seconds'):''}${error?`<p class="field-error" role="alert">${E(error)}</p>`:''}<div class="x-button-row"><button type="button" class="btn primary" data-x="confirm-invitation" ${pending||retryAt>Date.now()?'disabled':''}>${pending?'서버 응답을 기다려요…':kind==='invitation-create'?'가입 초대 발급':'가입 초대 취소'}</button><button type="button" class="btn soft" data-x="close-dialog" ${pending?'disabled':''}>돌아가기</button></div>`;
 return createCommonDialog(content,{pending},document);
}
