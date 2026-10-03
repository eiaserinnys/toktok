import {renderProductHeader} from './components/header.js';
import {createCommonHeaderController} from './common-header-controller.js';
export function mountCommonHeader(root,{effects,navigate,route}){
 const doc=root.ownerDocument;
 const controller=createCommonHeaderController({effects,navigate,paint:vm=>{
  const prior=root.querySelector('header'),active=prior?.contains(doc.activeElement)?doc.activeElement:null,action=active?.dataset.x;
  if(!prior)return;const template=doc.createElement('template');template.innerHTML=renderProductHeader(vm);const next=template.content.firstElementChild;prior.replaceWith(next);
  if(action)next.querySelector('[data-x="'+action+'"]')?.focus({preventScroll:true});
 }});
 const click=event=>{const button=event.target.closest('header [data-x]');if(!button||!root.contains(button))return;
  if(button.dataset.x==='account-menu')controller.toggle();else if(button.dataset.x==='logout')controller.logout();
 };
 root.addEventListener('click',click);controller.load(route);
 return {load:()=>controller.load(route),dispose(){controller.dispose();root.removeEventListener('click',click);}};
}
