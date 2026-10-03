import {captureDisclosures,restoreDisclosures} from './components/notice-disclosure.js';
import {renderPublicConnection} from './screens/public-connection.js';
import {createPublicConnectionDialog} from './dialogs/public-connection.js';
import {createPublicConnectionController} from './public-connection-controller.js';
import {mountCommonHeader} from './common-header-mount.js';
export function mountPublicConnection(root,{effects,slug,requestId,navigate}){
 const doc=root.ownerDocument;let dialog=null,last=null,returnAction=null,mainHtml=null,disposed=false;
 const restoreFocus=()=>{if(!disposed&&!dialog&&root.isConnected)(root.querySelector('[data-x="'+returnAction+'"]')||root.querySelector('#connection-status'))?.focus({preventScroll:true});};
 const remove=()=>{if(dialog){const old=dialog;dialog=null;old.addEventListener('close',restoreFocus,{once:true});old.close();old.remove();}};
 const controller=createPublicConnectionController({effects,slug,requestId,paint:vm=>{
  const saved=captureDisclosures(root),savedDialog=dialog&&last?.dialog===vm.dialog?captureDisclosures(dialog):null,wasDialog=!!dialog;remove();last=vm;
  const html=renderPublicConnection(vm);
  const t=doc.createElement('template');t.innerHTML=html;const next=t.content.querySelector('main');
  if(root.querySelector('main')){if(mainHtml!==next.outerHTML)root.querySelector('main').replaceWith(next);}else root.innerHTML=html;mainHtml=next.outerHTML;restoreDisclosures(root,saved);
  for(const b of root.querySelectorAll('main button'))b.disabled=vm.pending||(b.dataset.x==='review-public-connection'&&!vm.connection?.can_approve);
  if(vm.dialog){
   dialog=createPublicConnectionDialog({nickname:vm.connection.nickname,connection:vm.connection,revoke:vm.dialog==='revoke',pending:vm.pending,error:vm.error?.code},doc);const current=dialog;doc.body.append(current);
   current.addEventListener('close',()=>{if(dialog===current)controller.close();});
   current.addEventListener('change',()=>{current.querySelector('[data-x="confirm-public-connection"]').disabled=last.pending||(last.dialog!=='revoke'&&(!current.querySelector('input')?.checked||!last.connection?.can_approve));});
   current.addEventListener('click',event=>{const action=event.target.closest('[data-x]')?.dataset.x;if(action==='close-dialog')controller.close();else if(action==='confirm-public-connection')controller.decide(last.dialog==='revoke'?'revoke':'approve',current.querySelector('input')?.checked===true);});
   current.showModal();restoreDisclosures(current,savedDialog);
  }else if(wasDialog)restoreFocus();
 }});
 root.innerHTML=renderPublicConnection({status:'loading',slug});
 const header=mountCommonHeader(root,{effects,navigate,route:'/public/'+slug});
 const click=event=>{const action=event.target.closest('main [data-x]')?.dataset.x;
  if(action==='review-public-connection'||action==='review-public-revoke'){returnAction=action;controller.open(action==='review-public-revoke');}
  else if(action==='deny-public-connection')controller.decide('deny');
  else if(action==='reload-public-connection')controller.load();
 };
 root.addEventListener('click',click);
 return {load:controller.load,dispose(){disposed=true;controller.dispose();header.dispose();remove();root.removeEventListener('click',click);}};
}
