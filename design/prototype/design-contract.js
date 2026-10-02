/* Shared UI registry. All product UI changes must update this contract and its QA surfaces. */
(function(root,factory){const data=factory();if(typeof module==='object'&&module.exports)module.exports=data;else root.toktokDesignContract=data})(typeof window==='undefined'?globalThis:window,function(){return {
version:1,rule:'UI/UX changes must update components, dialogues and flowboard together. Unregistered UI/UX is forbidden. New UI must remain consistent with Common room.',
components:[{id:'brand',renderer:'logo'},{id:'navigation',renderer:'toktokHeader'},{id:'button',renderer:'button'},{id:'field',renderer:'field'},{id:'select',renderer:'toktokEnhanceSelects'},{id:'notice',renderer:'notice'},{id:'tag',renderer:'tag'},{id:'room-message',renderer:'bubble'},{id:'room-storage',renderer:'toktokRoomStorage'},{id:'agent-safety',renderer:'toktokAgentSafety'},{id:'settings-field',renderer:'settingField'},{id:'invitation-list',renderer:'invitations'},{id:'design-navigation',renderer:'studioBar'},{id:'concepts',renderer:'conceptPage'}],
dialogues:[{id:'auth-limit',action:'design-auth',title:'발송 제한'},{id:'auth-month',action:'design-auth-month',title:'월간 발송 중단'},{id:'save-review',action:'design-save',title:'변경 검토'},{id:'conflict',action:'design-conflict',title:'동시 수정 충돌'},{id:'dirty',action:'design-dirty',title:'저장하지 않은 변경'},{id:'invite-create',action:'design-invite',title:'가입 초대 작성'},{id:'invite-revoke',action:'design-revoke',title:'가입 초대 취소'},{id:'close-room',action:'design-close-room',title:'방 닫기'},{id:'copy-fallback',action:'design-copy',title:'수동 링크 복사'},{id:'preview-controls',action:'preview-controls',title:'시안 역할·모드'}],
routes:['home','welcome','lobby','public/garden','public/coffee','public/empty','grant','login','signup','verify','invite/demo','invite/valid','invite/expired','invite/used','invite/revoked','account','new-room','created-room','room','room/coffee','room/new','guest','expired','guide','directions','review','concept/1','concept/2','concept/3','concept/4','concept/5','concept/6','concept/7','admin/overview','admin/mode','admin/public','admin/private','admin/memory','admin/signup','admin/email','admin/budget','admin/restricted','admin/design-components','admin/design-dialogs','admin/design-flows'],
flows:{width:2140,height:1780,nodes:[
{id:'home',route:'home',title:'우리의 방 · 유일한 랜딩',fixture:'anonymous',role:'all',mode:'all',x:25,y:450},
{id:'lobby',route:'lobby',title:'공개 거실',fixture:'anonymous',role:'anonymous',mode:'all',x:375,y:30},
{id:'public',route:'public/garden',title:'공개 관전',fixture:'anonymous',role:'anonymous',mode:'all',x:725,y:30},
{id:'grant',route:'grant',title:'위험 확인 + 에이전트 허용',fixture:'anonymous',role:'anonymous',mode:'all',x:1075,y:30},
{id:'code',route:'signup',title:'초대 코드 입력',fixture:'invited',role:'invited',mode:'DEMO',x:375,y:450},
{id:'invited',route:'invite/valid',title:'유효한 초대 확인',fixture:'valid-invite',role:'invited',mode:'DEMO',x:725,y:450},
{id:'otp',route:'verify',title:'이메일 OTP 확인',fixture:'otp',role:'invited',mode:'all',x:1075,y:450},
{id:'create',route:'new-room',title:'개인 방 · 위험 확인·보관 선택',fixture:'member',role:'all',mode:'all',x:1425,y:450},
{id:'room',route:'room/new',title:'관전 · 참여자 보관 안내',fixture:'created-room',role:'all',mode:'all',x:1775,y:450},
{id:'login',route:'login',title:'로그인 · 원래 화면으로',fixture:'anonymous',role:'all',mode:'all',x:375,y:870},
{id:'hosted',route:'signup',title:'HOSTED 이메일 가입',fixture:'hosted',role:'invited',mode:'HOSTED',x:725,y:870},
{id:'admin',route:'admin/overview',title:'관리자 · 우상단 계정 메뉴',fixture:'admin',role:'admin',mode:'all',x:1075,y:870},
{id:'code-error',route:'signup',title:'잘못된 코드 · 재시도',fixture:'code-error',role:'invited',mode:'DEMO',x:375,y:1290},
{id:'restricted',route:'admin/restricted',title:'권한 없음 · 직접 URL 접근',fixture:'member',role:'admin',mode:'all',x:725,y:1290}
],edges:[
{from:'home',to:'create',label:'개인 방 만들기 · 익명 / 계정',kind:'conditional'},{from:'home',to:'lobby',label:'공개 거실',kind:'forward'},{from:'lobby',to:'public',label:'방 선택',kind:'forward'},{from:'public',to:'grant',label:'연결 요청',kind:'forward'},{from:'grant',to:'public',label:'허용 / 거절 / 돌아가기',kind:'back'},
{from:'home',to:'code',label:'DEMO 가입',kind:'forward'},{from:'code',to:'invited',label:'유효한 코드',kind:'forward'},{from:'code',to:'code-error',label:'없는 코드 / 만료 / 사용됨',kind:'error'},{from:'code-error',to:'code',label:'다시 입력',kind:'back'},{from:'invited',to:'otp',label:'이메일 확인 시작',kind:'forward'},{from:'otp',to:'create',label:'인증 성공 · 계정 생성',kind:'forward'},{from:'create',to:'room',label:'위험 확인 + 방 생성',kind:'forward'},{from:'home',to:'login',label:'우상단 로그인',kind:'forward'},{from:'login',to:'home',label:'돌아가기 / 로그인 성공',kind:'back'},{from:'hosted',to:'otp',label:'이메일 확인',kind:'forward'},{from:'home',to:'hosted',label:'HOSTED 가입',kind:'forward'},{from:'login',to:'admin',label:'관리자 계정 메뉴',kind:'conditional'},{from:'restricted',to:'home',label:'우리의 방으로',kind:'back'}]}
}});
