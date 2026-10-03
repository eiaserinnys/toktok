import {createAdminLogsController} from './adminlogs-controller.js';
import {renderAdminLogs} from './screens/adminlogs.js';
import {createInvitationDialog} from './dialogs/invitations.js';
export function mountAdminLogs(root,{effects,section,navigate}){
 const doc=root.ownerDocument;let dialog=null,overflow=null,lastState,returnId=null;
 function remove(){const prior=dialog;dialog=null;if(prior){prior.close();prior.remove();}if(overflow!==null){doc.body.style.overflow=overflow;overflow=null;}}
 const controller=createAdminLogsController({effects,section,navigate,paint:state=>{
  lastState=state;const old=dialog?.dataset.kind,focus=doc.activeElement,action=dialog?.contains(focus)?focus.dataset.x:null,fieldFocus=focus?.id,caret=[focus?.selectionStart,focus?.selectionEnd],top=doc.defaultView.scrollY;
  root.innerHTML=renderAdminLogs(state);remove();doc.defaultView.scrollTo({top,behavior:'instant'});
  if(state.dialog){
   dialog=createInvitationDialog({kind:state.dialog,field:state.resource.schema.fields.identity.fields.invitationTtlSeconds,ttl_seconds:state.ttl_seconds,invitation:state.selected,code:controller.oneTimeCode(),pending:state.pending,error:state.error?.code,retryAt:state.retryAt},doc);dialog.dataset.kind=state.dialog;
   const current=dialog;doc.body.append(current);overflow=doc.body.style.overflow;doc.body.style.overflow='hidden';
   current.addEventListener('close',()=>{if(dialog===current)controller.closeDialog();});
   current.addEventListener('input',event=>{if(event.target.dataset.setting==='invitation_ttl_seconds')controller.setTtl(event.target.valueAsNumber);});
   current.addEventListener('click',async event=>{
    const action=event.target.closest('[data-x]')?.dataset.x;
    if(action==='close-dialog')controller.closeDialog();else if(action==='confirm-invitation')controller.confirm();
    else if(action==='copy-invitation'){
     const value=controller.oneTimeCode();if(!value)return;
     try{await doc.defaultView.navigator.clipboard.writeText(value);if(dialog===current)current.querySelector('#invitationCopyStatus').textContent='가입 초대 코드를 복사했어요.';}
     catch{if(dialog!==current)return;const code=current.querySelector('#oneTimeInvitation');code.focus({preventScroll:true});const range=doc.createRange();range.selectNodeContents(code);const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);current.querySelector('#invitationCopyStatus').textContent='자동 복사를 사용할 수 없어요. 선택한 코드를 직접 복사해주세요.';}
    }
   });
   current.showModal();if(old===state.dialog){if(action)current.querySelector('[data-x="'+action+'"]')?.focus({preventScroll:true});else if(fieldFocus){const field=current.querySelector('#'+fieldFocus);field?.focus({preventScroll:true});if(field?.setSelectionRange&&caret[0]!==null)try{field.setSelectionRange(...caret);}catch{}}}
  }else if(old)([...root.querySelectorAll('[data-id]')].find(x=>x.dataset.id===returnId)||root.querySelector('[data-x=new-invitation]'))?.focus({preventScroll:true});
 }});
 const click=event=>{const button=event.target.closest('[data-x]');if(!button)return;
  if(button.dataset.x==='new-invitation'){returnId=null;controller.requestCreate();}else if(button.dataset.x==='revoke-invitation'){returnId=button.dataset.id;controller.requestRevoke(returnId);}else if(button.dataset.x==='reload-adminlogs')controller.load();else if(button.dataset.x==='logout')controller.logout();else if(button.dataset.x==='account-menu'){const menu=root.querySelector('#accountMenu');menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));}
 };
 root.addEventListener('click',click);return {load:controller.load,dispose(){controller.dispose();root.removeEventListener('click',click);remove();},state:()=>structuredClone(lastState)};
}
