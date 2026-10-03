import {createRoomController} from './newroom-controller.js';
import {renderNewRoom} from './screens/newroom.js';
import {createSelects} from './components/selects.js';
export function mountNewRoom(root,{effects,navigate}){
 const doc=root.ownerDocument,selects=createSelects(doc);let state,alive=true;
 const controller=createRoomController({effects,origin:doc.defaultView.location.origin,paint:vm=>{
  state=vm;const current=doc.activeElement,focused=root.contains(current)?{id:current.id,name:current.name,action:current.dataset.x,start:current.selectionStart,end:current.selectionEnd}:null,top=window.scrollY;
  selects.clear();root.innerHTML=renderNewRoom(vm);selects.enhance(root);
  if(focused){const target=focused.id?doc.getElementById(focused.id):[...root.querySelectorAll('input,button')].find(x=>focused.name?x.name===focused.name:x.dataset.x===focused.action);target?.focus({preventScroll:true});if(focused.start!==null&&focused.start!==undefined&&target?.type==='text')target.setSelectionRange(focused.start,focused.end);}
  window.scrollTo({top,behavior:'instant'});
 }});
 const submit=event=>{if(event.target.id==='xRoomForm'){event.preventDefault();controller.submit();}};
 const change=event=>{const x=event.target;if(['purpose','ttl_seconds','retention_seconds','persist','checked'].includes(x.name))controller.set(x.name,x.name==='checked'?x.checked:x.name==='persist'?x.value==='on':['ttl_seconds','retention_seconds'].includes(x.name)?Number(x.value):x.value);};
 const input=event=>{if(event.target.name==='purpose')change(event);};
 const click=async event=>{const x=event.target.closest('[data-x]');if(!x)return;
  if(x.dataset.x==='account-menu'){const menu=root.querySelector('#accountMenu');menu.hidden=!menu.hidden;x.setAttribute('aria-expanded',String(!menu.hidden));}
  else if(x.dataset.x==='logout'){try{await effects.logout();if(alive)navigate('/rooms');}catch{if(alive)x.textContent='로그아웃하지 못했어요. 다시 시도해주세요.';}}
  else if(x.dataset.x.startsWith('copy-')){const kind=x.dataset.x.slice(5),value=kind==='owner'?controller.ownerMaterial():state.created?.[kind+'_url'];if(!value)return;
   try{await navigator.clipboard.writeText(value);if(alive)root.querySelector('#creationCopyStatus').textContent=kind==='owner'?'관리 키를 복사했어요. 공유하지 마세요.':'링크를 복사했어요.';}
   catch{if(!alive)return;root.querySelector('#creationCopyStatus').textContent=kind==='owner'?'클립보드 쓰기를 허용한 뒤 이 페이지에서 다시 복사해주세요. 관리 키를 화면이나 저장소에 남기지 않아요.':'자동 복사를 사용할 수 없어요. 선택한 링크를 직접 복사해주세요.';if(kind!=='owner'){const node=doc.getElementById(kind==='invite'?'createdInvite':'createdRead');node.focus({preventScroll:true});const range=doc.createRange();range.selectNodeContents(node);const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);}}
  }
 };
 root.addEventListener('submit',submit);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('click',click);
 return {load:controller.load,dispose(){alive=false;controller.dispose();selects.dispose();root.removeEventListener('submit',submit);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('click',click);}};
}
