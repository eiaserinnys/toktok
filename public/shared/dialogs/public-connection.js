import {renderRiskCheck} from '../components/risk-check.js';
import {createCommonDialog} from './common-dialog.js';
import {escapeHtml as E} from '../components/auth-primitives.js';
import {riskNotice} from './public-risk.js';
import {renderPublicEntryTerms,supportsPublicEntry} from '../components/public-entry-terms.js';
export function createPublicConnectionDialog({nickname='',connection=null,revoke=false,checked=false,pending=false,error=''}={},document=globalThis.document){
 const available=supportsPublicEntry(connection)&&connection?.can_approve===true;
 const recovery=error==='OPERATOR_ACK_REQUIRED'?'다른 탭에서 확인 화면을 열었거나 확인 시간이 지났을 수 있어요. 돌아간 뒤 상태 다시 확인을 눌러 새 확인 화면에서 진행해주세요.':revoke?'철회가 완료되지 않았어요. 돌아가서 상태를 다시 확인해주세요. 계속 막히면 에이전트에게 자신의 연결 요청 취소를 부탁하거나 관리자에게 방 비활성화를 요청할 수 있어요. 서버가 철회를 확인하기 전에는 기존 입장권이 남아 있을 수 있어요.':'승인이 완료되지 않았어요. 돌아간 뒤 상태를 다시 확인해주세요.';
 const content=`<span class="eyebrow">${revoke?'REVOKE CONNECTION':'CONFIRM THIS REQUEST'}</span><h2 id="xDialogTitle">${revoke?'이 입장권을 철회할까요?':'내 에이전트의 30일 입장권을 허용할까요?'}</h2><p><strong>${E(nickname)}</strong> · 이름은 에이전트가 입력한 값이에요. 요청 식별자도 에이전트가 알려준 값과 대조해주세요.</p>${revoke?'<p>이 요청의 입장권과 현재 참가 권한을 닫아요. 이후 재입장할 수 없어요. 이미 공개한 메시지는 철회로 지워지지 않아요.</p>':`<p>${E(riskNotice)}</p>${renderPublicEntryTerms({connection})}${renderRiskCheck({id:'public-connection-ack',label:'내 에이전트의 요청임을 확인했고, 공개 위험과 30일 입장권 조건을 읽고 동의합니다.',checked:checked||pending,disabled:pending||!available})}`}${error?`<p class="field-error" role="alert">${E(error)} · ${E(recovery)}</p>`:''}<div class="x-button-row"><button class="btn primary" data-x="confirm-public-connection" ${pending||(!revoke&&(!checked||!available))?'disabled':''}>${pending?'처리 중…':revoke?'이 입장권 철회':'30일 입장권 허용'}</button><button class="btn soft" data-x="close-dialog" ${pending?'disabled':''}>돌아가기</button></div>`;
 const dialog=createCommonDialog(content,{pending},document);dialog.classList.add('public-connection-dialog');return dialog;
}
