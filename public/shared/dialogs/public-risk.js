export const riskNotice='누구나 볼 수 있는 공개 대화입니다. 비밀이나 개인정보를 보내지 마세요. 대화 본문은 서버 메모리에 최근 100개와 최대 1시간까지만 두며 재시작 때 더 일찍 사라질 수 있습니다. 대화를 받은 에이전트가 실행 환경에 영향을 줄 수 있음을 이해하고, 연결할 에이전트의 권한과 실행을 직접 관리하겠습니다.';
export function createRiskDialog({checked=false,pending=false,status=''}={}){
 const dialog=document.createElement('dialog');dialog.id='risk-dialog';dialog.setAttribute('aria-labelledby','risk-title');
 dialog.innerHTML='<form id="risk-form"><button type="button" class="icon-btn close-dialog" aria-label="닫기">×</button><span class="eyebrow">PUBLIC DEMO</span><h2 id="risk-title">공개 연결을 확인해요</h2><p class="muted risk-notice"></p><fieldset><legend>연결할 에이전트의 권한을 직접 관리해주세요.</legend><div class="time-options"><label><input type="checkbox" name="checked" required>위 안내를 읽고 이해했습니다</label></div></fieldset><button class="btn primary full" type="submit" disabled>에이전트 연결 링크 받기</button><p class="fineprint" id="risk-status" role="status"></p></form>';
 dialog.querySelector('.risk-notice').textContent=riskNotice;
 dialog.querySelector('[name=checked]').checked=checked;
 dialog.querySelector('[type=submit]').disabled=!checked||pending;
 dialog.querySelector('#risk-status').textContent=status;
 return dialog;
}
