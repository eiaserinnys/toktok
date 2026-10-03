import {DurableObject} from 'cloudflare:workers';
import {CloudflareRepository,type CloudflareRecordStorage,type CloudflareSqlValue} from '../src/storage/cloudflare';
import {ControlCore} from '../src/control-core';
import {newBudgetOperation} from '../src/control-policy';

/** Local fixture returns counters only: no SQL, keys, account records or payloads. */
export class BudgetCostProbe extends DurableObject {
  async measure() {
    const storage=this.ctx.storage;
    await new CloudflareRepository(storage).apply();
    let rowsRead=0,rowsWritten=0;
    const metered:CloudflareRecordStorage={
      sql:{exec<T extends Record<string,CloudflareSqlValue>>(query:string,...bindings:(string|number|null)[]){
        const cursor=storage.sql.exec<T>(query,...bindings),rows=cursor.toArray();
        rowsRead+=cursor.rowsRead;rowsWritten+=cursor.rowsWritten;
        return {toArray:()=>rows};
      }},transaction:fn=>storage.transaction(fn)
    };
    const repo=new CloudflareRepository(metered),core=new ControlCore(repo);
    const now=Date.UTC(2030,0,1),sample=async(fn:()=>Promise<unknown>)=>{
      rowsRead=0;rowsWritten=0;await fn();return {rowsRead,rowsWritten};
    };
    const initialization=await sample(()=>core.execute('config',{now}));
    const admission=newBudgetOperation(now,now+60000),response=newBudgetOperation(now,now+60000);
    const firstAdmission=await sample(()=>core.execute('budget-reserve',{operation_id:admission,kind:'admission_requests',amount:1,now}));
    const responseReservation=await sample(()=>core.execute('budget-reserve',{operation_id:response,kind:'response_bytes',amount:4096,now}));
    const replay=await sample(()=>core.execute('budget-reserve',{operation_id:admission,kind:'admission_requests',amount:1,now:now+1}));
    const wrapperSchedule=await sample(()=>core.maintain(now));
    const cleanup=await sample(()=>core.maintain(now+60001));
    const next=newBudgetOperation(now+60002,now+120002);
    const steadyAdmission=await sample(()=>core.execute('budget-reserve',{operation_id:next,kind:'admission_requests',amount:1,now:now+60002}));
    return {initialization,firstAdmission,responseReservation,replay,wrapperSchedule,cleanup,steadyAdmission,
      caveats:['local workerd SQL cursor counters, not production invoice','setAlarm/deleteAlarm writes are outside these SQL counters','cleanup includes two operation records and their expiry entries']};
  }
}
export default {fetch:()=>new Response(null,{status:404})};
