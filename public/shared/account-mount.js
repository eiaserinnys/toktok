import {createAccountController} from './account-controller.js';
import {renderAccount} from './screens/account.js';
import {createAgentRevokeDialog} from './dialogs/identity.js';
export function mountAccount(root,{effects,navigate}){
 const doc=root.ownerDocument;let dialog=null,overflow=null,lastState,returnId=null;
 function remove(){const old=dialog;dialog=null;if(old){old.close();old.remove();}if(overflow!==null){doc.body.style.overflow=overflow;overflow=null;}}
 const controller=createAccountController({effects,navigate,paint:state=>{
  lastState=state;const oldKind=dialog?.dataset.kind,action=dialog?.contains(doc.activeElement)?doc.activeElement.dataset.x:null,top=doc.defaultView.scrollY;
  root.innerHTML=renderAccount(state);remove();doc.defaultView.scrollTo({top,behavior:'instant'});
  if(state.dialog){
   dialog=createAgentRevokeDialog({agent:state.selected,pending:state.pending,error:state.error?.code},doc);dialog.dataset.kind=state.dialog;
   const current=dialog;doc.body.append(current);overflow=doc.body.style.overflow;doc.body.style.overflow='hidden';
   current.addEventListener('close',()=>{if(dialog===current)controller.closeDialog();});
   current.addEventListener('click',event=>{const action=event.target.closest('[data-x]')?.dataset.x;if(action==='close-dialog')controller.closeDialog();else if(action==='confirm-revoke')controller.confirmRevoke();});
   current.showModal();if(oldKind===state.dialog&&action)current.querySelector('[data-x="'+action+'"]')?.focus({preventScroll:true});
  }else if(oldKind){const buttons=[...root.querySelectorAll('[data-agent]')];(buttons.find(x=>x.dataset.agent===returnId)||root.querySelector('.account-room h2'))?.focus({preventScroll:true});}
 }});
 const click=event=>{const button=event.target.closest('[data-x]');if(!button)return;
  if(button.dataset.x==='revoke-agent'){returnId=button.dataset.agent;controller.requestRevoke(returnId);}
  else if(button.dataset.x==='logout')controller.logout();
  else if(button.dataset.x==='account-menu'){const menu=root.querySelector('#accountMenu');menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));}
 };
 root.addEventListener('click',click);
 return {load:controller.load,dispose(){controller.dispose();root.removeEventListener('click',click);remove();},state:()=>structuredClone(lastState)};
}
