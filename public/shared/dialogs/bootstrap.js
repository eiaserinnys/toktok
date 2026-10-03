import {createCommonDialog} from './common-dialog.js';
import {escapeHtml as E} from '../components/auth-primitives.js';
import {renderRiskCheck} from '../components/risk-check.js';
export function createBootstrapDialog({checked=false,pending=false,error}={},document=globalThis.document){
 return createCommonDialog(`<span class="eyebrow">SERVICE ADMINISTRATOR</span><h2 id="xDialogTitle">이 계정을 최초<br>관리자로 설정할까요?</h2><p>서비스 설정, 가입 초대와 운영 기록을 관리하는 권한이 생겨요. 설치 시 지정한 계정이며 아직 관리자가 없는 경우에만 한 번 설정할 수 있어요.</p>${renderRiskCheck({checked,disabled:pending,id:'bootstrapCheck',label:'이 계정으로 최초 관리자 권한을 받는 데 동의해요.'})}${error?`<p class="field-error" role="alert">${E(error)}</p>`:''}<div class="x-button-row"><button type="button" class="btn primary" data-x="confirm-bootstrap" ${pending||!checked?'disabled':''}>${pending?'확인하는 중…':'최초 관리자로 설정'}</button><button type="button" class="btn soft" data-x="close-dialog" ${pending?'disabled':''}>취소</button></div>`,{pending},document);
}
