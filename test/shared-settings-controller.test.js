import {settingsFixture} from '../public/admin-design/settings-fixtures.js';
import {it,expect} from 'vitest';
import {createSettingsController} from '../public/shared/settings-controller.js';
const resource=revision=>({revision,settings:{budget:{warningUsd:12,cutoffUsd:18}},effects:{},schema:{type:'object',fields:{budget:{type:'object',label:'예산',fields:{warningUsd:{type:'integer',label:'경고',unit:'USD',min:1,max:10000,applyTo:'runtime'},cutoffUsd:{type:'integer',label:'차단',unit:'USD',min:1,max:10000,applyTo:'runtime'}}}}}});
const session={authenticated:true,role:'admin'};
it('does not load settings for an anonymous/member projection, nor turn server denial into fixture success',async()=>{
 for(const s of [{authenticated:false,role:'anonymous',fixtureRole:'admin'},{authenticated:true,role:'member'}]){
  let reads=0;let state;const c=createSettingsController({effects:{getSession:async()=>s,getAdminSettings:async()=>{reads++;return resource(1);}},paint:v=>state=v});
  await c.load();expect(reads).toBe(0);expect(state.status).toBe('unavailable');
 }
 let state;const c=createSettingsController({effects:{getSession:async()=>session,getAdminSettings:async()=>{throw Object.assign(Error(),{code:'ADMIN_REQUIRED',status:403});}},paint:v=>state=v});
 await c.load();expect(state).toMatchObject({status:'unavailable',error:{code:'ADMIN_REQUIRED',status:403}});
});
it('reviews an actual draft and saves the original revision exactly once while pending',async()=>{
 let state;let resolve;const calls=[];const c=createSettingsController({effects:{getSession:async()=>session,getAdminSettings:async()=>resource(4),saveSettings:body=>{calls.push(body);return new Promise(r=>resolve=r);}},paint:v=>state=v});
 await c.load();c.set('budget.warningUsd',9);c.review();expect(state.dialog).toBe('settings-review');
 const saving=c.confirmSave();await c.confirmSave();expect(calls).toEqual([{revision:4,settings:{budget:{warningUsd:9,cutoffUsd:18}}}]);
 resolve({...resource(5),settings:{budget:{warningUsd:9,cutoffUsd:18}}});await saving;
 expect(state.resource.revision).toBe(5);expect(state.changes).toHaveLength(0);expect(state.dialog).toBe(null);
});
it('retains draft on 409, reads real latest revision, and reloads only after explicit confirmation',async()=>{
 let state;let reads=0;const c=createSettingsController({effects:{getSession:async()=>session,getAdminSettings:async()=>resource(++reads===1?4:5),saveSettings:async()=>{throw Object.assign(Error(),{code:'REVISION_CONFLICT',status:409});}},paint:v=>state=v});
 await c.load();c.set('budget.warningUsd',9);c.review();await c.confirmSave();
 expect(state.resource.settings.budget.warningUsd).toBe(9);expect(state.conflict).toMatchObject({baseRevision:4,latestRevision:5});
 c.requestReload();expect(state.dialog).toBe('settings-reload');expect(state.resource.settings.budget.warningUsd).toBe(9);
 c.confirmReload();expect(state.resource.revision).toBe(5);expect(state.resource.settings.budget.warningUsd).toBe(12);
});
it('keeps a dirty draft on navigation cancel and discards it only on explicit leave',async()=>{
 let state,moved=0;const c=createSettingsController({effects:{getSession:async()=>session,getAdminSettings:async()=>resource(4)},paint:v=>state=v});
 await c.load();c.set('budget.warningUsd',9);c.requestLeave(()=>moved++);expect(state.dialog).toBe('settings-leave');expect(moved).toBe(0);
 c.closeDialog();expect(state.resource.settings.budget.warningUsd).toBe(9);expect(moved).toBe(0);
 c.requestLeave(()=>moved++);c.confirmLeave();expect(moved).toBe(1);expect(state.changes).toHaveLength(0);
});
it('locks a reviewed snapshot and keeps invalid raw numeric input visible without saving',async()=>{
 let state;const calls=[];const c=createSettingsController({effects:{getSession:async()=>session,getAdminSettings:async()=>resource(4),saveSettings:async body=>{calls.push(body);return resource(5);}},paint:v=>state=v});
 await c.load();c.set('budget.warningUsd',9);c.review();c.set('budget.warningUsd',8);await c.confirmSave();
 expect(calls[0].settings.budget.warningUsd).toBe(9);
 c.set('budget.warningUsd',NaN,'');expect(state.raw['budget.warningUsd']).toBe('');expect(state.fieldErrors['budget.warningUsd']).toBeTruthy();
 c.review();expect(state.dialog).not.toBe('settings-review');expect(calls).toHaveLength(1);
 c.requestLeave(()=>{});expect(state.dialog).toBe('settings-leave');c.confirmLeave();expect(state.raw).toEqual({});
});

it('removes invalid catalog state with its row and moves remaining errors with stable rows',async()=>{
 let state;const c=createSettingsController({effects:{getSession:async()=>session,getAdminSettings:async()=>structuredClone(settingsFixture)},paint:v=>state=v});
 await c.load();c.addCatalog();c.set('public.catalog.1.title','두 번째');c.set('public.catalog.1.slug','second');
 const surviving=state.catalogRowIds[1];c.set('public.catalog.0.title','');c.set('public.catalog.1.slug','Bad Case');
 c.removeCatalog(0);expect(state.catalogRowIds).toEqual([surviving]);expect(state.raw).toEqual({'public.catalog.0.slug':'Bad Case'});expect(Object.keys(state.fieldErrors)).toEqual(['public.catalog.0.slug']);
 c.removeCatalog(0);expect(state.raw).toEqual({});expect(state.fieldErrors).toEqual({});c.review();expect(state.dialog).toBe('settings-review');
});
