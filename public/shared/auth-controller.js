import {internalPath} from './components/auth-primitives.js';

// Product and QA provide different effect ports. No fixture is imported here.
// Challenge, nonce and email stay in this instance's memory, never storage/URL.
export function createAuthController({effects,paint,navigate,newRequestId=()=>crypto.randomUUID(),claim,onVerified}){
 let claimBinding=claim?{id:claim.id,cap:claim.cap}:null;
 let vm={status:'loading',Session:null,Config:null,ui:{}},screen='login',generation=0;
 let cancelReturn='/',successReturn='/rooms',requestId=null,retryAt=0,retryTimer=null;
 const draw=()=>{if(retryAt)vm.ui.retryAfter=Math.max(0,Math.ceil((retryAt-Date.now())/1000));paint({...vm,screen,ui:{...vm.ui}});};
 function setRetry(seconds){
  clearTimeout(retryTimer);retryAt=Date.now()+Math.max(0,Number(seconds)||0)*1000;
  const tick=()=>{draw();if(Date.now()<retryAt)retryTimer=setTimeout(tick,Math.min(1000,retryAt-Date.now()));};
  if(retryAt>Date.now())retryTimer=setTimeout(tick,Math.min(1000,retryAt-Date.now()));
 }
 function clear(){clearTimeout(retryTimer);retryTimer=null;retryAt=0;vm.ui={};requestId=null;}
 function enter(next,origin){
  const purpose=claimBinding?'claim':next==='verify'?vm.ui.purpose:next==='signup'?'signup':'login';
  if(vm.ui.purpose&&purpose!==vm.ui.purpose){generation++;clear();}
  screen=next;
  if(origin!==undefined&&!['/login','/signup','/verify'].includes(origin)){
   cancelReturn=internalPath(origin);successReturn=['/','/about'].includes(cancelReturn)?'/rooms':cancelReturn;
  }
  vm.ui={...vm.ui,cancelReturn,purpose};
 }
 async function load(next,origin){
  enter(next,origin);const own=++generation;vm.ui.pending=false;vm.status='loading';draw();
  try{
   const [Config,Session]=await Promise.all([effects.getConfig(),effects.getSession()]);
   if(own!==generation)return;
   vm={...vm,status:'ready',Config,Session};draw();
  }catch(error){if(own!==generation)return;vm={...vm,status:'unavailable',Config:null,Session:null,error:{code:error.code??'UNAVAILABLE',status:error.status??null}};clear();draw();}
 }
 async function action(task,field){
  if(vm.status!=='ready'||vm.ui.pending)return;
  const own=generation;vm.ui.pending=true;vm.ui[field]='';draw();
  try{await task(()=>own===generation);}
  catch(error){if(own===generation){vm.ui[field]=error.code??'UNAVAILABLE';setRetry(error.retryAfter);}}
  finally{if(own===generation){vm.ui.pending=false;draw();}}
 }
 const api={
  load,
  enter:(next,origin)=>{enter(next,origin);draw();},
  validateInvitation:code=>action(async current=>{
   vm.ui.inviteCode=String(code).trim();
   vm.ui.invitation=null;
   const result=await effects.validateInvitation(vm.ui.inviteCode);if(!current())return;
   if(result.valid!==true||typeof result.invite_validation_id!=='string')throw Error('INVALID_INVITATION_RESPONSE');
   vm.ui.invitation={valid:true,invite_validation_id:result.invite_validation_id,expires_at:result.expires_at};
  },'inviteError'),
  sendEmail:email=>action(async current=>{
   const value=String(email).trim();
   if(vm.ui.challenge&&vm.ui.email!==value){vm.ui.challenge=null;requestId=null;}
   vm.ui.email=value;
   if(!vm.ui.challenge){
    const challenge=await effects.startAuth({purpose:vm.ui.purpose,
     ...(vm.ui.invitation?{invite_validation_id:vm.ui.invitation.invite_validation_id}:{}),
     ...(claimBinding?{claim_id:claimBinding.id,claim_token:claimBinding.cap}:{})});
    if(!current())return;
    if(!challenge.flow||!challenge.nonce||!challenge.expires_at)throw Error('INVALID_AUTH_RESPONSE');
    if(challenge.provider_configured!==true)throw Object.assign(Error('AUTH_PROVIDER_UNCONFIGURED'),{code:'AUTH_PROVIDER_UNCONFIGURED'});
    vm.ui.challenge={flow:challenge.flow,nonce:challenge.nonce,expires_at:challenge.expires_at};
   }
   requestId??=newRequestId();
   const result=await effects.sendEmail({flow:vm.ui.challenge.flow,email:value,client_request_id:requestId});if(!current())return;
   if(result.state!=='attempted')throw Error('INVALID_EMAIL_RESPONSE');
   setRetry(result.retry_after);screen='verify';navigate('/verify');
  },'authError'),
  verify:otp=>action(async current=>{
   const challenge=vm.ui.challenge;if(!challenge)throw Error('AUTH_FLOW_DENIED');
   const result=await effects.completeAuth({flow:challenge.flow,nonce:challenge.nonce,otp,...(claimBinding?{claim_id:claimBinding.id,claim_token:claimBinding.cap}:{})});if(!current())return;
   if(result.verified!==true)throw Error('INVALID_AUTH_RESPONSE');
   clear();if(onVerified)onVerified();else navigate(successReturn);
  },'otpError'),
  // Only an explicit action after Retry-After may start a new mail request.
  resend:()=>{if(Date.now()<retryAt||vm.ui.pending)return;requestId=null;return api.sendEmail(vm.ui.email);},
  cancel:()=>{generation++;clear();navigate(cancelReturn);},
  changeEmail:()=>{const purpose=vm.ui.purpose,invitation=vm.ui.invitation;generation++;clear();enter(purpose==='signup'?'signup':'login');vm.ui.invitation=invitation;draw();},
  dispose:()=>{generation++;clear();claimBinding=null;}
 };return api;
}
