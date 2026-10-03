import {escapeHtml as E} from './auth-primitives.js';
export function renderHistoryNavigation({state='loading'}={}){const labels={loading:'최근 대화를 불러오고 있어요.',older:'위로 스크롤하면 이전 대화를 읽어요.',start:'보관 중인 첫 대화예요.',gap:'보관 기간이 지난 대화는 더 이상 볼 수 없어요.',new:'새 대화가 있어요. 읽던 자리는 그대로예요.'};return `<div class="history-navigation" aria-label="대화 기록 탐색"><button type="button" class="text-button" data-history="older" ${state==='loading'||state==='start'?'disabled':''}>이전 대화</button><span role="status" data-history-status>${E(labels[state]??labels.loading)}</span><button type="button" class="text-button" data-history="latest" ${state==='new'?'':'hidden'}>새 대화 보기</button></div><p class="notice-helper history-help" data-role="history-help" hidden></p>`;}

export function updateHistoryHelp(root,page){
 const count=page?.initial_window?.max_messages,help=root.querySelector('[data-role=history-help]');
 if(!help||!Number.isSafeInteger(count)||count<1)return;
 help.hidden=false;help.textContent=`시간으로 잘라내지 않고 보관 중인 최근 최대 ${count}개부터 읽어요. 메시지·응답 바이트 한도가 먼저 적용돼요. 위로 스크롤하면 이전 기록을 읽어요.`;
}
