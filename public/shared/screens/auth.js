import {renderProductHeader} from '../components/header.js';
import {escapeHtml as E,internalPath,field,tag,notice} from '../components/auth-primitives.js';

// Structure/spacing are the approved authLayout; prototype accounts and OTPs
// are deliberately not imported. The live or isolated adapter supplies the VM.
function layout(content,vm,sideTitle='좋은 대화는,<br>작은 인사에서.',sideCopy='비밀번호 대신 이메일로.<br>내 자리로 가볍게 들어와요.'){
 return `${renderProductHeader(vm)}<main id="content" class="x-main x-wrap"><div class="auth-layout"><aside class="auth-aside"><span class="eyebrow">A PLACE TO SAY HELLO</span><h1>${sideTitle}</h1><p>${sideCopy}</p><img src="/assets/sculptures.webp" alt=""><span class="auth-aside-footer">a little closer, with every hello.</span></aside><section class="auth-card">${content}</section></div></main>`;
}
function invitation(vm){const ui=vm.ui??{};
 return layout(`<a href="/" class="x-back" data-x="auth-cancel">‹ toktok 소개로</a>${tag('초대 가입','peach')}<span class="eyebrow">YOUR INVITATION COMES FIRST</span><h2>건네받은 초대,<br>여기에 넣어주세요.</h2><p>DEMO 가입은 초대 코드 확인부터 시작해요.<br>확인한 다음 이메일로 내 자리를 만들어요.</p><ol class="signup-steps"><li aria-current="step">01 코드 확인</li><li>02 이메일 확인</li><li>03 가입 완료</li></ol><form id="inviteCodeForm">${field('초대 코드','inviteCode',ui.inviteCode,'id="inviteCode" required autocomplete="off" spellcheck="false" placeholder="받은 초대 코드를 붙여넣어주세요" autocapitalize="none" aria-describedby="inviteCodeHelp"'+(ui.inviteError?' aria-invalid="true"':''))}<p id="inviteCodeHelp" class="x-help">받은 초대 코드를 그대로 붙여넣어주세요.</p>${ui.inviteError?`<div class="field-error" role="alert">${E(ui.inviteError)}</div>`:''}<button id="checkInviteCode" class="btn primary full" type="submit" ${!ui.inviteCode?.trim()||ui.pending?'disabled':''}>초대 코드 확인하기</button></form><p class="auth-foot">이미 가입했나요? <a href="/login">로그인</a></p><p class="auth-policy">초대 링크만으로 가입이 완료되지 않아요. 이메일 OTP 확인이 필요해요. 공개·익명 방의 본문은 DB에 보관하지 않아요.</p>`,vm,'내 자리의 시작은,<br>작은 초대에서.','코드 확인, 이메일 확인.<br>한 단계씩 편안하게.');
}
function email(signup,vm){const ui=vm.ui??{},mode=vm.Config.mode;
 return layout(`<a href="${E(internalPath(ui.cancelReturn))}" class="x-back" data-x="auth-cancel">‹ 돌아가기</a>${tag(mode)}<span class="eyebrow">${signup?'MAKE YOURSELF AT HOME':'WELCOME BACK'}</span><h2>${signup?'내 자리를<br>만들어볼까요?':'다시 만나서<br>반가워요.'}</h2><p>${signup?'이메일을 확인하면 시작할 수 있어요.':'이메일로 인증번호를 요청할게요.'}</p>${signup&&mode==='DEMO'?notice('가입 초대가 확인됐어요','이메일 인증을 마치면 이 초대는 사용 완료돼요.'):''}<form id="xAuthForm">${field('이메일 주소','email',ui.email,'type="email" required autocomplete="email" placeholder="hello@example.com"')} ${ui.authError?`<div class="field-error" role="alert">${E(ui.authError)}</div>`:''}<button class="btn primary full" type="submit" ${ui.pending?'disabled':''}>인증번호 받기</button></form><p class="auth-foot">${signup?'이미 내 자리가 있나요? <a href="/login">로그인</a>':vm.Config.signup==='closed'?'':`처음 오셨나요? <a href="/signup">${mode==='DEMO'?'초대로 가입하기':'이메일로 가입하기'}</a>`}</p><div class="auth-policy">${E(mode)} · 새 방의 대화 보관은 기본으로 꺼져 있어요. 서버가 허용하는 계정만 생성할 때 직접 선택할 수 있어요.</div>`,vm);
}
function verify(vm){const ui=vm.ui??{},challenge=ui.challenge;
 if(!challenge?.flow||!challenge?.nonce||!challenge?.expires_at)return layout('<span class="eyebrow">ONE STEP AT A TIME</span><h2>이메일 확인부터<br>시작해주세요.</h2><p>진행 중인 인증 요청이 없어요.</p><a href="/login" class="btn primary full" data-x="login-open">이메일 입력하기</a>',vm);
 const left=Math.max(0,Math.ceil(ui.retryAfter??0));
 return layout(`<a href="${ui.purpose==='signup'?'/signup':'/login'}" class="x-back" data-x="auth-change-email">‹ 이메일 바꾸기</a><span class="eyebrow">ONE SMALL CHECK</span><h2>메일함에,<br>작은 노크.</h2><p><strong>${E(ui.email)}</strong>로<br>인증번호 발송을 요청했어요.</p><form id="xVerifyForm"><label class="x-field">인증번호<input id="xOtp" name="otp" class="otp-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required aria-describedby="otpHint ${ui.otpError?'otpError':''}" ${ui.otpError?'aria-invalid="true"':''}></label><small id="otpHint" class="x-help">요청 유효시간: ${E(challenge.expires_at)}</small>${ui.otpError?`<div id="otpError" class="field-error" role="alert">${E(ui.otpError)}</div>`:''}<button class="btn primary full" type="submit" ${ui.pending?'disabled':''}>${ui.purpose==='signup'?'확인하고 가입하기':'확인하고 들어가기'}</button></form><button class="resend-button" id="xResend" data-x="resend" ${left||ui.pending?'disabled':''}>${left?`${left}초 후 다시 요청할 수 있어요`:'인증번호 다시 요청하기'}</button><p class="fineprint">메일이 보이지 않으면 스팸함도 확인해주세요.<br>너무 잦은 발송은 잠시 기다려야 할 수 있어요.</p>`,vm,'똑똑.<br>이메일의 주인을<br>확인하고 있어요.','잠깐의 확인으로,<br>다음 인사가 더 편해져요.');
}
export function renderAuth(screen,vm){
 if(vm.status!=='ready'||!vm.Config||!['DEMO','HOSTED'].includes(vm.Config.mode))return layout(`<span class="eyebrow">ONE STEP AT A TIME</span><h2>${vm.status==='loading'?'불러오는 중이에요.':'지금 연결할 수 없어요.'}</h2><p role="status">${vm.status==='loading'?'서버의 가입·계정 상태를 확인하고 있어요.':'설정을 가져오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.'}</p>`,vm);
 if(screen==='verify')return verify(vm);
 if(screen==='signup'){
  if(vm.Config.signup==='closed')return layout('<h2>가입은 잠시<br>쉬고 있어요.</h2><p>이미 가입한 계정은 로그인할 수 있어요.</p><a href="/login" class="btn primary full">로그인</a>',vm);
  if(vm.Config.signup==='invite'&&vm.ui?.invitation?.valid!==true)return invitation(vm);
  return email(true,vm);
 }
 if(screen==='login')return email(false,vm);
 throw Error('UNKNOWN_AUTH_SCREEN');
}
