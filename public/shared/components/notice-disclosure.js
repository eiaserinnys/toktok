import {escapeHtml as E} from './auth-primitives.js';

// Only caller-owned markup may enter contentHtml. All plain text is escaped here.
export function renderNoticeDisclosure({id,title,body=[],contentHtml='',version,versionAttribute='data-notice-version',open=false}={}){
 if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('INVALID_NOTICE_ID');
 if(!['data-notice-version','data-safety-version','data-entry-notice'].includes(versionAttribute))throw Error('INVALID_NOTICE_ATTRIBUTE');
 const paragraphs=Array.isArray(body)?body:[body];
 return `<details id="${id}" class="notice-disclosure" data-notice-id="${id}"${open?' open':''}${version?` ${versionAttribute}="${E(version)}"`:''}><summary>${E(title)}</summary><div class="notice-body">${paragraphs.map(text=>`<p>${E(text)}</p>`).join('')}${contentHtml}</div></details>`;
}

// Kept by each mount, never persisted or shared across rooms/routes.
export function captureDisclosures(root){
 const active=root.ownerDocument.activeElement;
 return {items:new Map([...root.querySelectorAll('details[data-notice-id]')].map(node=>[node.dataset.noticeId,node.open])),focus:root.contains(active)&&active?.matches('details[data-notice-id]>summary')?active.parentElement.dataset.noticeId:null};
}
export function restoreDisclosures(root,saved){
 if(!saved)return;
 for(const node of root.querySelectorAll('details[data-notice-id]')){
  if(saved.items.has(node.dataset.noticeId))node.open=saved.items.get(node.dataset.noticeId);
  if(saved.focus===node.dataset.noticeId)node.querySelector('summary')?.focus({preventScroll:true});
 }
}
const previousMarkup=new WeakMap();
export function replaceNoticeContent(root,html){
 if(previousMarkup.get(root)===html)return;previousMarkup.set(root,html);
 const saved=captureDisclosures(root);root.innerHTML=html;restoreDisclosures(root,saved);
}
