import {dialogRegistry} from '../shared/registry.js';
import {createCommonDialog,trapDialogTab} from '../shared/dialogs/common-dialog.js';
import {createGalleryState} from './gallery-state.js';

// Protected QA chrome contains the actual registered native dialog node.
// Preview controls have no live effect adapter and cannot submit a mutation.
export function mountDialogueGallery(root,fixtures){
 const doc=root.ownerDocument,state=createGalleryState(fixtures.length);let shell=null,trigger=null;
 const label=f=>f.dialogId+' · '+f.state;
 function paint(){
  const fixture=fixtures[state.index],product=dialogRegistry[fixture.dialogId].render(...fixture.args);
  shell.innerHTML='<div class="dialog-review-heading"><div><span class="eyebrow">DIALOGUE REVIEW</span><h2 id="reviewDialogTitle" tabindex="-1"></h2><span class="review-dialog-count" aria-live="polite"></span></div><button type="button" class="icon-btn" data-review="close" aria-label="다이얼로그 검수 닫기">×</button></div><div class="dialog-review-stage"><button type="button" class="dialog-review-step" data-review="prev" aria-label="이전 다이얼로그">←<span>이전</span></button><button type="button" class="dialog-review-step" data-review="next" aria-label="다음 다이얼로그">→<span>다음</span></button></div><p class="dialog-review-hint">검수용 이동 · Alt + ← / → · Escape로 닫기</p>';
  shell.dataset.reviewIndex=String(state.index);shell.dataset.dialogId=fixture.dialogId;shell.dataset.dialogState=fixture.state;
  shell.querySelector('#reviewDialogTitle').textContent=label(fixture);shell.querySelector('.review-dialog-count').textContent=(state.index+1)+' / '+fixtures.length;
  shell.querySelector('[data-review=prev]').disabled=state.index===0;shell.querySelector('[data-review=next]').disabled=state.index===fixtures.length-1;
  product.dataset.reviewProduct='true';product.open=true;shell.querySelector('.dialog-review-stage').insertBefore(product,shell.querySelector('[data-review=next]'));
  shell.querySelector('#reviewDialogTitle').focus({preventScroll:true});
 }
 function step(direction){if(state.step(direction))paint();}
 function open(raw,button){if(!state.open(raw))return false;
  if(!shell){trigger=button;shell=createCommonDialog('',{},doc);shell.className='dialog-review-shell';shell.setAttribute('aria-labelledby','reviewDialogTitle');root.append(shell);
   shell.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();},true);
   shell.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();shell.close();}
    else if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();step(event.key==='ArrowLeft'?-1:1);}
    else if(event.key==='Tab'){trapDialogTab(shell,event);event.stopPropagation();}
   },true);
   shell.addEventListener('click',event=>{const button=event.target.closest('[data-review],[data-x=close-dialog],.close-dialog');if(!button)return;
    if(button.dataset.review==='prev')step(-1);else if(button.dataset.review==='next')step(1);else shell.close();
   });
   shell.addEventListener('close',()=>{shell.remove();shell=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});trigger=null;},{once:true});
   paint();shell.showModal();shell.querySelector('#reviewDialogTitle').focus({preventScroll:true});
  }else paint();return true;
 }
 for(const [index,fixture] of fixtures.entries()){
  const button=doc.createElement('button');button.className='btn soft';button.textContent=label(fixture);button.dataset.reviewIndex=String(index);
  button.addEventListener('click',()=>open(button.dataset.reviewIndex,button));root.append(button);
 }
 return {open,dispose(){shell?.close();}};
}
