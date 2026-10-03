import {createClaimController} from './claim-controller.js';
import {renderClaim} from './screens/claim.js';
import {mountAuth} from './auth-mount.js';
export function mountClaim(root,{effects,id,cap,navigate}){
 let auth=null,bearer=cap;
 const controller=createClaimController({id,cap,effects,navigate,paint:vm=>{if(auth)return;const active=root.contains(document.activeElement)?{id:document.activeElement.id,action:document.activeElement.dataset.x}:null,top=window.scrollY;root.innerHTML=renderClaim(vm);if(active){const target=active.id?document.getElementById(active.id):[...root.querySelectorAll('[data-x]')].find(x=>x.dataset.x===active.action);target?.focus({preventScroll:true});}window.scrollTo({top,behavior:'instant'});}});
 const click=event=>{if(auth)return;const action=event.target.closest('[data-x]')?.dataset.x;
  if(action==='logout')controller.logout();
  else if(action==='approve-claim')controller.approve();
  else if(action==='claim-login'&&!auth){auth=mountAuth(root,{effects,claim:{id,cap:bearer},navigate:path=>{
    if(['/verify','/login'].includes(path))auth.enter(path==='/verify'?'verify':'login');else navigate(path);
   },onVerified:()=>{auth.dispose();auth=null;controller.load();}});auth.load('login','/rooms');}
  else if(action==='account-menu'){const menu=root.querySelector('#accountMenu');if(menu){menu.hidden=!menu.hidden;event.target.closest('[data-x]').setAttribute('aria-expanded',String(!menu.hidden));}}
 };
 const change=event=>{if(event.target.id==='claimRisk')controller.setChecked(event.target.checked);};
 root.addEventListener('click',click);root.addEventListener('change',change);
 return {load:controller.load,dispose(){controller.dispose();auth?.dispose();auth=null;bearer=null;root.removeEventListener('click',click);root.removeEventListener('change',change);}};
}
