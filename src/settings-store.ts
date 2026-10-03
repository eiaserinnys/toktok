import {HttpError,bad,fail} from './http';
import {DEFAULT_SETTINGS,validateSettings,publicConfig,type Settings,type BudgetKind,BUDGET_KINDS} from './settings-schema';
import {budgetDecision,budgetWindows,validateBudgetOperation} from './control-policy';
import {C,type Tx,save,read,expire} from './control-records';
import {CONTROL_ENFORCEMENT_VERSION,enforcementReady,type TrustedEnforcement,type InstallationSeed} from './control-installation';
import {BUDGET_ESTIMATE_MODEL,reservationMicroUsd,estimateState} from './control-budget';
export interface ControlState {bootstrap_consumed:boolean;budget_ready:boolean;lifecycle_ready:boolean;active_private:number;pending_agents:number;}
export interface SettingsRow {schema_version:number;revision:number;settings:Settings;updated_at:number;updated_by:string|null;}
/** One transaction is owned by ControlCore. Helpers never open nested transactions. */
export class SettingsStore {
 constructor(private tx:Tx){}
 async init(now:number,seed?:InstallationSeed,enforcement?:TrustedEnforcement,repositoryReady=false){
  const marker=await this.tx.get(C.settings,'domain_schema');
  if(!marker){if((await this.tx.list(C.settings,{limit:1})).length)fail(503,'SETTINGS_INVALID','서버 설정을 확인하지 못했습니다.');
   const profile=validateSettings(seed?seed.profile:DEFAULT_SETTINGS),connected=enforcementReady(enforcement,repositoryReady);
   if(profile.deployment.enabled&&(!seed||seed.enforcement_version!==CONTROL_ENFORCEMENT_VERSION||!connected))fail(503,'ENFORCEMENT_NOT_READY','검증된 설치 연결 전에는 활성 seed를 적용할 수 없습니다.');
   await save(this.tx,C.settings,'domain_schema',{version:1});await save(this.tx,C.settings,'config',{schema_version:1,revision:1,settings:profile,updated_at:now,updated_by:null});
   await save(this.tx,C.settings,'state',{bootstrap_consumed:false,budget_ready:connected,lifecycle_ready:connected,active_private:0,pending_agents:0});
   await save(this.tx,C.settings,'hmac',{key:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')});
  }else if(marker.version!==1)fail(503,'SETTINGS_INVALID','서버 설정을 확인하지 못했습니다.');
  await this.read();await this.state();
 }
 async read():Promise<SettingsRow>{try{const row=await read<SettingsRow>(this.tx,C.settings,'config');if(!row||row.schema_version!==1||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error();return {...row,settings:validateSettings(row.settings)};}catch{fail(503,'SETTINGS_INVALID','서버 설정을 확인하지 못했습니다.');}}
 async state():Promise<ControlState>{const s=await read<ControlState>(this.tx,C.settings,'state');if(!s||[s.bootstrap_consumed,s.budget_ready,s.lifecycle_ready].some(v=>typeof v!=='boolean')||[s.active_private,s.pending_agents].some(v=>!Number.isSafeInteger(v)||v<0))fail(503,'CONTROL_STATE_INVALID','서버 상태를 확인하지 못했습니다.');return s;}
 stateSave(state:ControlState){return save(this.tx,C.settings,'state',state);}
 async projection(){const row=await this.read();return publicConfig(row.settings,row.revision);}
 async audit(actor:string,time:number,action:string,revision:number|null,changes:Record<string,unknown>){await save(this.tx,C.audit,`${String(Number.MAX_SAFE_INTEGER-time).padStart(16,'0')}:${crypto.randomUUID()}`,{actor,time,action,revision,changes});}
 async update(expected:unknown,value:unknown,actor:string,now:number){
  if(typeof expected!=='number'||!Number.isSafeInteger(expected)||expected<1)bad();const next=validateSettings(value),old=await this.read();if(old.revision!==expected)fail(409,'REVISION_CONFLICT','설정이 변경되었습니다. 다시 확인하세요.');
  const state=await this.state();if(!old.settings.deployment.enabled&&next.deployment.enabled&&!state.budget_ready)fail(409,'BUDGET_NOT_READY','예산 enforcing path 연결 전에는 활성화할 수 없습니다.');
  if(old.settings.deployment.mode!==next.deployment.mode&&(!state.lifecycle_ready||state.active_private!==0))fail(409,'MODE_DRAIN_REQUIRED','방 lifecycle 확인과 활성 비공개방 종료가 필요합니다.');
  const changes:Record<string,unknown>={};
  const visit=(before:unknown,after:unknown,path:string)=>{if(JSON.stringify(before)===JSON.stringify(after))return;if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){for(const key of Object.keys(after))visit((before as Record<string,unknown>)[key],(after as Record<string,unknown>)[key],path?path+'.'+key:key);}else changes[path]=path==='public.catalog'?{count:(after as Settings['public']['catalog']).length,enabled_count:(after as Settings['public']['catalog']).filter(c=>c.enabled).length}:after;};
  visit(old.settings,next,'');const revision=old.revision+1,row={...old,revision,settings:next,updated_at:now,updated_by:actor};await save(this.tx,C.settings,'config',row);await this.audit(actor,now,'settings.update',revision,changes);
  return {...row,effect_summary:{runtime_refresh_max_seconds:10,capacity:'natural_drain_no_eviction',existing_room_snapshot:'unchanged',changed_keys:Object.keys(changes)}};
 }
 async listAudit(limit:number){return (await this.tx.list(C.audit,{limit})).map(r=>r.value);}
 private async used(key:string){const value=Number((await this.tx.get(C.budgets,key))?.used??0);if(!Number.isSafeInteger(value)||value<0)fail(503,'CONTROL_STATE_INVALID','예산 상태를 확인하지 못했습니다.');return value;}
 async budget(now:number){
  const settings=(await this.read()).settings,w=budgetWindows(now),usage=[];
  for(const cap of settings.budget.workloadCaps)usage.push({kind:cap.kind,unit:cap.unit,day:{reserved:await this.used(`usage:${cap.kind}:d:${w.day}`),limit:cap.day},month:{reserved:await this.used(`usage:${cap.kind}:m:${w.month}`),limit:cap.month}});
  return {windows:{day:w.day,month:w.month,next_day_at:new Date(w.dayEnd).toISOString(),next_month_at:new Date(w.monthEnd).toISOString()},usage,estimate:estimateState(settings,await this.used('estimate:d:'+w.day),await this.used('estimate:m:'+w.month)),thresholds:{target_usd:settings.budget.targetUsd,warning_usd:settings.budget.warningUsd,cutoff_usd:settings.budget.cutoffUsd},model:BUDGET_ESTIMATE_MODEL};
 }
 async reserveBudget(operation_id:string,kind:BudgetKind,amount:number,now:number){
  if(!BUDGET_KINDS.includes(kind))bad();const key='op:'+operation_id;
  const old=await this.tx.get(C.budgets,key);if(old&& (old.kind!==kind||old.amount!==amount))fail(409,'IDEMPOTENCY_CONFLICT','작업 식별자의 내용이 다릅니다.');const expiry=validateBudgetOperation(operation_id,kind,now);if(old)return {day:String(old.day),month:String(old.month),reserved:true,replayed:true};
  const settings=(await this.read()).settings,w=budgetWindows(now),dayKey=`usage:${kind}:d:${w.day}`,monthKey=`usage:${kind}:m:${w.month}`;
  const day=Number((await this.tx.get(C.budgets,dayKey))?.used??0),month=Number((await this.tx.get(C.budgets,monthKey))?.used??0);
  if([day,month].some(n=>!Number.isSafeInteger(n)||n<0))fail(503,'CONTROL_STATE_INVALID','작업량 상태를 확인하지 못했습니다.');
  const decision=budgetDecision(settings,kind,amount,day,month);if(!decision.allowed)throw new HttpError(429,'BUDGET_EXCEEDED','작업량 상한에 도달했습니다.',Math.ceil(((decision.monthExceeded?w.monthEnd:w.dayEnd)-now)/1000));
  const cost=reservationMicroUsd(kind,amount),estimateDayKey='estimate:d:'+w.day,estimateMonthKey='estimate:m:'+w.month;
  const estimatedDay=await this.used(estimateDayKey),estimatedMonth=await this.used(estimateMonthKey);
  if(estimateState(settings,estimatedDay+cost,estimatedMonth+cost).cutoff_exceeded)throw new HttpError(429,'ESTIMATED_BUDGET_EXCEEDED','추정 예산 상한에 도달했습니다.',Math.max(1,Math.ceil((w.monthEnd-now)/1000)));
  await save(this.tx,C.budgets,estimateDayKey,{used:estimatedDay+cost});await save(this.tx,C.budgets,estimateMonthKey,{used:estimatedMonth+cost});
  await save(this.tx,C.budgets,dayKey,{used:day+amount});await save(this.tx,C.budgets,monthKey,{used:month+amount});await save(this.tx,C.budgets,key,{kind,amount,day:w.day,month:w.month,estimated_micro_usd:cost,estimate_model:BUDGET_ESTIMATE_MODEL.version,expires_at:expiry});
  await expire(this.tx,C.budgets,key,expiry);return {day:w.day,month:w.month,reserved:true,replayed:false};
 }
}
