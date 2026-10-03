import {env as workerEnv} from 'cloudflare:workers';
const env=workerEnv as unknown as {IDENTITIES:DurableObjectNamespace};
import {runInDurableObject} from 'cloudflare:test';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {ControlCore} from '../src/control-core';
import {SettingsStore} from '../src/settings-store';
import {C,save,type Tx} from '../src/control-records';
import type {RegistryInput} from '../src/identity-types';
const stub=()=>env.IDENTITIES.getByName('team'),now=Date.UTC(2030,0,1);
const evidence:{step:string;status:number;code?:string;retry_after?:number;state?:Record<string,number|boolean>}[]=[];
const records=<T>(fn:(tx:Tx)=>Promise<T>)=>runInDurableObject(stub(),(_i,state)=>new CloudflareRepository(state.storage).transaction('control',fn));
async function action(name:string,input:RegistryInput={}){
 const result=await runInDurableObject(stub(),async(_i,state)=>{try{return {status:200,value:await new ControlCore(new CloudflareRepository(state.storage),{bootstrapEmail:'allowed@fixture.example'}).execute(name,{...input,now})};}catch(e){const err=e as {status?:number;code?:string;retryAfter?:number};return {status:err.status??500,code:err.code,retry_after:err.retryAfter};}});
 evidence.push({step:name,status:result.status,code:result.code,retry_after:result.retry_after});return result;
}
async function send(allowed:boolean){
 const flow_hash=crypto.randomUUID(),browser_hash=crypto.randomUUID();expect((await action('start',{purpose:'login',flow_hash,browser_hash,nonce_hash:crypto.randomUUID()})).status).toBe(200);
 return action('email-reserve',{flow_hash,browser_hash,email:allowed?'allowed@fixture.example':'suppressed@fixture.example',ip:allowed?'192.0.2.1':'192.0.2.2',request_id:crypto.randomUUID()});
}
async function state(){return records(async tx=>({estimate:Number((await tx.get(C.budgets,'estimate:m:2030-01'))?.used??0),quantity:Number((await tx.get(C.budgets,'usage:email_attempts:m:2030-01'))?.used??0),codes:(await tx.list(C.otp,{prefix:'code:',limit:10})).length,requests:(await tx.list(C.otp,{prefix:'request:',limit:10})).length}));}
beforeEach(async()=>{evidence.length=0;await runInDurableObject(stub(),async(_i,s)=>{await s.storage.deleteAlarm();await s.storage.deleteAll();await new CloudflareRepository(s.storage).apply();});expect((await action('config')).status).toBe(200);});
afterEach(()=>console.log('EMAIL_PREFLIGHT_EVIDENCE '+JSON.stringify(evidence)));
it('allowed and suppressed addresses receive the same estimated cutoff denial before eligibility writes',async()=>{
 await records(async tx=>{const store=new SettingsStore(tx),row=await store.read();row.settings.budget.warningUsd=25;row.settings.budget.cutoffUsd=26;await store.update(row.revision,row.settings,'fixture',now);await save(tx,C.budgets,'estimate:m:2030-01',{used:990000});});
 const results=await Promise.all([send(true),send(false)]),actual=await state();evidence.push({step:'estimate preflight state before assertion',status:200,state:actual});
 expect(results.map(r=>[r.status,r.code,r.retry_after])).toEqual([[429,'ESTIMATED_BUDGET_EXCEEDED',2678400],[429,'ESTIMATED_BUDGET_EXCEEDED',2678400]]);expect(actual).toEqual({estimate:990000,quantity:0,codes:0,requests:0});
});
it('quantity preflight denial is also identical and makes no email reservations',async()=>{
 await records(tx=>save(tx,C.budgets,'usage:email_attempts:m:2030-01',{used:10000}));const results=await Promise.all([send(true),send(false)]),actual=await state();evidence.push({step:'quantity preflight state before assertion',status:200,state:actual});expect(results.map(r=>[r.status,r.code,r.retry_after])).toEqual([[429,'EMAIL_RATE_LIMITED',2678400],[429,'EMAIL_RATE_LIMITED',2678400]]);expect(actual).toEqual({estimate:0,quantity:10000,codes:0,requests:0});
});
it('successful preflight only charges and creates OTP for the eligible path while suppressed receipt stays generic',async()=>{
 const allowed=await send(true),suppressed=await send(false),actual=await state();evidence.push({step:'eligible versus suppressed storage before assertion',status:200,state:actual});expect([allowed.status,suppressed.status]).toEqual([200,200]);
 const a=allowed.value as {receipt:{state:string};dispatch?:unknown},s=suppressed.value as {receipt:{state:string};dispatch?:unknown};expect([a.receipt.state,s.receipt.state]).toEqual(['attempted','attempted']);expect(Boolean(a.dispatch)).toBe(true);expect(Boolean(s.dispatch)).toBe(false);expect(actual).toEqual({estimate:10014,quantity:1,codes:1,requests:2});
});
