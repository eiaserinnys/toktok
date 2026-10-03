import type {ControlHttpPort} from './identity-types';
import type {PrivateBudgetPort} from './private-contracts';
import {newBudgetOperation} from './control-policy';

/** Host-only transport; operation IDs are never accepted from request headers. */
export function controlBudget(control:ControlHttpPort,clock=()=>Date.now()):PrivateBudgetPort {
 return {
  newOperationId(){const now=clock();return newBudgetOperation(now,now+60000);},
  async reserve(operation_id,kind,amount){await control.execute('budget-reserve',{operation_id,kind,amount,now:clock()});}
 };
}
