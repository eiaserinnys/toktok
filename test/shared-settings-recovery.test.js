import {it,expect} from 'vitest';
import {mapBudget} from '../public/effects/budget-projection.js';
import {renderBudgetUsage} from '../public/shared/components/budget-usage.js';
import {budgetFixture} from '../public/admin-design/budget-fixtures.js';
const recovery=()=>({bounds:{minute:11,day:222,month:3333},usage:{minute:2,day:7,month:21},response_bytes_limit:65536,next_minute_at:'2026-10-03T12:01:00.000Z',next_day_at:'2026-10-04T00:00:00.000Z',next_month_at:'2026-11-01T00:00:00.000Z'});
it('preserves the exact admin recovery DTO and rejects malformed usage without inventing a bound',()=>{
 const data={...structuredClone(budgetFixture),recovery:recovery()};expect(mapBudget(data).recovery).toEqual(recovery());
 const invalid=structuredClone(data);invalid.recovery.usage.minute=-1;expect(()=>mapBudget(invalid)).toThrow('INVALID_BUDGET');
 const missing=structuredClone(data);delete missing.recovery.bounds.day;expect(()=>mapBudget(missing)).toThrow('INVALID_BUDGET');
});
it('shows actual recovery usage and bounds read-only, separately from ordinary quota and USD',()=>{
 const html=renderBudgetUsage({status:'ready',value:{...structuredClone(budgetFixture),recovery:recovery()}});
 expect(html).toContain('data-budget-recovery');expect(html).toContain('2 / 11');expect(html).toContain('7 / 222');expect(html).toContain('21 / 3,333');expect(html).toContain('65,536');expect(html).toContain('필수 설정 복구');expect(html).toContain('일반 API');expect(html).not.toContain('<input');expect(html).not.toContain('한도 해제');
});
it('keeps missing recovery unavailable while preserving a valid earlier usage response',()=>{
 const value=structuredClone(budgetFixture);delete value.recovery;const html=renderBudgetUsage({status:'ready',value:mapBudget(value)});
 expect(html).toContain('복구 사용량을 확인할 수 없어요');expect(html).not.toContain('0 / 10');expect(html).toContain('서버의 운영 예산');
});
