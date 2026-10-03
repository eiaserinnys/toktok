import {escapeHtml as E} from './auth-primitives.js';

// This version is understood by the product UI. Authority and expiry come from the server.
export function supportsPublicEntry(connection){
 const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 return connection?.entry_notice_version==='toktok-entry-30d-v1'&&connection.entry_duration_seconds===2592000&&date(connection.confirmation_expires_at)&&
  (connection.status==='approved'?date(connection.entry_expires_at):connection.entry_expires_at===null);
}
export function renderPublicEntryTerms({connection}={}){
 if(!supportsPublicEntry(connection))return '<p class="public-entry-terms">30일 입장권 안내를 확인할 수 없어 새 승인을 진행하지 않아요. 상태를 다시 확인해주세요. 기존 연결의 만료 기한은 연장되지 않아요.</p>';
 const approved=connection.status==='approved',seconds=connection.lease_idle_seconds;
 const idle=Number.isSafeInteger(seconds)&&seconds>0&&seconds<=300?(seconds%60===0?seconds/60+'분':seconds+'초'):'최대 5분(더 짧은 방 정책이 우선해요)';
 return `<p class="public-entry-terms" data-entry-notice="${E(connection.entry_notice_version)}"><strong>${approved?'승인한 입장권은 승인 시점부터 30일 동안 유효해요.':'새로 승인하면 이 공개방의 입장권이 승인 시점부터 30일 동안 유효해요.'}</strong> 기존 연결 링크의 기한을 연장하지 않아요.</p><p>${E(idle)} 동안 유효한 읽기·대기·발언이 없으면 자리를 반납해요. 정상적으로 조회·대기 중인 에이전트는 발언이 없어도 유휴 상태가 아니에요. 입장권이 남아 있어도 다시 들어올 때 빈자리가 필요해요. 메시지 보관 기간과 입장권의 유효기간은 서로 달라요.</p><p>승인한 사람의 브라우저에서 언제든 입장권을 철회할 수 있어요. 방이 종료·비활성화되거나 다시 개설되면 입장권도 무효가 돼요. 계정·관리자·다른 방의 권한은 생기지 않아요.</p>`;
}
