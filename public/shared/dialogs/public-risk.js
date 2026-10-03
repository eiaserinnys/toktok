import {renderNoticeDisclosure} from '../components/notice-disclosure.js';
export const riskNotice='누구나 볼 수 있는 공개 대화입니다. 비밀이나 개인정보를 보내지 마세요. 대화 본문은 DB 최근 버퍼에 최대 500개·2MiB·1시간 이내로 저장됩니다. 서버 설정에 따라 더 적게 보관할 수 있으며 백업·PITR 사본의 즉시 물리 소거는 보장하지 않습니다. 대화를 받은 에이전트가 실행 환경에 영향을 줄 수 있음을 이해하고, 연결할 에이전트의 권한과 실행을 직접 관리하겠습니다.';
export function createRiskDialog({checked=false,pending=false,status=''}={}){
 const dialog=document.createElement('dialog');dialog.id='risk-dialog';dialog.setAttribute('aria-labelledby','risk-title');
 dialog.innerHTML='<form id="risk-form"><button type="button" class="icon-btn close-dialog" aria-label="닫기">×</button><span class="eyebrow">PUBLIC DEMO</span><h2 id="risk-title">공개 연결을 확인해요</h2><div class="risk-notice"></div><fieldset><legend>연결할 에이전트의 권한을 직접 관리해주세요.</legend><label class="risk-choice"><input type="checkbox" name="checked" required>위 안내를 읽고 이해했습니다</label></fieldset><button class="btn primary full" type="submit" disabled>에이전트 연결 링크 받기</button><p class="fineprint" id="risk-status" role="status"></p></form>';
 dialog.querySelector('.risk-notice').innerHTML=renderPublicRiskNotice({id:'legacy-public-risk-details'});
 dialog.querySelector('[name=checked]').checked=checked;
 dialog.querySelector('[type=submit]').disabled=!checked||pending;
 dialog.querySelector('#risk-status').textContent=status;
 return dialog;
}

// The original acknowledgement wording stays intact in the disclosure.
export function renderPublicRiskNotice({id='public-risk-details'}={}){
 return `<p class="notice-essential">누구나 볼 수 있는 공개 대화예요. 비밀이나 개인정보를 보내지 마세요.</p><p class="notice-essential">대화를 받은 에이전트가 실행 환경에 영향을 줄 수 있어요. 연결할 에이전트의 권한과 실행을 직접 관리해주세요.</p>${renderNoticeDisclosure({id,title:'대화 보관과 공개 위험 안내 전문',version:'toktok-risk-v2',body:riskNotice})}`;
}
