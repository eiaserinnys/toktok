/** One login flow; retrying a submit keeps its logical ID, explicit resend replaces it. */
export function attachEmail(app,controller,request,binding,onVerified){
 const $=s=>app.querySelector(s);let flow=null,logical=null,timer=null,remaining=0;
 const alive=()=>!controller.signal.aborted;
 controller.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
 const status=text=>{if(alive())$('#email-status').textContent=text;};
 function countdown(seconds){
  clearTimeout(timer);remaining=seconds;$('#resend-email').disabled=remaining>0;
  $('#resend-email').textContent=remaining?`다시 보내기 · 서버 요청 대기 ${remaining}초`:'다시 보내기';
  if(remaining)timer=setTimeout(()=>countdown(remaining-1),1000);
 }
 async function begin(){
  try{flow=await request('/api/auth/start','POST',binding?{claim:binding}:{});if(!alive())return;
   $('#email-auth').hidden=false;$('#verify-human').hidden=true;$('#email-address').focus({preventScroll:true});
   status(flow.provider_configured?'허용된 팀 이메일을 확인해요. 이메일은 로그인과 에이전트 소유 확인에 사용해요.':'사람 확인 연결을 준비하고 있어요. 운영 이메일 발송은 아직 연결되지 않았어요.');
  }catch(e){status(e.status===503?'사람 확인 연결을 준비하고 있어요.':'이메일 확인을 시작하지 못했어요.');}
 }
 async function send(){
  if(!flow)return;const email=$('#email-address').value;
  if(!logical)logical={flow_id:flow.flow,email,client_request_id:crypto.randomUUID()};
  const button=$('#send-email');button.disabled=true;status('인증 코드를 요청하고 있어요.');
  try{const result=await request('/api/auth/email/send','POST',logical);if(!alive())return;
   $('#otp-field').hidden=false;$('#verify-code').hidden=false;$('#resend-email').hidden=false;$('#otp-code').focus({preventScroll:true});
   $('#otp-expiry').textContent='확인 흐름 유효 시각: '+new Date(result.expires_at).toLocaleString('ko-KR');
   $('#email-accepted').textContent='허용된 주소라면 인증 코드를 보냈습니다. 발송 응답이 불확실하면 대기 후 직접 다시 요청해주세요.';
   status('코드가 도착하지 않으면 표시된 간격 후 직접 다시 요청해주세요.');
   countdown(result.retry_after);
  }catch(e){if(!alive())return;
   if(e.retryAfter)countdown(e.retryAfter);
   status(e.status===429?`주소·IP·전체 발송 한도 또는 재발송 간격으로 ${e.retryAfter}초 기다려야 해요.`:e.status===503?'발송 연결 또는 결과를 확인하지 못했어요. 예약된 시도는 취소되지 않아요. 대기 후 직접 다시 요청해주세요.':'확인 흐름이 만료되었거나 요청을 마치지 못했어요. 새 확인이 필요할 수 있어요.');
  }finally{if(alive())button.disabled=false;}
 }
 $('#verify-human').addEventListener('click',begin);
 $('#send-email').addEventListener('click',send);
 $('#email-address').addEventListener('input',()=>{if(logical&&$('#email-address').value!==logical.email)status('이미 요청한 주소예요. 다른 주소는 새 이메일 확인을 시작해주세요.');});
 $('#resend-email').addEventListener('click',()=>{if(remaining)return;logical=null;send();});
 $('#emailForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!flow)return;$('#verify-code').disabled=true;
  try{await request('/api/auth/complete','POST',{flow:flow.flow,nonce:flow.nonce,...(binding?{claim:binding}:{}),otp:$('#otp-code').value});if(!alive())return;
   clearTimeout(timer);$('#otp-code').value='';$('#email-auth').hidden=true;status('로그인했어요. 에이전트 승인은 별도로 직접 확인해주세요.');await onVerified();
  }catch(e){status(e.code==='OTP_INVALID'?'코드가 틀렸거나 만료·폐기되었어요. 5회 오입력하면 사용할 수 없어요.':'확인 흐름이 만료되었거나 이미 사용되었어요. 새 이메일 확인이 필요해요.');}
  finally{if(alive())$('#verify-code').disabled=false;}
 });
}
