import {createAuthController} from './auth-controller.js';
import {renderAuth} from './screens/auth.js';

export function mountAuth(root,{effects,navigate}){
 let previousKey=null;
 const paint=vm=>{
  const key=vm.screen+':'+vm.ui.purpose+':'+(vm.ui.challenge?.flow??'');
  const retain=previousKey===key&&vm.status==='ready';
  const values=retain?new Map(Array.from(root.querySelectorAll('input[name]')).map(x=>[x.name,x.value])):new Map();
  const active=root.contains(document.activeElement)?{name:document.activeElement.name,action:document.activeElement.dataset.x,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
  root.innerHTML=renderAuth(vm.screen,vm);previousKey=key;
  for(const input of root.querySelectorAll('input[name]'))if(values.has(input.name))input.value=values.get(input.name);
  root.querySelector('#inviteCodeForm')?.addEventListener('submit',event=>{event.preventDefault();controller.validateInvitation(new FormData(event.currentTarget).get('inviteCode'));});
  root.querySelector('#xAuthForm')?.addEventListener('submit',event=>{event.preventDefault();controller.sendEmail(new FormData(event.currentTarget).get('email'));});
  root.querySelector('#xVerifyForm')?.addEventListener('submit',event=>{event.preventDefault();controller.verify(new FormData(event.currentTarget).get('otp'));});
  const code=root.querySelector('#inviteCode');code?.addEventListener('input',()=>{root.querySelector('#checkInviteCode').disabled=!code.value.trim()||vm.ui.pending;});
  for(const element of root.querySelectorAll('[data-x]'))element.addEventListener('click',event=>{
   const action=element.dataset.x;
   if(action==='auth-cancel'){event.preventDefault();controller.cancel();}
   else if(action==='auth-change-email'){event.preventDefault();controller.changeEmail();navigate(vm.ui.purpose==='signup'?'/signup':'/login');}
   else if(action==='resend')controller.resend();
   else if(action==='account-menu'){
    const menu=root.querySelector('#accountMenu');menu.hidden=!menu.hidden;element.setAttribute('aria-expanded',String(!menu.hidden));
   }
   else if(action==='logout')effects.logout().then(()=>navigate('/')).catch(()=>{element.textContent='로그아웃하지 못했어요. 다시 시도해주세요.';});
  });
  if(retain&&active){const target=Array.from(root.querySelectorAll('input,button,a')).find(x=>active.name?x.name===active.name:active.action&&x.dataset.x===active.action);if(target){target.focus({preventScroll:true});if(typeof active.start==='number'&&target.type!=='email')target.setSelectionRange?.(active.start,active.end);}}
 };
 const controller=createAuthController({effects,paint,navigate});
 return {load:controller.load,enter:controller.enter,dispose:controller.dispose};
}
