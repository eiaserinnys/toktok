import type {PrivateBudgetPort} from '../src/private-contracts';
/** Fixture only. Production must inject A's atomic reservation and operation-id helper. */
export const TEST_BUDGET:PrivateBudgetPort={reserve:async()=>{},newOperationId:()=>Date.now()+':'+(Date.now()+60000)+':'+crypto.randomUUID()};
