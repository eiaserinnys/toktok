import {bad,fail} from './http';
import type {BudgetKind,Settings} from './settings-schema';

/** Conservative reference estimate, not an invoice meter or a Node hosting cost model. */
export const BUDGET_ESTIMATE_MODEL={
 version:'CF-reference-v1',currency:'USD',micro_usd_per_usd:1000000,
 scope:'cloudflare_reference_not_node_operating_cost',actual_invoice:false,included_usage:0,
 fixed_month_micro_usd:25000000,reservation_base_micro_usd:14,
 email_pricing:'planned_one_cent_per_attempt',
 rates:{admission_request_micro_usd:3,response_bytes_per_micro_usd:65536,active_room_second_micro_usd:2,persistent_write_bytes_per_micro_usd:16,email_attempt_micro_usd:10000}
} as const;
export function reservationMicroUsd(kind:BudgetKind,amount:number):number{
 if(!Number.isSafeInteger(amount)||amount<=0)bad();const rates=BUDGET_ESTIMATE_MODEL.rates;
 const variable=kind==='admission_requests'?rates.admission_request_micro_usd*amount:
  kind==='response_bytes'?Math.ceil(amount/rates.response_bytes_per_micro_usd):
  kind==='active_room_seconds'?rates.active_room_second_micro_usd*amount:
  kind==='persistent_write_bytes'?Math.ceil(amount/rates.persistent_write_bytes_per_micro_usd):
  kind==='email_attempts'?rates.email_attempt_micro_usd*amount:kind==='private_creates'?0:bad();
 const result=BUDGET_ESTIMATE_MODEL.reservation_base_micro_usd+variable;if(!Number.isSafeInteger(result))bad();return result;
}
export function estimateState(settings:Settings,dayVariable:number,monthVariable:number){
 const month=BUDGET_ESTIMATE_MODEL.fixed_month_micro_usd+monthVariable;
 if([dayVariable,monthVariable,month].some(n=>!Number.isSafeInteger(n)||n<0))fail(503,'CONTROL_STATE_INVALID','추정 예산 상태를 확인하지 못했습니다.');
 return {day_micro_usd:dayVariable,month_micro_usd:month,warning_reached:month>=settings.budget.warningUsd*BUDGET_ESTIMATE_MODEL.micro_usd_per_usd,cutoff_exceeded:month>settings.budget.cutoffUsd*BUDGET_ESTIMATE_MODEL.micro_usd_per_usd};
}
