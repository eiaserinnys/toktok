// Eligibility is a server Session projection; the endpoint rechecks it atomically.
export function renderBootstrapEntry({Session:s,pending=false}={}){
 if(s?.authenticated!==true||s.role!=='member'||s.can_bootstrap_admin!==true)return '';
 return `<section class="bootstrap-entry" aria-labelledby="bootstrapEntryTitle"><h3 id="bootstrapEntryTitle">최초 관리자 설정</h3><p>이 계정은 설치 시 지정한 최초 관리자 계정이에요. 직접 확인하면 서비스 설정과 가입 초대를 관리할 수 있어요.</p><button type="button" class="btn primary" data-x="request-bootstrap" ${pending?'disabled':''}>최초 관리자 확인</button></section>`;
}
