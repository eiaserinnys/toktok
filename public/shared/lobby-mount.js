import {renderLobby} from './screens/lobby.js';
export function mountLobby(root,{effects,navigate}){
 let alive=true;
 const paint=vm=>{if(alive)root.innerHTML=renderLobby(vm);};
 const click=event=>{const button=event.target.closest('[data-x]');if(!button)return;
  if(button.dataset.x==='account-menu'){const menu=root.querySelector('#accountMenu');menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));}
  else if(button.dataset.x==='logout')effects.logout().then(()=>navigate('/')).catch(()=>{button.textContent='로그아웃하지 못했어요. 다시 시도해주세요.';});
 };
 root.addEventListener('click',click);
 return {async load(){paint({status:'loading'});try{const [Config,Session]=await Promise.all([effects.getConfig(),effects.getSession()]);paint({status:'ready',Config,Session});}catch{paint({status:'unavailable'});}},dispose(){alive=false;root.removeEventListener('click',click);}};
}
