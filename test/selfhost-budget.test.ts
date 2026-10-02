import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CoreBudget} from '../src/runtime/budget';
import {HttpError} from '../src/http';
import type {PrivateBudgetKind} from '../src/private-contracts';
import {TEST_BUDGET} from './selfhost-budget';
test('core funding shares first reservation, replenishes only on request and closes missing/denied budget',async()=>{
 let now=100000,calls:{kind:PrivateBudgetKind;amount:number}[]=[];const budget=new CoreBudget({...TEST_BUDGET,reserve:async(_id,kind,amount)=>{calls.push({kind,amount});}},()=>now);
 await Promise.all([budget.admit(),budget.admit(),budget.admit()]);assert.equal(calls.filter(v=>v.kind==='active_room_seconds').length,1);assert.equal(budget.diagnostics().funded_until,160000);now+=31000;await budget.admit();assert.equal(budget.diagnostics().funded_until,220000);
 const before=calls.length;now+=100000;assert.equal(calls.length,before);const restarted=new CoreBudget(TEST_BUDGET,()=>now);assert.equal(restarted.diagnostics().funded_until,0);
 await assert.rejects(new CoreBudget(undefined,()=>now).admit(),e=>e instanceof HttpError&&e.status===503);const denied=new HttpError(429,'BUDGET_EXHAUSTED','mock');await assert.rejects(new CoreBudget({...TEST_BUDGET,reserve:async()=>{throw denied;}},()=>now).admit(),e=>e===denied);
 const response=await budget.respond(Response.json({mock:true}),await budget.admit());assert.equal((await response.json()).mock,true);assert.equal(calls.at(-1)?.amount,13);
 console.log(JSON.stringify({phase:'funding',shared_first:true,restart_funded_until:0,last_response_bytes:calls.at(-1)?.amount}));
});
