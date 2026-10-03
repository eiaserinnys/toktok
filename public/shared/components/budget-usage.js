import {escapeHtml as E,notice} from './auth-primitives.js';
import {budgetKindLabels} from './schema-patterns.js';

// Read-only actual server usage. The editable settings draft remains separate.
export function renderBudgetUsage(resource={}){
 if(resource.status!=='ready'||!resource.value)return notice(resource.status==='loading'?'운영 예산을 불러오는 중이에요.':'운영 예산을 불러올 수 없어요.','실제 관리자 세션과 서버의 사용량 응답이 필요해요. 값을 추정해서 채우지 않아요.',resource.status==='loading'?'':'error');
 const {windows,usage,estimate,thresholds,model}=resource.value;
 const number=value=>E(value.toLocaleString('en-US'));
 const dollars=micro=>'$'+E((micro/model.micro_usd_per_usd).toLocaleString('en-US',{maximumFractionDigits:6}));
 const summary=(label,value,help)=>`<div><span>${E(label)}</span><strong>${value}</strong><small>${E(help)}</small></div>`;
 return `<section class="settings-card schema-money" data-budget-usage><h2>서버의 운영 예산</h2><p class="x-help">UTC ${E(windows.day)} / ${E(windows.month)} · 새로고침한 시점의 논리 예약량이에요.</p><div class="admin-summary">${summary('오늘 참고 추정',dollars(estimate.day_micro_usd),'변동 예약분')}${summary('이번 달 참고 추정',dollars(estimate.month_micro_usd),'고정 월 기준 '+dollars(model.fixed_month_micro_usd)+' 포함')}${summary('현재 서버 기준',dollars(thresholds.warning_usd*model.micro_usd_per_usd)+' / '+dollars(thresholds.cutoff_usd*model.micro_usd_per_usd),'경고 / 차단 · 목표 $'+thresholds.target_usd)}</div>${notice('Cloudflare 참고 추정 모델',`${model.version} · 실제 청구액이 아니며 청구 상한을 보장하지 않아요. Node 운영비와도 달라요. 메일 발송은 건당 1센트 계획(${dollars(model.rates.email_attempt_micro_usd)})이며 포함 사용량은 ${model.included_usage}이에요. ${estimate.cutoff_exceeded?'서버가 추정 차단 기준 초과를 표시했어요.':estimate.warning_reached?'서버가 추정 경고 기준 도달을 표시했어요.':'서버가 추정 경고 기준 미도달을 표시했어요.'}`,'peach')}<div class="schema-cap-list">${usage.map(row=>`<article class="schema-cap-card"><div class="schema-cap-name"><h3>${E(budgetKindLabels[row.kind]||row.kind)}</h3><span>${E(row.unit)}</span><code>${E(row.kind)}</code></div><div class="schema-field"><span>오늘 예약 / 한도</span><strong>${number(row.day.reserved)} / ${number(row.day.limit)}</strong></div><div class="schema-field"><span>이번 달 예약 / 한도</span><strong>${number(row.month.reserved)} / ${number(row.month.limit)}</strong></div></article>`).join('')}</div><p class="schema-apply">다음 UTC 일 경계 ${E(windows.next_day_at)} · 월 경계 ${E(windows.next_month_at)}</p></section>`;
}
