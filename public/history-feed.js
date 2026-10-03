import {message,person} from './shared/components/common-room.js';
import {renderHistoryNavigation} from './shared/components/history-navigation.js';
import {historyWindow,mergeHistory,pruneHistory,cursorNumber} from './history-window.js';
export function createHistoryFeed(root,onRequest){
 const feed=root.querySelector('#feed'),model=historyWindow(),heights=new Map();
 if(!root.querySelector('.history-navigation'))feed.insertAdjacentHTML('beforebegin',renderHistoryNavigation());
 const nav=root.querySelector('.history-navigation'),older=nav.querySelector('[data-history=older]'),latest=nav.querySelector('[data-history=latest]'),label=nav.querySelector('[data-history-status]');
 const top=document.createElement('div'),bottom=document.createElement('div');top.className=bottom.className='history-spacer';top.setAttribute('aria-hidden','true');bottom.setAttribute('aria-hidden','true');
 const rule=document.createElement('div');rule.className='date-rule';rule.innerHTML='<span>최근 대화</span>';feed.replaceChildren(rule,top,bottom);feed.classList.add('virtual-history');feed.setAttribute('aria-live','off');
 let busy=false,disposed=false,raf=0,expiry,retentionMs=3600000,atBottom=true,pending=false,pinned=null,pinTimer;const nodes=new Map();
 const offset=m=>heights.get(m.cursor)??140;
 const anchor=()=>{for(const node of feed.querySelectorAll('.message')){const y=node.getBoundingClientRect().top-feed.getBoundingClientRect().top;if(y+node.getBoundingClientRect().height>0)return {cursor:node.dataset.cursor,y};}return null;};
 const save=()=>({anchor:anchor(),follow:feed.scrollHeight-feed.clientHeight-feed.scrollTop<4,pageY:scrollY});
 const restore=s=>{if(s.follow)feed.scrollTop=feed.scrollHeight;else if(s.anchor){const node=nodes.get(s.anchor.cursor);if(node)feed.scrollTop+=node.getBoundingClientRect().top-feed.getBoundingClientRect().top-s.anchor.y;}if(scrollY!==s.pageY)scrollTo({top:s.pageY,behavior:'instant'});};
 function controls(){older.disabled=busy||!model.hasOlder;latest.hidden=!model.latest||!model.messages.length||model.messages.at(-1).cursor===model.latest;nav.dataset.historyState=latest.hidden?(model.hasOlder?'older':'start'):'new';if(!pending)label.textContent=latest.hidden?(model.hasOlder?'위로 스크롤하면 이전 대화를 읽어요.':'보관 중인 첫 대화예요.'):'새 대화가 있어요. 읽던 자리는 그대로예요.';}
 function render(){
  if(disposed||!feed.isConnected||!feed.clientHeight)return;
  const s=save(),items=model.messages;let y=rule.offsetHeight,start=0;
  while(start<items.length&&y+offset(items[start])<feed.scrollTop-350)y+=offset(items[start++]);
  if(pinned){const index=items.findIndex(m=>m.cursor===pinned.cursor);if(index>=0&&(index<start||index>start+2)){start=Math.max(0,index-2);y=rule.offsetHeight+items.slice(0,start).reduce((n,m)=>n+offset(m),0);}}
  let end=start,total=y;while(end<items.length&&end-start<32&&(total<feed.scrollTop+feed.clientHeight+500||end===start))total+=offset(items[end++]);
  const wanted=new Set(items.slice(start,end).map(m=>m.cursor));for(const [key,node] of nodes)if(!wanted.has(key)){resize.unobserve(node);node.remove();nodes.delete(key);}
  top.style.height=items.slice(0,start).reduce((n,m)=>n+offset(m),0)+'px';bottom.style.height=items.slice(end).reduce((n,m)=>n+offset(m),0)+'px';
  let pointer=top.nextSibling;for(const m of items.slice(start,end)){let node=nodes.get(m.cursor);if(!node){node=message(m,m.sender.id.charCodeAt(0)%2?'milo':'june');nodes.set(m.cursor,node);resize.observe(node);}if(node!==pointer)feed.insertBefore(node,pointer);pointer=node.nextSibling;}
  let empty=feed.querySelector('.history-empty');if(!items.length&&!empty){empty=document.createElement('p');empty.className='history-empty';empty.textContent='지금 보관 중인 대화가 없어요. 새 대화를 기다려요.';feed.insertBefore(empty,bottom);}else if(items.length)empty?.remove();
  feed.dataset.cachedMessages=String(items.length);feed.dataset.cachedBytes=String(model.bytes);feed.dataset.appliedCursor=items.at(-1)?.cursor??'';
  restore(s);if(pinned)restore({anchor:pinned,follow:false,pageY:scrollY});controls();
 }
 const resize=new ResizeObserver(entries=>{const s=save();let changed=false;for(const e of entries){const h=e.target.getBoundingClientRect().height+parseFloat(getComputedStyle(e.target).marginBottom||0);if(h>0&&Math.abs((heights.get(e.target.dataset.cursor)??140)-h)>.5){heights.set(e.target.dataset.cursor,h);changed=true;}}if(changed){render();restore(s);}});
 const unpin=()=>{pinned=null;clearTimeout(pinTimer);};for(const type of ['wheel','touchstart','pointerdown','keydown'])feed.addEventListener(type,unpin,{passive:true});
 const request=kind=>{if(disposed||busy)return;if(kind==='before'&&!model.hasOlder)return;pending=true;label.textContent=kind==='before'?'이전 대화를 불러오고 있어요.':'최근 대화로 이동하고 있어요.';onRequest(kind);};
 function edges(){if(busy||disposed||!model.messages.length||!feed.clientHeight)return;if(feed.scrollTop<80&&model.hasOlder)request('before');else if(feed.scrollHeight-feed.clientHeight-feed.scrollTop<80&&model.messages.at(-1).cursor!==model.latest)request('after');}
 const onScroll=()=>{atBottom=feed.scrollHeight-feed.clientHeight-feed.scrollTop<4;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{render();edges();});};feed.addEventListener('scroll',onScroll,{passive:true});
 const onOlder=()=>request('before'),onLatest=()=>request('latest');older.addEventListener('click',onOlder);latest.addEventListener('click',onLatest);
 function expiryWatch(){clearTimeout(expiry);if(disposed||!model.messages.length)return;expiry=setTimeout(()=>{const s=save();pruneHistory(model,Date.now()-retentionMs);pending=true;label.textContent='보관 기간이 지난 대화는 더 이상 볼 수 없어요.';pruneSizes();render();restore(s);expiryWatch();},Math.max(1,Date.parse(model.messages[0].created_at)+retentionMs-Date.now()+1));}
 function pruneSizes(){const keep=new Set(model.messages.map(m=>m.cursor));for(const key of heights.keys())if(!keep.has(key))heights.delete(key);}
 return {model,get anchor(){return anchor()?.cursor;},get follow(){return atBottom;},setBusy(v){busy=v;controls();},apply(page,direction,retention){const s=save(),anchorSeq=s.anchor?cursorNumber(s.anchor.cursor).n:null,oldPrefix=anchorSeq===null?0:model.messages.filter(m=>m.sequence<anchorSeq).reduce((n,m)=>n+offset(m),0);retentionMs=retention??retentionMs;const result=mergeHistory(model,page,direction,{follow:s.follow,anchor:s.anchor?.cursor});pending=false;pruneSizes();if(s.anchor&&!s.follow&&!result.reset){pinned=s.anchor;clearTimeout(pinTimer);pinTimer=setTimeout(()=>{pinned=null;},500);}if(result.reset){heights.clear();s.anchor=null;s.follow=true;rule.querySelector('span').textContent=result.gap?'이전 대화 일부를 더 이상 가져올 수 없습니다. 최근 대화로 다시 이어갑니다.':'최근 대화';}
  if(s.anchor&&!s.follow){const delta=model.messages.filter(m=>m.sequence<anchorSeq).reduce((n,m)=>n+offset(m),0)-oldPrefix;bottom.style.height=(parseFloat(bottom.style.height||0)+Math.max(0,delta))+'px';feed.scrollTop+=delta;}
  render();restore(s);if(direction==='latest'||result.reset)feed.scrollTop=feed.scrollHeight;
  const people=root.querySelector('#people');people.replaceChildren();const seen=new Set();for(const m of model.messages)if(!seen.has(m.sender.id)){seen.add(m.sender.id);people.append(person(m.sender,m.sender.id.charCodeAt(0)%2?'milo':'june'));}root.querySelector('#waiting-people').hidden=!!seen.size;
  expiryWatch();if(feed.scrollHeight<=feed.clientHeight+2&&model.hasOlder)onRequest('before');return result;
 },refresh(){render();edges();},dispose(){disposed=true;resize.disconnect();clearTimeout(expiry);clearTimeout(pinTimer);cancelAnimationFrame(raf);feed.removeEventListener('scroll',onScroll);for(const type of ['wheel','touchstart','pointerdown','keydown'])feed.removeEventListener(type,unpin);older.removeEventListener('click',onOlder);latest.removeEventListener('click',onLatest);model.messages=[];model.bytes=0;heights.clear();nodes.clear();feed.replaceChildren(rule);root.querySelector('#people').replaceChildren();},resume(){disposed=false;render();expiryWatch();}};
}
