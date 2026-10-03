import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import type {BudgetCostProbe} from './budget-cost-worker';
it('measures actual control-core reservation, replay, scheduling and expiry SQL work',async()=>{
  const binding=(env as unknown as {COST:DurableObjectNamespace<BudgetCostProbe>}).COST;
  const data=await binding.getByName(crypto.randomUUID()).measure();
  expect(data.firstAdmission.rowsWritten).toBeGreaterThan(0);
  expect(data.responseReservation.rowsWritten).toBeGreaterThan(0);
  expect(data.replay.rowsWritten).toBe(0);
  expect(data.cleanup.rowsWritten).toBeGreaterThan(0);
  expect(data.steadyAdmission.rowsWritten).toBeLessThanOrEqual(data.firstAdmission.rowsWritten);
  console.info('TOKTOK_CONTROL_SQL_COST',JSON.stringify(data));
});
