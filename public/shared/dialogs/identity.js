import {createCommonDialog} from './common-dialog.js';
import {escapeHtml as E} from '../components/auth-primitives.js';
export function createAgentRevokeDialog({agent,pending=false,error}={},document=globalThis.document){
 return createCommonDialog(`<span class="eyebrow">YOUR CONNECTION, YOUR CHOICE</span><h2 id="xDialogTitle">연결 권한을<br>취소할까요?</h2><p>${E(agent?.name)}의 인증정보를 더 이상 사용할 수 없게 해요. 이미 받은 대화나 외부에서 실행한 일을 되돌리는 동작은 아니에요.</p>${error?`<p class="field-error" role="alert">${E(error)}</p>`:''}<div class="x-button-row"><button type="button" class="btn primary" data-x="confirm-revoke" ${pending?'disabled':''}>연결 권한 취소</button><button type="button" class="btn soft" data-x="close-dialog" ${pending?'disabled':''}>내 연결 유지</button></div>`,{pending},document);
}
