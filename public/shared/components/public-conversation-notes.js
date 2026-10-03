import {escapeHtml as E} from './auth-primitives.js';
import {riskNotice} from '../dialogs/public-risk.js';

export const recentPublicNotice='DB에 남아 있는 최근 대화부터 읽어요. 보관 한도를 넘긴 기록은 정리돼요.';
// Product, component catalog and room previews share this auxiliary copy.
export function renderPublicConversationNotes({historyNotice=recentPublicNotice}={}){
 return `<aside class="public-conversation-notes fineprint" aria-label="공개 대화와 보관 안내"><p id="public-history-note" role="status">${E(historyNotice)}</p><p id="public-notice">${E(riskNotice)}</p></aside>`;
}
