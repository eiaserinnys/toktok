// Cursor belongs to applied DOM content, not to a response that has only arrived.
export function applyPage(state,page,append){
 for(const m of page.messages){
  if(m.sequence<=state.cursor)continue;
  if(m.sequence!==state.cursor+1)throw Error('SEQUENCE_GAP');
  append(m);state.cursor=m.sequence;
 }
}
export function ownsResponse(state,controller,current){return state===current&&state.controller===controller&&!controller.signal.aborted;}
export function retryDelay(response,attempt){
 const header=response?.headers.get('Retry-After');
 if(response?.status===429&&header){const seconds=Number(header);const ms=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now();if(ms>0)return ms;}
 return Math.min(1000*2**attempt,15000);
}
export function cancel(state){state.controller?.abort();clearTimeout(state.retryTimer);clearTimeout(state.expiryTimer);state.retryTimer=state.expiryTimer=null;}
