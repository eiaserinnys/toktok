import {it,expect} from 'vitest';
import {createLiveAdapter} from '../public/effects/live-http.js';
import {renderBudgetUsage} from '../public/shared/components/budget-usage.js';
import {createSettingsController} from '../public/shared/settings-controller.js';
import {settingsFixture} from '../public/admin-design/settings-fixtures.js';
import {budgetFixture} from '../public/admin-design/budget-fixtures.js';
it('loads the exact admin-only budget response without a value fallback and preserves server denial',async()=>{
 const paths=[];const adapter=createLiveAdapter({fetch:async path=>{paths.push(path);return Response.json(budgetFixture);}});
 expect(await adapter.getBudget()).toEqual(budgetFixture);expect(paths).toEqual(['/api/admin/budget']);
 const broken=structuredClone(budgetFixture);delete broken.estimate.month_micro_usd;
 await expect(createLiveAdapter({fetch:async()=>Response.json(broken)}).getBudget()).rejects.toThrow('INVALID_BUDGET');
 await expect(createLiveAdapter({fetch:async()=>Response.json({error:{code:'ADMIN_REQUIRED'}},{status:403})}).getBudget()).rejects.toMatchObject({code:'ADMIN_REQUIRED',status:403});
});
it('displays actual response dollars, units and CF planning scope without claiming an invoice or Node cost',()=>{
 const data=structuredClone(budgetFixture);data.thresholds={target_usd:93,warning_usd:37,cutoff_usd:61};data.estimate.month_micro_usd=38123456;data.estimate.warning_reached=true;
 const html=renderBudgetUsage({status:'ready',value:data});expect(html).toContain('$38.123456');expect(html).toContain('$37');expect(html).toContain('$61');expect(html).toContain('$93');
 expect(html).toContain('CF-reference-v1');expect(html).toContain('Node 운영비');expect(html).toContain('1센트');expect(html).toContain('청구액');expect(html).toContain('경고');expect(html).not.toContain('<input');
 expect((html.match(/class="schema-cap-card"/g)||[])).toHaveLength(9);
 expect(renderBudgetUsage({status:'unavailable',error:{code:'ADMIN_REQUIRED'}})).not.toContain('$0');
 expect(renderBudgetUsage({status:'loading',value:null})).toContain('불러오는 중');
});
it('isolates budget failure from editable settings and never reads admin usage for a nonadmin',async()=>{
 let state,reads=0;const denied=createSettingsController({effects:{getSession:async()=>({authenticated:true,role:'member'}),getAdminSettings:async()=>settingsFixture,getBudget:async()=>{reads++;return budgetFixture;}},paint:v=>state=v});
 await denied.load();await denied.loadBudget();expect(reads).toBe(0);expect(state.status).toBe('unavailable');
 const admin=createSettingsController({effects:{getSession:async()=>({authenticated:true,role:'admin'}),getAdminSettings:async()=>settingsFixture,getBudget:async()=>{throw Object.assign(Error(),{code:'RATE_LIMITED',status:429,retryAfter:'7'});}},paint:v=>state=v});
 await admin.load();await admin.loadBudget();expect(state.status).toBe('ready');expect(state.budget).toMatchObject({status:'unavailable',value:null,error:{code:'RATE_LIMITED',retryAfter:'7'}});expect(state.resource.revision).toBe(settingsFixture.revision);
});
