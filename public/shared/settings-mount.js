import {createSettingsController} from './settings-controller.js';
import {renderSettingsScreen} from './screens/settings.js';
import {createSettingsDialog} from './dialogs/settings.js';
import {createSelects} from './components/selects.js';

export function mountSettings(root,{effects,section='overview'}){
 const document=root.ownerDocument,window=document.defaultView,selects=createSelects(document);
 let dialog=null,lock=null,lastState,currentSection=section;
 function removeDialog(){const previous=dialog;dialog=null;if(previous){previous.close();previous.remove();}if(lock!==null){document.body.style.overflow=lock;lock=null;}}
 const paint=state=>{
  lastState=state;
  const focus=document.activeElement?.id,top=window.scrollY;
  selects.clear();root.innerHTML=renderSettingsScreen({...state,section:currentSection});selects.enhance(root);
  if(!dialog&&focus)document.getElementById(focus)?.focus({preventScroll:true});window.scrollTo({top,behavior:'instant'});
  const priorKind=dialog?.dataset.kind,priorAction=dialog?.contains(document.activeElement)?document.activeElement.dataset.x:null;
  removeDialog();
  if(state.dialog){
   const params=state.dialog==='settings-conflict'?state.conflict:['settings-reload','settings-leave'].includes(state.dialog)?{changedCount:state.changes.length}:{revision:state.resource.revision,changes:state.changes,
    applicationNote:[...new Set(state.changes.map(change=>change.applyTo))].map(value=>({runtime:'실행 중 적용',new_room:'새 방에 적용',authentication:'인증에 적용',provisioning:'설치에 적용'}[value]||value)).join(' · ')};
   dialog=createSettingsDialog(state.dialog,{...params,pending:state.pending,error:state.error?.code},document);dialog.dataset.kind=state.dialog;
   const current=dialog;document.body.append(current);lock=document.body.style.overflow;document.body.style.overflow='hidden';
   current.addEventListener('close',()=>{if(dialog!==current)return;controller.closeDialog();});
   current.addEventListener('click',event=>{const action=event.target.closest('[data-x]')?.dataset.x;
    if(action==='confirm-save')controller.confirmSave();else if(action==='close-dialog')controller.closeDialog();else if(action==='reload-settings')controller.requestReload();else if(action==='confirm-reload')controller.confirmReload();else if(action==='discard-leave')controller.confirmLeave();});
   current.showModal();if(priorKind===state.dialog&&priorAction)current.querySelector(`[data-x="${priorAction}"]`)?.focus({preventScroll:true});
  }else if(priorKind)root.querySelector('[data-x=review-settings]')?.focus({preventScroll:true});
 };
 const controller=createSettingsController({effects,paint});
 const change=event=>{const field=event.target.closest('[data-setting],[data-schema-field]');if(!field)return;const value=field.type==='checkbox'?field.checked:field.type==='number'?field.valueAsNumber:field.value;controller.set(field.dataset.setting||field.dataset.schemaField,value,field.value);};
 const click=event=>{const button=event.target.closest('[data-x],[data-schema-action]');if(!button)return;
  if(button.dataset.schemaAction==='add-room'){controller.addCatalog();const row=lastState.catalogRowIds.at(-1);document.getElementById('schema-catalog-'+row+'-title')?.focus();}
  else if(button.dataset.schemaAction==='remove-room'){const index=lastState.catalogRowIds.indexOf(Number(button.dataset.row));controller.removeCatalog(index);const next=lastState.catalogRowIds[Math.min(index,lastState.catalogRowIds.length-1)];const target=next===undefined?root.querySelector('[data-schema-action=add-room]'):document.getElementById('schema-catalog-'+next+'-title');target?.focus();}
  if(button.dataset.x==='catalog-add')controller.addCatalog();else if(button.dataset.x==='catalog-remove')controller.removeCatalog(Number(button.dataset.index));
  else if(button.dataset.x==='review-settings')controller.review();else if(button.dataset.x==='cancel-settings')controller.cancel();
  else if(button.dataset.x==='account-menu'){const menu=root.querySelector('#accountMenu');if(menu){menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));}}
  else if(button.dataset.x==='logout')controller.requestLeave(()=>effects.logout().then(()=>window.location.assign('/')).catch(()=>{button.textContent='로그아웃하지 못했어요. 다시 시도해주세요.';}));
 };
 root.addEventListener('change',change);root.addEventListener('click',click);
 return {async load(){await controller.load();if(currentSection==='budget')await controller.loadBudget();},enter(next){currentSection=next;paint(lastState);if(next==='budget')controller.loadBudget();},requestLeave:controller.requestLeave,dispose(){controller.dispose();root.removeEventListener('change',change);root.removeEventListener('click',click);removeDialog();selects.dispose();},state:()=>structuredClone(lastState)};
}
