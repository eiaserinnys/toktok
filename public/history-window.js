export const HISTORY_LIMIT=100,HISTORY_BYTES=512*1024;
const bytes=m=>new TextEncoder().encode(JSON.stringify(m)).length;
export function cursorNumber(c){const m=typeof c==='string'&&/^([a-f0-9-]{36}):(0|[1-9][0-9]*)$/.exec(c);if(!m||!Number.isSafeInteger(Number(m[2])))throw Error('INVALID_HISTORY_CURSOR');return {epoch:m[1],n:Number(m[2])};}
export function historyWindow(){return {messages:[],epoch:null,latest:null,first:null,hasOlder:false,bytes:0};}
export function mergeHistory(model,page,direction,{follow=true,anchor}={}){
 const end=cursorNumber(page.cursor),latest=cursorNumber(page.latest_cursor),first=cursorNumber(page.earliest_cursor);
 if(end.epoch!==page.epoch||latest.epoch!==page.epoch||first.epoch!==page.epoch||!Array.isArray(page.messages)||page.messages.length>20||!['ok','history_gap','history_reset'].includes(page.history_status))throw Error('INVALID_HISTORY_PAGE');
 let last;for(const m of page.messages){const c=cursorNumber(m.cursor);if(c.epoch!==page.epoch||c.n!==m.sequence||c.n<=first.n||c.n>latest.n||last!==undefined&&c.n!==last+1||!Number.isFinite(Date.parse(m.created_at))||typeof m.text!=='string'||typeof m.sender?.id!=='string')throw Error('SEQUENCE_GAP');last=c.n;}
 if(page.messages.length&&page.messages.at(-1).cursor!==page.cursor)throw Error('SEQUENCE_GAP');
 const reset=page.history_status!=='ok'||model.epoch&&model.epoch!==page.epoch||direction==='latest';
 const prior=reset?[]:model.messages.filter(m=>m.sequence>first.n);
 const incoming=page.messages;
 // A live poll while reading an older, detached window updates only the high-water mark.
 const detached=direction==='live'&&prior.length&&incoming.length&&incoming[0].sequence>prior.at(-1).sequence+1;
 let list=detached?prior:[...new Map([...prior,...incoming].map(m=>[m.cursor,m])).values()].sort((a,b)=>a.sequence-b.sequence);
 for(let i=1;i<list.length;i++)if(list[i].sequence!==list[i-1].sequence+1)throw Error('SEQUENCE_GAP');
 let size=list.reduce((n,m)=>n+bytes(m),0);
 while(list.length>HISTORY_LIMIT||size>HISTORY_BYTES){
  const dropHead=direction!=='before'&&(follow||!anchor||list[0].sequence<cursorNumber(anchor).n);
  const removed=dropHead?list.shift():list.pop();size-=bytes(removed);
 }
 Object.assign(model,{messages:list,epoch:page.epoch,latest:page.latest_cursor,first:first.n+1,hasOlder:(list[0]?.sequence??first.n+1)>first.n+1,bytes:size});
 return {reset,gap:page.history_status!=='ok',detached};
}
export function pruneHistory(model,cutoff){model.messages=model.messages.filter(m=>Date.parse(m.created_at)>cutoff);model.bytes=model.messages.reduce((n,m)=>n+bytes(m),0);if(!model.messages.length)model.hasOlder=false;}
