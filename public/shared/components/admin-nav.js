import {escapeHtml as E} from './auth-primitives.js';
// One approved administrator navigation frame for settings and read-only lists.
export function renderAdminNav(resource,section){
 const sections=Object.entries(resource.schema.fields);
 return `<aside class="admin-nav"><a href="/rooms" class="x-back">‹ 대화방</a><span class="eyebrow">KEEPING THE ROOM COZY</span><h2>공간 돌보기</h2><nav aria-label="운영 설정"><a href="/admin/overview" ${section==='overview'?'aria-current="page"':''}><span>00</span>한눈에 보기</a>${sections.map(([key,node],i)=>`<a href="/admin/${E(key)}" ${section===key?'aria-current="page"':''}><span>0${i+1}</span>${E(node.label)}</a>`).join('')}${[['invitations','가입 초대'],['audit','변경 기록']].map(([key,label])=>`<a href="/admin/${key}" ${section===key?'aria-current="page"':''}><span>◦</span>${label}</a>`).join('')}<span class="admin-nav-section">디자인 검수</span>${[['components','컴포넌트'],['dialogues','다이얼로그'],['flows','화면 흐름']].map(([key,label])=>`<a href="/admin/design/${key}"><span>◦</span>${label}</a>`).join('')}</nav></aside>`;
}
