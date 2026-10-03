import {HttpError,bad,fail} from './http';
import {budgetWindows,validateBudgetOperation} from './control-policy';
import {C,type Tx,save,digest,expire} from './control-records';
/** Fixed bounded recovery headroom, never an administrator setting or public dispatcher. */
export const ADMIN_RECOVERY_BOUNDS={minute:10,day:100,month:1000,response_bytes_limit:65536} as const;
function windows(now:number){const w=budgetWindows(now);return {minute:Math.floor(now/60000),minuteEnd:(Math.floor(now/60000)+1)*60000,...w};}
export class AdminRecovery {
 constructor(private tx:Tx){}
 private async used(key:string){const n=Number((await this.tx.get(C.budgets,key))?.used??0);if(!Number.isSafeInteger(n)||n<0)fail(503,'CONTROL_STATE_INVALID','복구 사용량을 확인하지 못했습니다.');return n;}
 async usage(now:number){const w=windows(now);return {bounds:{minute:ADMIN_RECOVERY_BOUNDS.minute,day:ADMIN_RECOVERY_BOUNDS.day,month:ADMIN_RECOVERY_BOUNDS.month},usage:{minute:await this.used('recovery:minute:'+w.minute),day:await this.used('recovery:day:'+w.day),month:await this.used('recovery:month:'+w.month)},response_bytes_limit:ADMIN_RECOVERY_BOUNDS.response_bytes_limit,next_minute_at:new Date(w.minuteEnd).toISOString(),next_day_at:new Date(w.dayEnd).toISOString(),next_month_at:new Date(w.monthEnd).toISOString()};}
 /** Host has already verified the current session's actual DB admin and mutation CSRF. */
 async reserve(input:{session_hash:string;csrf?:string;mutation:boolean;operation_id:string},now:number){
  if(typeof input.mutation!=='boolean')bad();const binding=await digest(this.tx,'admin-recovery',input.session_hash,input.mutation?'mutation':'read',input.mutation?input.csrf!:'');
  const key='recovery:op:'+input.operation_id,old=await this.tx.get(C.budgets,key);
  if(old&&old.binding!==binding)fail(409,'IDEMPOTENCY_CONFLICT','복구 작업 식별자의 결합이 다릅니다.');
  const expires_at=validateBudgetOperation(input.operation_id,'admission_requests',now);
  if(old)return {response_bytes_limit:ADMIN_RECOVERY_BOUNDS.response_bytes_limit};
  const w=windows(now),counters=[{key:'recovery:minute:'+w.minute,max:ADMIN_RECOVERY_BOUNDS.minute,end:w.minuteEnd},{key:'recovery:day:'+w.day,max:ADMIN_RECOVERY_BOUNDS.day,end:w.dayEnd},{key:'recovery:month:'+w.month,max:ADMIN_RECOVERY_BOUNDS.month,end:w.monthEnd}];
  const used=[];let retry=0;for(const c of counters){const count=await this.used(c.key);used.push({...c,count});if(count>=c.max)retry=Math.max(retry,c.end-now);}
  if(retry)throw new HttpError(429,'ADMIN_RECOVERY_LIMITED','관리자 복구 요청 한도를 초과했습니다.',Math.max(1,Math.ceil(retry/1000)));
  for(const c of used){const expiry=c.end+172800000;await save(this.tx,C.budgets,c.key,{used:c.count+1,expires_at:expiry});await expire(this.tx,C.budgets,c.key,expiry);}
  await save(this.tx,C.budgets,key,{binding,minute:w.minute,day:w.day,month:w.month,expires_at});await expire(this.tx,C.budgets,key,expires_at);
  return {response_bytes_limit:ADMIN_RECOVERY_BOUNDS.response_bytes_limit};
 }
}
