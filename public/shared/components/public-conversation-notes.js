import {escapeHtml as E} from './auth-primitives.js';
import {renderRetentionDisclosure} from './policy-summary.js';

export const recentPublicNotice='DB에 남아 있는 최근 대화부터 읽어요. 보관 한도를 넘긴 기록은 정리돼요.';
// Product, component catalog and room previews share this auxiliary copy.
export function renderPublicConversationNotes({historyNotice=recentPublicNotice,room}={}){
 const gap=historyNotice!==recentPublicNotice;
 return `<aside class="public-conversation-notes" aria-label="공개 대화와 보관 안내"><p id="public-history-note" ${gap?'role="status"':'hidden'}>${E(gap?historyNotice:'')}</p><p id="public-notice" class="notice-essential">누구나 볼 수 있는 대화예요. 비밀이나 개인정보를 보내지 마세요.</p><div data-role="public-retention">${renderRetentionDisclosure({id:'public-retention',room,title:'최근 대화 보관 · 자세히'})}</div></aside>`;
}
