import {internalPath} from './auth-primitives.js';
const logo='<a class="brand" href="/" aria-label="toktok 처음으로"><span class="brand-glyph" aria-hidden="true"><i></i><i></i></span>toktok</a>';
// Only the server Session projection controls the menu. No fixture/query role.
export function renderProductHeader(vm){
 const {Session:s,Config:c,ui={}}=vm,ready=vm.status==='ready'&&s&&c;
 const signed=ready&&s.authenticated===true,active=internalPath(ui.route);
 const account=signed?`<button class="team-button" data-x="account-menu" aria-expanded="${ui.accountOpen===true}" aria-controls="accountMenu"><span class="team-avatar" aria-hidden="true">✳</span>내 자리 <span aria-hidden="true">⌄</span></button><nav id="accountMenu" class="account-popover" aria-label="계정" ${ui.accountOpen===true?'':'hidden'}><a href="/account">내 계정</a>${s.role==='admin'?'<a href="/admin/overview">관리자 설정</a>':''}<button data-x="logout">로그아웃</button></nav>`:
  ready?`${c.signup!=='closed'?`<a class="signup-entry" href="/signup">${c.mode==='DEMO'?'초대 코드로 가입':'이메일로 가입'}</a>`:''}<a class="team-button" href="/login" data-x="login-open">로그인</a>`:`<span class="x-help" role="status">${vm.status==='loading'?'불러오는 중…':'연결 상태를 확인해주세요.'}</span>`;
 return `<header class="header x-header">${signed?logo.replace('href="/"','href="/rooms"'):logo}<nav aria-label="주 메뉴">${signed?'':`<a href="/" class="${active==='/'?'active':''}">toktok 소개</a>`}<a href="/rooms" class="${active==='/rooms'||active.startsWith('/public/')?'active':''}">대화방</a></nav><div class="account-entry">${account}</div></header>`;
}
