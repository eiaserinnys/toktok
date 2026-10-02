import {HttpError,fail} from './http';
import type {EmailLimits} from './email';
import type {FlowRow,RegistryInput} from './identity-types';
import {C,type Tx,save,read,digest,expire} from './control-records';
import {SettingsStore} from './settings-store';
import {budgetWindows,newBudgetOperation,budgetDecision} from './control-policy';
export interface SendReceipt {receipt:string;state:string;retry_after:number;expires_at:number;}
export interface Reservation {receipt:SendReceipt;dispatch?:{to:string;code:string;expires_at:number};}
export class OtpStore{
 constructor(private tx:Tx){}
 digest(...values:string[]){return digest(this.tx,...values);}
 private code(){let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);return String(n%1000000).padStart(6,'0');}
 private async row(input:RegistryInput,now:number){const f=await read<FlowRow>(this.tx,C.flows,'f:'+input.flow_hash!);if(!f||f.consumed||f.expires_at<=now||f.browser_hash!==input.browser_hash)fail(403,'AUTH_FLOW_DENIED','인증 흐름이 없거나 사용할 수 없습니다.');return f;}
 async reserve(input:RegistryInput,limits:EmailLimits,now:number,validate:(f:FlowRow)=>Promise<void>,eligible:(email:string,f:FlowRow)=>Promise<boolean>,lifetimeSeconds:number):Promise<Reservation>{
  const email=input.email!,emailKey=await this.digest('email',email),ipKey=await this.digest('ip',input.ip!),f=await this.row(input,now);await validate(f);
  const requestKey=`request:${input.flow_hash!}:${input.request_id!}`,previous=await this.tx.get(C.otp,requestKey);
  if(previous){if(previous.email_key!==emailKey)fail(409,'IDEMPOTENCY_CONFLICT','같은 요청 식별자의 내용이 다릅니다.');return {receipt:{receipt:String(previous.receipt),state:'attempted',retry_after:limits.cooldown_seconds,expires_at:Number(previous.expires_at)}};}
  if(f.email_key&&f.email_key!==emailKey)fail(409,'AUTH_EMAIL_BOUND','다른 이메일에는 새 인증 흐름이 필요합니다.');
  const date=new Date(now),hour=date.toISOString().slice(0,13),w=budgetWindows(now),hourEnd=(Math.floor(now/3600000)+1)*3600000;
  const windows=[{key:`count:${emailKey}:h:${hour}`,cap:limits.email_hour,end:hourEnd},{key:`count:${emailKey}:d:${w.day}`,cap:limits.email_day,end:w.dayEnd},{key:`count:${ipKey}:h:${hour}`,cap:limits.ip_hour,end:hourEnd},{key:`count:${ipKey}:d:${w.day}`,cap:limits.ip_day,end:w.dayEnd}];
  const last=await this.tx.get(C.otp,'cool:'+emailKey);let retry=last?Math.max(0,Number(last.last_at)+limits.cooldown_seconds*1000-now):0;
  const counters=[];for(const limit of windows){const n=Number((await this.tx.get(C.otp,limit.key))?.n??0);if(!Number.isSafeInteger(n)||n<0)fail(503,'CONTROL_STATE_INVALID','발송 상태를 확인하지 못했습니다.');if(n>=limit.cap)retry=Math.max(retry,limit.end-now);counters.push({...limit,n});}
  const store=new SettingsStore(this.tx),settings=(await store.read()).settings;
  const day=Number((await this.tx.get(C.budgets,`usage:email_attempts:d:${w.day}`))?.used??0),month=Number((await this.tx.get(C.budgets,`usage:email_attempts:m:${w.month}`))?.used??0);
  const decision=budgetDecision(settings,'email_attempts',1,day,month);if(month>=limits.month||decision.monthExceeded)retry=Math.max(retry,w.monthEnd-now);if(decision.dayExceeded)retry=Math.max(retry,w.dayEnd-now);
  if(retry>0)throw new HttpError(429,'EMAIL_RATE_LIMITED','이메일 발송 한도를 초과했습니다.',Math.ceil(retry/1000));
  const allowed=await eligible(email,f),code=allowed?this.code():'',otpDigest=code?await this.digest('otp',input.flow_hash!,email,f.nonce_hash,code):'',expires=Math.min(f.expires_at,now+lifetimeSeconds*1000);
  if(allowed)await store.reserveBudget(newBudgetOperation(now,expires),'email_attempts',1,now);
  await save(this.tx,C.flows,'f:'+input.flow_hash!,{...f,email_key:emailKey});
  for(const c of counters){await save(this.tx,C.otp,c.key,{n:c.n+1,expires_at:c.end});await expire(this.tx,C.otp,c.key,c.end);}
  await save(this.tx,C.otp,'cool:'+emailKey,{last_at:now,expires_at:now+172800000});await expire(this.tx,C.otp,'cool:'+emailKey,now+172800000);
  const receipt=crypto.randomUUID();await save(this.tx,C.otp,requestKey,{email_key:emailKey,receipt,state:allowed?'uncertain':'suppressed',dispatch_attempted:allowed,reservation_month:w.month,expires_at:expires});await expire(this.tx,C.otp,requestKey,expires);
  await this.tx.delete(C.otp,'code:'+input.flow_hash!);
  if(allowed){await save(this.tx,C.otp,'code:'+input.flow_hash!,{email,digest:otpDigest,expires_at:expires,attempts:0});await expire(this.tx,C.otp,'code:'+input.flow_hash!,expires);}
  return {receipt:{receipt,state:'attempted',retry_after:limits.cooldown_seconds,expires_at:expires},...(allowed?{dispatch:{to:email,code,expires_at:expires}}:{})};
 }
 async result(input:RegistryInput){const key=`request:${input.flow_hash!}:${input.request_id!}`,row=await this.tx.get(C.otp,key);if(row){await save(this.tx,C.otp,key,{...row,state:input.delivery_state!});return {receipt:row.receipt,state:input.delivery_state};}return {};}
 async verify(input:RegistryInput,now:number,validate:()=>Promise<void>,success:(email:string)=>Promise<void>,maxAttempts:number){
  await validate();const key='code:'+input.flow_hash!,code=await this.tx.get(C.otp,key);if(!code||Number(code.expires_at)<=now)return false;
  const calculated=await this.digest('otp',input.flow_hash!,String(code.email),input.nonce_hash!,input.otp!);
  if(code.digest!==calculated){const attempts=Number(code.attempts)+1;if(attempts>=maxAttempts)await this.tx.delete(C.otp,key);else await save(this.tx,C.otp,key,{...code,attempts});return false;}
  await success(String(code.email));await this.tx.delete(C.otp,key);return true;
 }
}
