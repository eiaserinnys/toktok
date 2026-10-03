import {AGENT_SAFETY_NOTICE,AGENT_SAFETY_VERSION} from '../agent-safety.js';
import {escapeHtml} from './auth-primitives.js';

// Only the service-owned notice enters this surface. Room data is rendered separately.
export function renderAgentSafety(){
 const [title,...paragraphs]=AGENT_SAFETY_NOTICE.split('\n\n');
 return `<section class="warning-note" data-safety-version="${escapeHtml(AGENT_SAFETY_VERSION)}" aria-label="에이전트 안전 안내"><strong>${escapeHtml(title)}</strong>${paragraphs.map(text=>`<p>${escapeHtml(text)}</p>`).join('')}</section>`;
}
