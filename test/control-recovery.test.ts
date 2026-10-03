import {env as workerEnv} from 'cloudflare:workers';
const env=workerEnv as unknown as {IDENTITIES:DurableObjectNamespace};
import {runInDurableObject} from 'cloudflare:test';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {ControlCore} from '../src/control-core';
import {SettingsStore} from '../src/settings-store';
import {C,save,type Tx} from '../src/control-records';
import {budgetWindows,newBudgetOperation} from '../src/control-policy';
import type {RegistryInput} from '../src/identity-types';
const stub=()=>env.IDENTITIES.getByName('team');let now:number;
const evidence:{step:string;status:number;code?:string;retry_after?:number;state?:Record<string,number|boolean>}[]=[];
const records=<T>(fn:(tx:Tx)=>Promise<T>)=>runInDurableObject(stub(),(_i,s)=>new CloudflareRepository(s.storage).transaction('control',fn));
async function direct(action:string,input:RegistryInput={}){
 const result=await runInDurableObject(stub(),async(_i,s)=>{try{return {status:200,value:await new ControlCore(new CloudflareRepository(s.storage)).execute(action,{...input,now})};}catch(e){const err=e as {status?:number;code?:string;retryAfter?:number};return {status:err.status??500,code:err.code,retry_after:err.retryAfter};}});
 evidence.push({step:action,status:result.status,code:result.code,retry_after:result.retry_after});return result;
}
async function principal(role:'admin'|'member'='admin'){
 const owner_id=crypto.randomUUID(),session_hash=crypto.randomUUID(),csrf=crypto.randomUUID();await records(async tx=>{await save(tx,C.accounts,'a:'+owner_id,{id:owner_id,email_verified:1,role});await save(tx,C.sessions,session_hash,{owner_id,csrf,expires_at:now+43200000});});return {session_hash,csrf};
}
const operation=()=>newBudgetOperation(now,now+60000);
const reserve=(p:RegistryInput,id=operation(),mutation=false)=>direct('admin-recovery-reserve',{...p,operation_id:id,mutation});
async function usage(){return records(async tx=>{const w=budgetWindows(now);return {minute:Number((await tx.get(C.budgets,'recovery:minute:'+Math.floor(now/60000)))?.used??0),day:Number((await tx.get(C.budgets,'recovery:day:'+w.day))?.used??0),month:Number((await tx.get(C.budgets,'recovery:month:'+w.month))?.used??0),normalEstimate:Number((await tx.get(C.budgets,'estimate:m:'+w.month))?.used??0)};});}
beforeEach(async()=>{now=Date.UTC(2030,0,1);evidence.length=0;await runInDurableObject(stub(),async(_i,s)=>{await s.storage.deleteAlarm();await s.storage.deleteAll();await new CloudflareRepository(s.storage).apply();});expect((await direct('config')).status).toBe(200);});
afterEach(()=>console.log('ADMIN_RECOVERY_EVIDENCE '+JSON.stringify(evidence)));
it('trusted recovery requires a current DB admin and strict mutation CSRF, separate from ordinary budget exhaustion',async()=>{
 const admin=await principal(),member=await principal('member');expect((await reserve({})).status).toBe(401);expect((await reserve(member)).status).toBe(403);expect((await reserve({session_hash:admin.session_hash},operation(),true)).code).toBe('CSRF_DENIED');expect((await reserve({...admin,csrf:'wrong'},operation(),true)).code).toBe('CSRF_DENIED');
 expect((await direct('admin-recovery-reserve',{...admin,operation_id:operation(),mutation:'false' as unknown as boolean})).status).toBe(400);
 await records(async tx=>{await save(tx,C.budgets,'estimate:m:2030-01',{used:90000000});await save(tx,C.budgets,'usage:admission_requests:d:2030-01-01',{used:100000});});
 const read=await reserve({session_hash:admin.session_hash}),write=await reserve(admin,operation(),true),actual=await usage();evidence.push({step:'admin-only recovery state before assertions',status:200,state:actual});expect([read.status,write.status]).toEqual([200,200]);expect(read.value).toEqual({response_bytes_limit:65536});expect(actual).toEqual({minute:2,day:2,month:2,normalEstimate:90000000});
 now+=43200000;expect((await reserve(admin)).status).toBe(401);
});
it('minute recovery race is bounded and replay has no charge while binding changes conflict',async()=>{
 const admin=await principal(),id=operation();expect((await reserve(admin,id)).status).toBe(200);expect((await reserve(admin,id)).status).toBe(200);
 expect((await reserve(await principal(),id)).status).toBe(409);expect((await reserve(admin,id,true)).status).toBe(409);
 const race=await Promise.all(Array.from({length:11},()=>reserve(admin))),actual=await usage();evidence.push({step:'recovery race before assertions',status:200,state:actual});expect(race.filter(r=>r.status===200)).toHaveLength(9);expect(race.filter(r=>r.status===429).map(r=>[r.code,r.retry_after])).toEqual([['ADMIN_RECOVERY_LIMITED',60],['ADMIN_RECOVERY_LIMITED',60]]);expect(actual).toEqual({minute:10,day:10,month:10,normalEstimate:0});
});
it('day and month recovery bounds are atomic and report the longest blocking UTC window',async()=>{
 const admin=await principal();await records(async tx=>{await save(tx,C.budgets,'recovery:day:2030-01-01',{used:99});await save(tx,C.budgets,'recovery:month:2030-01',{used:999});});
 const results=await Promise.all([reserve(admin),reserve(admin)]),actual=await usage();evidence.push({step:'day-month recovery race before assertions',status:200,state:actual});expect(results.map(r=>r.status).sort()).toEqual([200,429]);expect(results.find(r=>r.status===429)).toMatchObject({code:'ADMIN_RECOVERY_LIMITED',retry_after:2678400});expect(actual).toEqual({minute:1,day:100,month:1000,normalEstimate:0});
 now+=86400000;expect((await reserve(admin)).status).toBe(401);const next=await principal();expect((await reserve(next)).retry_after).toBe(2592000);expect((await usage()).minute).toBe(0);
});
it('recovery replay retains the first UTC windows and usage DTO exposes fixed bounds only to an admin',async()=>{
 now=Date.UTC(2030,0,31,23,59,59);const admin=await principal(),id=operation();expect((await reserve(admin,id)).status).toBe(200);now+=2000;expect((await reserve(admin,id)).status).toBe(200);const actual=await usage();evidence.push({step:'recovery month replay before assertions',status:200,state:actual});expect(actual).toEqual({minute:0,day:0,month:0,normalEstimate:0});
 const previous=await records(async tx=>({minute:Number((await tx.get(C.budgets,'recovery:minute:'+Math.floor((now-2000)/60000)))?.used??0),day:Number((await tx.get(C.budgets,'recovery:day:2030-01-31'))?.used??0),month:Number((await tx.get(C.budgets,'recovery:month:2030-01'))?.used??0)}));expect(previous).toEqual({minute:1,day:1,month:1});
 const dto=await direct('admin-budget',admin);expect(dto.status).toBe(200);expect(dto.value).toMatchObject({recovery:{bounds:{minute:10,day:100,month:1000},usage:{minute:0,day:0,month:0},response_bytes_limit:65536}});expect((await direct('admin-budget',await principal('member'))).status).toBe(403);expect(JSON.stringify((await direct('config')).value).includes('recovery')).toBe(false);
 now+=60000;expect((await reserve(admin,id)).code).toBe('OPERATION_EXPIRED');
});
