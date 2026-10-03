// One Common room native dialog frame, focus boundary and pending close policy.
export function trapDialogTab(dialog,event){
 if(event.key!=='Tab')return;
 const document=dialog.ownerDocument;
 const controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0&&x.getClientRects().length);
 const first=controls[0],last=controls.at(-1),active=document.activeElement;
 if(!first){event.preventDefault();dialog.focus();}
 else if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(active===last||!dialog.contains(active))){event.preventDefault();first.focus();}
}
export function createCommonDialog(content,{pending=false}={},document=globalThis.document){
 const dialog=document.createElement('dialog');dialog.className='x-dialog';dialog.setAttribute('aria-labelledby','xDialogTitle');
 dialog.innerHTML=`<button type="button" class="icon-btn x-dialog-close" data-x="close-dialog" aria-label="닫기">×</button>${content}`;
 dialog.querySelector('.x-dialog-close').disabled=!!pending;
 dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
 dialog.tabIndex=-1;
 dialog.addEventListener('keydown',event=>trapDialogTab(dialog,event));
 return dialog;
}
