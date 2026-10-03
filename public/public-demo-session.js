// Public cursor is an epoch/sequence pair. State is updated only after DOM application.
export function applyPublicPage(state,page,{append,reset,notice}){
 const replace=page.history_status==='history_reset'||page.history_status==='history_gap';
 if(replace){notice('이전 대화 일부를 더 이상 가져올 수 없습니다. 최근 대화로 다시 이어갑니다.');reset();state.cursor=null;state.epoch=null;}
 else if(page.initial_window?.truncated)notice('서버가 안내한 최근 보관 범위부터 보여요. 그 이전 대화는 생략됐어요.');
 for(const m of page.messages){
  const [epoch,seq]=m.cursor.split(':'),n=Number(seq);
  if(epoch!==page.epoch||n!==m.sequence)throw Error('SEQUENCE_GAP');
  if(state.cursor){const [prior,last]=state.cursor.split(':');if(prior!==epoch)throw Error('SEQUENCE_GAP');if(n<=Number(last))continue;if(n!==Number(last)+1)throw Error('SEQUENCE_GAP');}
  append(m);state.cursor=m.cursor;state.epoch=epoch;
 }
 if(!page.messages.length){state.cursor=page.cursor;state.epoch=page.epoch;}
}
export function consumeFragment(location,history){
 const grant=new URLSearchParams(location.hash.slice(1)).get('grant');
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 return grant;
}
