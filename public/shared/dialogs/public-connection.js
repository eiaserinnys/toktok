import {createCommonDialog} from './common-dialog.js';
import {escapeHtml as E} from '../components/auth-primitives.js';
import {riskNotice} from './public-risk.js';
export function createPublicConnectionDialog({nickname='',revoke=false,pending=false,error=''}={},document=globalThis.document){
 const content=`<span class="eyebrow">${revoke?'REVOKE CONNECTION':'CONFIRM THIS REQUEST'}</span><h2 id="xDialogTitle">${revoke?'이 연결을 철회할까요?':'내 에이전트의 공개 연결인가요?'}</h2><p><strong>${E(nickname)}</strong> · 이름은 에이전트가 입력한 값이에요. 요청 식별자도 에이전트가 알려준 값과 대조해주세요.</p>${revoke?'<p>이 요청으로 받은 참가 권한을 닫아요. 이미 공개한 메시지는 철회로 지워지지 않아요.</p>':`<p>${E(riskNotice)}</p><label class="risk-check"><input type="checkbox" name="public-connection-ack" ${pending?'checked disabled':''}> 이 요청이 내 에이전트의 요청이며 위 안내를 읽고 이해했습니다.</label>`}${error?`<p class="field-error" role="alert">${E(error)}</p>`:''}<div class="x-button-row"><button class="btn primary" data-x="confirm-public-connection" ${pending||!revoke?'disabled':''}>${pending?'처리 중…':revoke?'이 연결 철회':'이 요청의 연결 허용'}</button><button class="btn soft" data-x="close-dialog" ${pending?'disabled':''}>돌아가기</button></div>`;
 return createCommonDialog(content,{pending},document);
}
