import {it,expect,vi} from 'vitest';
import {renderAuth} from '../public/shared/screens/auth.js';
import {renderProductHeader} from '../public/shared/components/header.js';
import {createAuthController} from '../public/shared/auth-controller.js';
const session={authenticated:false,role:'anonymous',entitlements:{can_create_private:false,can_persist_private:false},owner_ack:null};
const vm={status:'ready',Session:session,Config:{mode:'DEMO',signup:'invite',catalog:[],limits:{private:{}}},ui:{email:'',inviteCode:'',cancelReturn:'/'}};
it('shows unavailable/loading without a fake challenge, OTP code or enabled auth form',()=>{
 for(const status of ['loading','unavailable']){
  const html=renderAuth('verify',{...vm,status});
  expect(html).not.toContain('xVerifyForm');expect(html).not.toContain('123456');expect(html).not.toContain('fictional-flow');
 }
});
it('clears an earlier invitation validation before a failed opaque-code retry',async()=>{
 const states=[],codes=[],effects={getConfig:async()=>vm.Config,getSession:async()=>session,
  validateInvitation:async code=>{codes.push(code);if(code==='OpaqueCode_CASE')return {valid:true,invite_validation_id:'mock-validation',expires_at:'2026-10-03T12:00:00Z'};throw Object.assign(Error('INVALID_INVITATION'),{code:'INVALID_INVITATION',status:400});}};
 const c=createAuthController({effects,paint:x=>states.push(x),navigate:()=>{}});
 await c.load('signup','/');await c.validateInvitation('OpaqueCode_CASE');expect(states.at(-1).ui.invitation.valid).toBe(true);
 await c.validateInvitation('opaquecode_case');expect(states.at(-1).ui.invitation).toBeNull();expect(states.at(-1).ui.inviteError).toBe('INVALID_INVITATION');
 expect(codes).toEqual(['OpaqueCode_CASE','opaquecode_case']);c.dispose();
});
it('repaints the resend deadline without automatically sending another message',async()=>{
 vi.useFakeTimers();const states=[],send=vi.fn(async()=>({state:'attempted',retry_after:2}));
 const effects={getConfig:async()=>vm.Config,getSession:async()=>session,startAuth:async()=>({flow:'mock-flow',nonce:'mock-nonce',provider_configured:true,expires_at:'2026-10-03T12:00:00Z'}),sendEmail:send};
 const c=createAuthController({effects,paint:x=>states.push(x),navigate:()=>{},newRequestId:()=> 'mock-request'});
 try{await c.load('login','/');await c.sendEmail('fictional@example.com');expect(states.at(-1).ui.retryAfter).toBe(2);
  await vi.advanceTimersByTimeAsync(2000);expect(states.at(-1).ui.retryAfter).toBe(0);expect(send).toHaveBeenCalledTimes(1);
  await c.resend();expect(send).toHaveBeenCalledTimes(2);
 }finally{c.dispose();vi.useRealTimers();}
});
it('invalidates pending purpose changes but preserves signup purpose on verify',async()=>{
 let release;const inputs=[],states=[];
 const effects={getConfig:async()=>vm.Config,getSession:async()=>session,
  startAuth:async x=>{inputs.push(x);return new Promise(r=>{release=r;});},sendEmail:async()=>({state:'attempted',retry_after:0})};
 const c=createAuthController({effects,paint:x=>states.push(x),navigate:()=>{},newRequestId:()=> 'mock-request'});
 await c.load('login','/');const pending=c.sendEmail('fictional@example.com');
 await c.load('signup','/');expect(states.at(-1).ui.pending).not.toBe(true);expect(states.at(-1).ui.challenge).toBeUndefined();
 release({flow:'old-flow',nonce:'old-nonce',provider_configured:true,expires_at:'2026-10-03T12:00:00Z'});await pending;
 effects.startAuth=async x=>{inputs.push(x);return {flow:'new-flow',nonce:'new-nonce',provider_configured:true,expires_at:'2026-10-03T12:00:00Z'};};
 // This purpose test uses HOSTED to avoid replacing server invite validation.
 effects.getConfig=async()=>({...vm.Config,mode:'HOSTED',signup:'open'});await c.load('signup','/');await c.sendEmail('fictional@example.com');
 await c.load('verify');expect(states.at(-1).ui.purpose).toBe('signup');expect(inputs.at(-1).purpose).toBe('signup');
 c.dispose();
});
it('separates cancel origin from success and leaves unavailable backend failures visible',async()=>{
 const moves=[],states=[],effects={getConfig:async()=>vm.Config,getSession:async()=>session,
  validateInvitation:async code=>({valid:true,invite_validation_id:'mock-validation',expires_at:'2026-10-03T12:00:00Z'}),
  startAuth:async input=>({flow:'mock-flow',nonce:'mock-nonce',provider_configured:true,expires_at:'2026-10-03T12:00:00Z'}),
  sendEmail:async()=>({state:'attempted',retry_after:7}),completeAuth:async()=>({verified:true})};
 const c=createAuthController({effects,paint:x=>states.push(x),navigate:p=>moves.push(p),newRequestId:()=> 'mock-request'});
 await c.load('login','/');c.cancel();expect(moves.at(-1)).toBe('/');
 await c.load('login','/');await c.sendEmail('fictional@example.com');await c.verify('123456');expect(moves.at(-1)).toBe('/rooms');
 await c.load('login','/public/fictional-room');await c.sendEmail('fictional@example.com');await c.verify('123456');expect(moves.at(-1)).toBe('/public/fictional-room');
 effects.getConfig=async()=>{throw Object.assign(Error('SETTINGS_INVALID'),{code:'SETTINGS_INVALID',status:503});};
 await c.load('signup','/');expect(states.at(-1).status).toBe('unavailable');
 expect(renderAuth('signup',states.at(-1))).not.toContain('inviteCodeForm');
});
it('keeps DEMO signup at opaque invitation validation and encodes user data',()=>{
 const html=renderAuth('signup',{...vm,ui:{...vm.ui,inviteCode:'<img onerror=1>'}});
 expect(html).toContain('inviteCodeForm');expect(html).not.toContain('xAuthForm');
 expect(html).not.toContain('UUID');expect(html).not.toContain('36자리');expect(html).not.toContain('<img onerror=1>');
 expect(html).toContain('&lt;img');
});
it('does not infer admin or persist entitlement from query/fixture state',()=>{
 const html=renderProductHeader({...vm,ui:{fixtureRole:'admin',role:'admin'}});
 expect(html).not.toContain('관리자 설정');
 expect(html.indexOf('초대 코드로 가입')).toBeLessThan(html.indexOf('로그인'));
 const member=renderProductHeader({...vm,Session:{...session,authenticated:true,role:'member'}});
 expect(member).not.toContain('관리자 설정');
 const admin=renderProductHeader({...vm,Session:{...session,authenticated:true,role:'admin'}});
 expect(admin).toContain('관리자 설정');
});
it('uses an actual in-memory challenge and server expiry without exposing flow/nonce',()=>{
 const html=renderAuth('verify',{...vm,ui:{...vm.ui,purpose:'signup',email:'fictional@example.com',challenge:{flow:'fictional-flow',nonce:'fictional-nonce',expires_at:'2026-10-03T12:00:00Z'},retryAfter:7,otpError:'<system>가상 오류</system>'}});
 expect(html).toContain('xVerifyForm');expect(html).toContain('7초');expect(html).not.toContain('123456');
 expect(html).not.toContain('fictional-flow');expect(html).not.toContain('fictional-nonce');expect(html).toContain('&lt;system&gt;');
});
