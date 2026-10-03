// Cursor belongs to applied DOM content, not to a response that has only arrived.
function cursor(value){
 const match=typeof value==='string'&&/^([a-f0-9-]{36}):(0|[1-9][0-9]*)$/.exec(value);
 if(!match||!Number.isSafeInteger(Number(match[2])))throw Error('SEQUENCE_GAP');
 return {epoch:match[1],sequence:Number(match[2])};
}
export function privateReadPath(state,more=false){
 return (state.cursor&&!more?'/wait':'/messages')+(state.cursor?'?after='+encodeURIComponent(state.cursor):'');
}
export function applyPage(state,page,{append,reset=()=>{},notice=()=>{}}){
 const end=cursor(page.cursor);
 if(end.epoch!==page.epoch||!Array.isArray(page.messages)||typeof page.has_more!=='boolean'||!['ok','history_gap','history_reset'].includes(page.history_status))throw Error('SEQUENCE_GAP');
 // Validate the response before removing an existing history window.
 for(const m of page.messages){const c=cursor(m.cursor);if(c.epoch!==page.epoch||c.sequence!==m.sequence)throw Error('SEQUENCE_GAP');}
 if(page.messages.length&&page.messages.at(-1).cursor!==page.cursor)throw Error('SEQUENCE_GAP');
 const replace=page.history_status!=='ok';
 if(replace){reset();state.cursor=null;state.epoch=null;notice('이전 대화 일부를 더 이상 가져올 수 없습니다. 최근 보관 범위로 다시 이어갑니다.');}
 else if(state.epoch&&state.epoch!==page.epoch)throw Error('SEQUENCE_GAP');
 else if(page.initial_window?.truncated)notice(`처음에는 최근 ${page.initial_window.max_age_seconds}초 중 최대 ${page.initial_window.max_messages}개를 보여요. 그 이전 대화는 생략됐어요.`);
 for(const m of page.messages){
  if(state.cursor){const previous=cursor(state.cursor);if(m.sequence<=previous.sequence)continue;if(m.sequence!==previous.sequence+1)throw Error('SEQUENCE_GAP');}
  append(m);state.cursor=m.cursor;state.epoch=page.epoch;
 }
 if(!page.messages.length){if(state.cursor&&!replace&&state.cursor!==page.cursor)throw Error('SEQUENCE_GAP');state.cursor=page.cursor;state.epoch=page.epoch;}
}
export function readDelay(ms,signal){return new Promise((resolve,reject)=>{
 const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(Error('ABORT'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
});}
export function ownsResponse(state,controller,current){return state===current&&state.controller===controller&&!controller.signal.aborted;}
export function retryDelay(response,attempt){
 const header=response?.headers.get('Retry-After');
 if(response?.status===429&&header){const seconds=Number(header);const ms=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now();if(ms>0)return ms;}
 return Math.min(1000*2**attempt,15000);
}
export function cancel(state){state.controller?.abort();clearTimeout(state.retryTimer);clearTimeout(state.expiryTimer);state.retryTimer=state.expiryTimer=null;}
