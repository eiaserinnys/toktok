import {env} from 'cloudflare:workers';
import {SELF,runInDurableObject} from 'cloudflare:test';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {ControlCore} from '../src/control-core';
import {SettingsStore} from '../src/settings-store';
import {C,save,type Tx} from '../src/control-records';
import {newBudgetOperation,budgetWindows} from '../src/control-policy';
import {hash,newToken} from '../src/http';
import type {RegistryInput} from '../src/identity-types';
const origin='http://localhost:8787',stub=()=>env.IDENTITIES.getByName('team');
let now:number;const evidence:{step:string;status:number;code?:string;retry_after?:number;state?:Record<string,number|boolean|string>}[]=[];
const records=<T>(fn:(tx:Tx)=>Promise<T>)=>runInDurableObject(stub(),(_i,state)=>new CloudflareRepository(state.storage).transaction('control',fn));
async function direct(action:string,input:RegistryInput={}){
 const result=await runInDurableObject(stub(),async(_i,state)=>{const core=new ControlCore(new CloudflareRepository(state.storage));try{return {status:200,value:await core.execute(action,{...input,now})};}catch(e){const err=e as {status?:number;code?:string;retryAfter?:number};return {status:err.status??500,code:err.code,retry_after:err.retryAfter};}});
 evidence.push({step:action,status:result.status,code:result.code,retry_after:result.retry_after});return result;
}
const operation=()=>newBudgetOperation(now,now+60000);
async function limits(cutoff=26,warning=25){await records(async tx=>{const s=new SettingsStore(tx),row=await s.read();row.settings.budget.cutoffUsd=cutoff;row.settings.budget.warningUsd=warning;await s.update(row.revision,row.settings,'fixture-actor',now);});}
async function usage(){return records(async tx=>{const w=budgetWindows(now);return {quantityDay:Number((await tx.get(C.budgets,'usage:admission_requests:d:'+w.day))?.used??0),quantityMonth:Number((await tx.get(C.budgets,'usage:admission_requests:m:'+w.month))?.used??0),estimateDay:Number((await tx.get(C.budgets,'estimate:d:'+w.day))?.used??0),estimateMonth:Number((await tx.get(C.budgets,'estimate:m:'+w.month))?.used??0)};});}
beforeEach(async()=>{evidence.length=0;now=Date.UTC(2030,0,1);await runInDurableObject(stub(),async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();await new CloudflareRepository(state.storage).apply();});await (await SELF.fetch(origin+'/__control/reset')).arrayBuffer();expect((await direct('config')).status).toBe(200);});
afterEach(()=>console.log('CONTROL_ESTIMATE_EVIDENCE '+JSON.stringify(evidence)));

it('estimated costs for all six kinds reserve day and month with immutable source settings',async()=>{
 const cases=[['admission_requests',2,20],['response_bytes',65537,16],['private_creates',1,14],['active_room_seconds',3,20],['persistent_write_bytes',17,16],['email_attempts',2,20014]] as const;
 for(const [kind,amount] of cases)expect((await direct('budget-reserve',{operation_id:operation(),kind,amount})).status).toBe(200);
 const actual=await usage(),expected=cases.reduce((sum,c)=>sum+c[2],0);evidence.push({step:'all kinds estimate before assertions',status:200,state:actual});expect(actual.estimateDay).toBe(expected);expect(actual.estimateMonth).toBe(expected);expect(actual.quantityDay).toBe(2);
 const config=await records(async tx=>new SettingsStore(tx).read());expect(config.settings.budget.cutoffUsd).toBe(70);expect(config.revision).toBe(1);
});
it('estimated cutoff has exactly one concurrent winner and rejects without partial quantity or estimate writes',async()=>{
 await limits(26);await records(async tx=>save(tx,C.budgets,'estimate:m:2030-01',{used:999983}));
 const results=await Promise.all([1,2,3].map(()=>direct('budget-reserve',{operation_id:operation(),kind:'admission_requests',amount:1})));
 const actual=await usage();evidence.push({step:'estimate race before assertions',status:200,state:actual});expect(results.map(r=>r.status).sort()).toEqual([200,429,429]);expect(results.filter(r=>r.status===429).every(r=>r.code==='ESTIMATED_BUDGET_EXCEEDED')).toBe(true);expect(actual).toEqual({quantityDay:1,quantityMonth:1,estimateDay:17,estimateMonth:1000000});
 expect(results.find(r=>r.status===429)?.retry_after).toBe(Math.ceil((budgetWindows(now).monthEnd-now)/1000));
});
it('replay retains the initial UTC day and month with zero added estimate, conflicts and expired IDs remain closed',async()=>{
 now=Date.UTC(2030,0,31,23,59,59);const id=operation();expect((await direct('budget-reserve',{operation_id:id,kind:'admission_requests',amount:1})).status).toBe(200);
 now+=2000;const replay=await direct('budget-reserve',{operation_id:id,kind:'admission_requests',amount:1});expect(replay.status).toBe(200);expect(replay.value).toMatchObject({day:'2030-01-31',month:'2030-01',replayed:true});
 const current=await usage(),previous=await records(async tx=>({day:Number((await tx.get(C.budgets,'estimate:d:2030-01-31'))?.used??0),month:Number((await tx.get(C.budgets,'estimate:m:2030-01'))?.used??0)}));evidence.push({step:'month-boundary replay before assertions',status:200,state:{...current,previous_day:previous.day,previous_month:previous.month}});expect(current).toEqual({quantityDay:0,quantityMonth:0,estimateDay:0,estimateMonth:0});expect(previous).toEqual({day:17,month:17});
 expect((await direct('budget-reserve',{operation_id:id,kind:'private_creates',amount:1})).status).toBe(409);expect((await direct('budget-reserve',{operation_id:id,kind:'admission_requests',amount:2})).status).toBe(409);now+=60000;expect((await direct('budget-reserve',{operation_id:id,kind:'admission_requests',amount:1})).status).toBe(410);
});
it('quantity rejection rolls back estimated totals and a tightened cutoff applies to response byte reservations',async()=>{
 await records(async tx=>save(tx,C.budgets,'usage:admission_requests:d:2030-01-01',{used:100000}));expect((await direct('budget-reserve',{operation_id:operation(),kind:'admission_requests',amount:1})).code).toBe('BUDGET_EXCEEDED');const before=await usage();expect(before.estimateDay).toBe(0);expect(before.estimateMonth).toBe(0);
 await limits(25);const id=operation();const denied=await direct('budget-reserve',{operation_id:id,kind:'response_bytes',amount:1});expect(denied.code).toBe('ESTIMATED_BUDGET_EXCEEDED');expect(await records(tx=>tx.get(C.budgets,'op:'+id))).toBeUndefined();expect(await usage()).toEqual(before);
});
it('budget HTTP requires actual admin role and exposes model assumptions without public config usage',async()=>{
 const make=async(role:'member'|'admin')=>{const token=newToken(),id=crypto.randomUUID(),digest=await hash(token);await records(async tx=>{await save(tx,C.accounts,'a:'+id,{id,provider:'email-otp',subject:role+'@fixture.example',email:role+'@fixture.example',email_verified:1,role,admission_kind:'invited',can_create_private:1,can_persist_private:1});await save(tx,C.sessions,digest,{owner_id:id,csrf:newToken(),expires_at:now+60000});});return '__Host-toktok_session='+token;};
 const call=async(cookie?:string)=>{const r=await SELF.fetch(origin+'/api/admin/budget?role=admin',{headers:cookie?{Cookie:cookie}:{}}),text=await r.text(),d=JSON.parse(text) as {error?:{code:string};estimate?:{month_micro_usd:number;warning_reached:boolean};model?:{version:string;actual_invoice:boolean;included_usage:number;scope:string;fixed_month_micro_usd:number;rates:{email_attempt_micro_usd:number}};usage?:unknown[]};evidence.push({step:'admin budget HTTP',status:r.status,code:d.error?.code});return {status:r.status,data:d,leaks:/fixture\.example|session_hash|csrf|token_hash/.test(text)};};
 expect((await call()).status).toBe(401);expect((await call(await make('member'))).status).toBe(403);await limits(26,25);const r=await call(await make('admin'));expect(r.status).toBe(200);expect(r.leaks).toBe(false);expect(r.data.estimate).toMatchObject({month_micro_usd:25000000,warning_reached:true});expect(r.data.model).toMatchObject({version:'CF-reference-v1',actual_invoice:false,included_usage:0,scope:'cloudflare_reference_not_node_operating_cost',fixed_month_micro_usd:25000000,rates:{email_attempt_micro_usd:10000}});expect(r.data.usage).toHaveLength(6);
 const config=await direct('config');expect(JSON.stringify(config.value).includes('estimate')).toBe(false);expect(JSON.stringify(config.value).includes('usage')).toBe(false);
});
