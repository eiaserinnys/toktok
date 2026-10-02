import {componentRegistry,dialogRegistry,screenRegistry,renderScreen} from '../shared/registry.js';
import {routeRegistry} from '../shared/routes.js';
import {renderFlowBoard} from '../shared/screens/flow-board.js';
import {createFixtureAdapter} from './fixture-adapter.js';
import {buildGraph} from './coverage.js';
import {createSelects,renderSelect} from '../shared/components/selects.js';

// This controller is only served under the server-authorized QA asset prefix.
// No live adapter is accepted, including through query/fixtureRole parameters.
export function mountDesignReview(root,view='flows'){
 const adapter=createFixtureAdapter(),fixtures=adapter.catalog();
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures};
 const graph=buildGraph(input);
 if(view==='components'){
  for(const fixture of fixtures.components){
   const section=document.createElement('section'),heading=document.createElement('h2');
   heading.textContent=fixture.componentId+' · '+fixture.state;section.append(heading);
   const rendered=componentRegistry[fixture.componentId].render(...fixture.args);
   if(typeof rendered==='string'){const container=document.createElement('div');container.innerHTML=rendered;section.append(container);}else section.append(rendered);
   root.append(section);
  }
  const selects=createSelects(root.ownerDocument);selects.enhance(root);
  root.querySelector('#fixture-select-opened')?.parentElement.querySelector('.tok-select-button')?.click();
  return {adapter,graph,dispose:()=>selects.dispose()};
 }
 if(view==='dialogues'){
  for(const fixture of fixtures.dialogs){
   const button=document.createElement('button');button.className='btn soft';button.textContent=fixture.dialogId+' · '+fixture.state;
   button.addEventListener('click',()=>{
    const dialog=dialogRegistry[fixture.dialogId].render(...fixture.args);root.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();button.focus();},{once:true});
    dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();});
    dialog.showModal();
   });root.append(button);
  }
  return {adapter,graph};
 }
 const state={boardMode:'DEMO',boardRole:'all',boardReferences:true,boardZoom:.35,boardExpanded:false};
 const selects=createSelects(root.ownerDocument),previewContexts=new Map();
 let board,layout,expanded=null;
 function zoom(value,preserve=true){
  const viewport=board.querySelector('#flowViewport'),prior=state.boardZoom;
  const cx=(viewport.scrollLeft+viewport.clientWidth/2)/prior,cy=(viewport.scrollTop+viewport.clientHeight/2)/prior;
  state.boardZoom=Math.max(.02,Math.min(1.15,value));
  const canvas=board.querySelector('#flowCanvas'),space=board.querySelector('#flowSpace');
  canvas.style.setProperty('transform',`scale(${state.boardZoom})`);
  space.style.setProperty('width',layout.width*state.boardZoom+'px');space.style.setProperty('height',layout.height*state.boardZoom+'px');
  board.querySelector('#boardZoomLabel').textContent=Math.round(state.boardZoom*100)+'%';
  if(preserve){viewport.scrollLeft=Math.max(0,cx*state.boardZoom-viewport.clientWidth/2);viewport.scrollTop=Math.max(0,cy*state.boardZoom-viewport.clientHeight/2);}
 }
 function mountPreviews(){
  for(const node of layout.nodes){
   const button=Array.from(board.querySelectorAll('.flow-node')).find(e=>e.dataset.node===node.id);
   button.style.setProperty('left',node.x+'px');button.style.setProperty('top',node.y+'px');
   const frame=button.querySelector('iframe'),doc=frame.contentDocument;
   const style=doc.createElement('link');style.rel='stylesheet';style.href='/styles.css';doc.head.append(style);
   doc.body.innerHTML=renderScreen(node.screenId);
   // Every preview has independent history/state and no network effect port.
   let memory=previewContexts.get(node.id);if(!memory){memory=createFixtureAdapter();previewContexts.set(node.id,memory);}
   doc.addEventListener('click',event=>{const link=event.target.closest('a');if(link){event.preventDefault();memory.navigate(new URL(link.href,location.origin).pathname);}});
  }
 }
 function redraw(){
  selects.clear();
  const rendered=renderFlowBoard(graph,state);layout=rendered.layout;
  const host=expanded?.dialog??root;
  host.innerHTML=rendered.markup;board=host.querySelector('.flowboard');
  for(const select of board.querySelectorAll('select')){
   const replacement=renderSelect({label:select.closest('label').firstChild.textContent.trim(),ariaLabel:select.getAttribute('aria-label'),id:select.id,value:select.value,
    options:Array.from(select.options).map(o=>({value:o.value,label:o.textContent,disabled:o.disabled}))},root.ownerDocument);
   select.closest('label').replaceWith(replacement);
  }
  const canvas=board.querySelector('#flowCanvas');canvas.style.setProperty('width',layout.width+'px');canvas.style.setProperty('height',layout.height+'px');
  for(const layer of layout.layers){const label=board.querySelector(`[data-depth="${layer.depth}"]`);label.style.setProperty('left',layer.x+'px');label.style.setProperty('top','42px');}
  zoom(state.boardZoom,false);mountPreviews();
  board.querySelector('#boardMode').addEventListener('change',event=>{state.boardMode=event.target.value;redraw();});
  board.querySelector('#boardRole').addEventListener('change',event=>{state.boardRole=event.target.value;redraw();});
  selects.enhance(board);
  const viewport=board.querySelector('#flowViewport');let drag=null;
  viewport.addEventListener('pointerdown',event=>{
   if(event.target.closest('.flow-node,button,select'))return;
   drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove',event=>{if(drag){viewport.scrollLeft=drag.left+drag.x-event.clientX;viewport.scrollTop=drag.top+drag.y-event.clientY;}});
  viewport.addEventListener('pointerup',()=>{drag=null;});viewport.addEventListener('pointercancel',()=>{drag=null;});
  viewport.addEventListener('keydown',event=>{const directions={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]};if(event.target===viewport&&directions[event.key]){event.preventDefault();viewport.scrollBy(...directions[event.key]);}});
  board.addEventListener('click',event=>{
   const button=event.target.closest('[data-x]');if(!button)return;
   const action=button.dataset.x;
   if(action==='board-minus')zoom(state.boardZoom-.1);
   else if(action==='board-plus')zoom(state.boardZoom+.1);
   else if(action==='board-fit')zoom(Math.min(viewport.clientWidth/layout.width,viewport.clientHeight/layout.height),false);
   else if(action==='board-download'){
    const data=board.querySelector('.graph-data pre').textContent;
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='toktok-design-graph.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
   }
   else if(action==='board-references'){state.boardReferences=!state.boardReferences;redraw();}
   else if(action==='board-expand'){
    if(expanded){expanded.dialog.close();return;}
    const camera={zoom:state.boardZoom,left:viewport.scrollLeft,top:viewport.scrollTop},dialog=document.createElement('dialog');
    dialog.className='board-client-dialog';dialog.setAttribute('aria-label','화면 흐름 크게 보기');
    const parent=board.parentElement,next=board.nextSibling;expanded={dialog};state.boardExpanded=true;document.body.append(dialog);dialog.append(board);
    button.textContent='원래 크기로';button.setAttribute('aria-expanded','true');
    dialog.addEventListener('close',()=>{
     parent.insertBefore(board,next);dialog.remove();expanded=null;state.boardExpanded=false;mountPreviews();zoom(camera.zoom,false);
     const toggle=board.querySelector('[data-x=board-expand]'),currentViewport=board.querySelector('#flowViewport');
     toggle.textContent='크게 보기';toggle.setAttribute('aria-expanded','false');toggle.focus({preventScroll:true});
     requestAnimationFrame(()=>{currentViewport.scrollLeft=camera.left;currentViewport.scrollTop=camera.top;board.dataset.cameraRestored='true';});
    },{once:true});
    delete board.dataset.cameraRestored;dialog.showModal();mountPreviews();button.focus({preventScroll:true});viewport.scrollLeft=camera.left;viewport.scrollTop=camera.top;
   }
  });
 }
 redraw();return {adapter,graph};
}
