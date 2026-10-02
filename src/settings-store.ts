import {HttpError,bad,fail} from './http';
import {DEFAULT_SETTINGS,validateSettings,publicConfig,type Settings,type BudgetKind,BUDGET_KINDS} from './settings-schema';
import {budgetDecision,budgetWindows,validateBudgetOperation} from './control-policy';
interface SettingsRow {revision:number;settings:string;updated_at:number;updated_by:string|null;schema_version:number;}
export class SettingsStore {
 constructor(private storage:DurableObjectStorage){}
 private get sql(){return this.storage.sql;}
 init(){
  const first=!this.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='control_settings'").toArray().length;
  this.sql.exec(`CREATE TABLE IF NOT EXISTS control_settings(id INTEGER PRIMARY KEY,schema_version INTEGER NOT NULL,revision INTEGER NOT NULL,settings TEXT NOT NULL,updated_at INTEGER NOT NULL,updated_by TEXT);
   CREATE TABLE IF NOT EXISTS control_state(id INTEGER PRIMARY KEY,bootstrap_consumed INTEGER NOT NULL,budget_ready INTEGER NOT NULL,lifecycle_ready INTEGER NOT NULL,active_private INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS control_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,time INTEGER NOT NULL,action TEXT NOT NULL,revision INTEGER,changes TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS budget_usage(kind TEXT NOT NULL,window TEXT NOT NULL,used INTEGER NOT NULL,PRIMARY KEY(kind,window));
   CREATE TABLE IF NOT EXISTS budget_operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,amount INTEGER NOT NULL,day TEXT NOT NULL,month TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  if(first){
   this.sql.exec('INSERT INTO control_settings VALUES(1,1,1,?,?,NULL)',JSON.stringify(DEFAULT_SETTINGS),Date.now());
   this.sql.exec('INSERT INTO control_state VALUES(1,0,0,0,0)');
  }
  this.read(); // A corrupt row is an error, not permission to reseed.
 }
 read(){
  const row=this.sql.exec('SELECT * FROM control_settings WHERE id=1').toArray()[0] as unknown as SettingsRow|undefined;
  try{if(!row||row.schema_version!==1||!Number.isSafeInteger(row.revision)||row.revision<1||!this.sql.exec('SELECT id FROM control_state WHERE id=1').toArray().length)throw Error('invalid');
   return {schema_version:1,revision:row.revision,settings:validateSettings(JSON.parse(row.settings)),updated_at:row.updated_at,updated_by:row.updated_by};
  }catch{fail(503,'SETTINGS_INVALID','서버 설정을 확인하지 못했습니다.');}
 }
 projection(){const row=this.read();return publicConfig(row.settings,row.revision);}
 audit(actor:string,time:number,action:string,revision:number|null,changes:Record<string,unknown>){this.sql.exec('INSERT INTO control_audit VALUES(?,?,?,?,?,?)',crypto.randomUUID(),actor,time,action,revision,JSON.stringify(changes));}
 update(expected:unknown,value:unknown,actor:string,now:number){
  if(typeof expected!=='number'||!Number.isSafeInteger(expected)||expected<1)bad();const next=validateSettings(value);
  return this.storage.transactionSync(()=>{
   const old=this.read();if(old.revision!==expected)fail(409,'REVISION_CONFLICT','설정이 변경되었습니다. 다시 확인하세요.');
   const state=this.sql.exec('SELECT * FROM control_state WHERE id=1').one();
   if(!old.settings.deployment.enabled&&next.deployment.enabled&&!state.budget_ready)fail(409,'BUDGET_NOT_READY','예산 enforcing path 연결 전에는 활성화할 수 없습니다.');
   if(old.settings.deployment.mode!==next.deployment.mode&&(!state.lifecycle_ready||Number(state.active_private)!==0))fail(409,'MODE_DRAIN_REQUIRED','방 lifecycle 확인과 활성 비공개방 종료가 필요합니다.');
   const changes:Record<string,unknown>={};
   const visit=(before:unknown,after:unknown,path:string)=>{if(JSON.stringify(before)===JSON.stringify(after))return;if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){for(const key of Object.keys(after))visit((before as Record<string,unknown>)[key],(after as Record<string,unknown>)[key],path?path+'.'+key:key);}else changes[path]=path==='public.catalog'?{count:(after as Settings['public']['catalog']).length,enabled_count:(after as Settings['public']['catalog']).filter(c=>c.enabled).length}:after;};
   visit(old.settings,next,'');const revision=old.revision+1;
   this.sql.exec('UPDATE control_settings SET revision=?,settings=?,updated_at=?,updated_by=? WHERE id=1',revision,JSON.stringify(next),now,actor);this.audit(actor,now,'settings.update',revision,changes);
   return {...this.read(),effect_summary:{runtime_refresh_max_seconds:10,capacity:'natural_drain_no_eviction',existing_room_snapshot:'unchanged',changed_keys:Object.keys(changes)}};
  });
 }
 listAudit(limit:number){return this.sql.exec('SELECT actor,time,action,revision,changes FROM control_audit ORDER BY time DESC,id DESC LIMIT ?',limit).toArray().map(row=>({...row,changes:JSON.parse(String(row.changes)) as unknown}));}
 reserveBudget(operation_id:string,kind:BudgetKind,amount:number,now:number){
  const expiry=validateBudgetOperation(operation_id,kind,now);if(!BUDGET_KINDS.includes(kind))bad();
  return this.storage.transactionSync(()=>{
   const old=this.sql.exec('SELECT * FROM budget_operations WHERE id=?',operation_id).toArray()[0];
   if(old){if(old.kind!==kind||old.amount!==amount)fail(409,'IDEMPOTENCY_CONFLICT','작업 식별자의 내용이 다릅니다.');return {day:String(old.day),month:String(old.month),reserved:true,replayed:true};}
   const settings=this.read().settings,w=budgetWindows(now);
   const used=(window:string)=>Number(this.sql.exec('SELECT used FROM budget_usage WHERE kind=? AND window=?',kind,window).toArray()[0]?.used??0);
   const decision=budgetDecision(settings,kind,amount,used('d:'+w.day),used('m:'+w.month));
   if(!decision.allowed)throw new HttpError(429,'BUDGET_EXCEEDED','작업량 상한에 도달했습니다.',Math.ceil(((decision.monthExceeded?w.monthEnd:w.dayEnd)-now)/1000));
   for(const window of ['d:'+w.day,'m:'+w.month])this.sql.exec('INSERT INTO budget_usage VALUES(?,?,?) ON CONFLICT(kind,window) DO UPDATE SET used=used+excluded.used',kind,window,amount);
   this.sql.exec('INSERT INTO budget_operations VALUES(?,?,?,?,?,?)',operation_id,kind,amount,w.day,w.month,expiry);return {day:w.day,month:w.month,reserved:true,replayed:false};
  });
 }
 cleanup(now:number){this.sql.exec('DELETE FROM budget_operations WHERE expires_at<=?',now);}
}
