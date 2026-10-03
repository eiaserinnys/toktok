import {it,expect} from 'vitest';
import {renderNoticeDisclosure} from '../public/shared/components/notice-disclosure.js';
import {policySummary,renderRetentionDisclosure} from '../public/shared/components/policy-summary.js';
import {renderAgentSafety} from '../public/shared/components/agent-safety.js';
import {AGENT_SAFETY_NOTICE,AGENT_SAFETY_VERSION} from '../public/shared/agent-safety.js';
import {componentRegistry,screenRegistry,dialogRegistry} from '../public/shared/registry.js';
import {routeRegistry} from '../public/shared/routes.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage,buildGraph} from '../public/admin-design/coverage.js';
import {renderFlowBoard} from '../public/shared/screens/flow-board.js';
import {escapeHtml} from '../public/shared/components/auth-primitives.js';
const fixtures=createFixtureAdapter().catalog();
const screen=id=>{const f=fixtures.screens.find(f=>f.fixtureId===id);return screenRegistry[f.screenId].render(...f.args);};
const visible=html=>html.replace(/<details\b[^>]*>.*?<\/details>/gs,'');
it('disclosure treats body/title/version as text and retains the complete service-owned notice',()=>{
 expect(()=>renderNoticeDisclosure({id:'bad" onclick="x',title:'bad'})).toThrow('INVALID_NOTICE_ID');
 const html=renderNoticeDisclosure({id:'safe-notice',title:'<img src=x>',body:['<script>bad</script>','another'],version:'" evil',open:true});
 expect(html).toContain('<details');expect(html).toContain(' open');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('data-notice-version="&quot; evil"');expect(html).not.toMatch(/role="(alert|status)"|aria-live/);
 const safety=renderAgentSafety();expect(safety).toContain(AGENT_SAFETY_VERSION);for(const paragraph of AGENT_SAFETY_NOTICE.split('\n\n'))expect(safety).toContain(escapeHtml(paragraph));
});
it('uses tighter actual count/bytes/time, distinguishes legacy/persisted, and never fills missing snapshot values',()=>{
 const recent={retention_mode:'recent_buffer',retention_seconds:120,recent_buffer:{max_messages:7,max_bytes:65536}};
 expect(policySummary(recent)).toMatchObject({ready:true});expect(policySummary(recent).text).toMatch(/7개·65,536 bytes·2분/);
 expect(policySummary({...recent,retention_seconds:undefined,recent_buffer:{...recent.recent_buffer,max_age_seconds:120}}).text).toBe(policySummary(recent).text);
 for(const room of [null,{...recent,recent_buffer:null},{...recent,retention_seconds:3601},{...recent,recent_buffer:{max_messages:501,max_bytes:2097152}},{...recent,recent_buffer:{max_messages:7,max_bytes:2097153}}])expect(policySummary(room).ready).toBe(false);
 expect(policySummary({retention_mode:'persisted',retention_seconds:86400}).text).toContain('1일');
 const memory={retention_mode:'memory',retention_seconds:null};expect(renderRetentionDisclosure({room:memory})).toContain('저장 방으로 자동 전환하지 않아요');expect(renderRetentionDisclosure({room:memory})).not.toContain('DB에 최대 500');
});
it('puts supporting policy after primary content while scope, key-loss, uncertain errors and explicit check remain visible',()=>{
 const intro=screen('intro');expect(intro.indexOf('service-description')).toBeLessThan(intro.indexOf('public-catalog'));expect(intro.indexOf('public-catalog')).toBeLessThan(intro.indexOf('id="retention-policy"'));expect(intro).not.toContain('새 방의 보관 조건을 확인해요');
 const lobby=screen('rooms-default');expect(lobby).not.toContain('lobby-note');expect(lobby).not.toContain('처음에는 최근 대화');expect(lobby).toContain('누구나 읽는 공개방');
 const newroom=screen('newroom-member'),essential=visible(newroom);expect(essential).toContain('종단 간 암호화');expect(essential).toContain('최초 결과를 잃으면 관리 키를 복구할 수 없어요');expect(essential).toMatch(/id="ownerRisk"[^>]+type="checkbox"/);expect(essential).toMatch(/type="submit" disabled/);
 expect(visible(screen('newroom-lost'))).toContain('CREATE_RESULT_NOT_RECOVERABLE');
 expect(screen('auth-login')).toContain('email-processing');expect(screen('auth-login')).not.toMatch(/최근 버퍼|장기 보관|2MiB/);
 const claim=visible(screen('claim-unchecked'));expect(claim).toContain('에이전트가 입력한 이름');expect(claim).toContain('claimRisk');expect(claim).not.toContain('새 방의 최근 보관 정책');
 const created=visible(screen('newroom-created-recent'));expect(created.indexOf('읽기 전용으로 관전하기')).toBeLessThan(created.indexOf('에이전트 초대 링크'));expect(created).toContain('관리 키는 한 번만 제공돼요');expect(created).not.toContain('toktok-risk-v2');
});
it('catalog includes disclosure states and action-based expand/collapse/explicit-consent, with negative coverage and acyclic progression',()=>{
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures};expect(validateCoverage(input)).toEqual([]);
 for(const mode of ['DEMO','HOSTED'])for(const role of ['all','anonymous','invited','admin'])expect(()=>renderFlowBoard(buildGraph({...input,fixtures:createFixtureAdapter().catalog(mode)}),{boardMode:mode,boardRole:role})).not.toThrow();
 expect(buildGraph(input).edges.find(e=>e.transitionId==='notice-retention-collapse').kind).toBe('reference');
 for(const [list,remove,issue] of [['components',f=>f.componentId==='notice-disclosure'&&f.state==='open','component:notice-disclosure:open'],['components',f=>f.componentId==='policy-summary'&&f.state==='unavailable','component:policy-summary:unavailable'],['transitions',f=>f.transitionId==='notice-risk-check','transition:notice-risk-check']]){const copy=structuredClone(fixtures);copy[list]=copy[list].filter(f=>!remove(f));expect(validateCoverage({...input,fixtures:copy})).toContain(issue);}
});
