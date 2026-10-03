import {it,expect} from 'vitest';
import {trapDialogTab} from '../public/shared/dialogs/common-dialog.js';
import {createGalleryState} from '../public/admin-design/gallery-state.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage,buildGraph} from '../public/admin-design/coverage.js';
import {componentRegistry,dialogRegistry,screenRegistry} from '../public/shared/registry.js';
import {routeRegistry} from '../public/shared/routes.js';
import {renderFlowBoard} from '../public/shared/screens/flow-board.js';
it('keeps explicit valid dialogue indices and bounds, rejecting coerced empty, fractional or nonfinite indices',()=>{
 const state=createGalleryState(3);for(const raw of [null,undefined,'',' ',false,[],{},'-1','1.2','01','Infinity','NaN',-1,1.5,NaN,Infinity,3])expect(state.open(raw)).toBe(false);
 expect(state.index).toBe(null);expect(state.open('0')).toBe(true);expect(state.step(-1)).toBe(false);expect(state.step(1)).toBe(true);expect(state.index).toBe(1);expect(state.open('garbage')).toBe(false);expect(state.index).toBe(1);expect(state.open(2)).toBe(true);expect(state.step(1)).toBe(false);expect(state.index).toBe(2);
});
it('projects fixture-only mode and journey data consistently without changing limits or grants',()=>{
 const adapter=createFixtureAdapter(),demo=adapter.catalog('DEMO'),hosted=adapter.catalog('HOSTED');
 const vm=hosted.screens.find(s=>s.fixtureId==='auth-login').args[0];expect(vm.Config.mode).toBe('HOSTED');expect(demo.screens.find(s=>s.fixtureId==='auth-login').args[0].Config.mode).toBe('DEMO');
 expect(hosted.screens.find(s=>s.fixtureId==='newroom-member').args[0].Config.limits.private.authenticatedMaxTtlSeconds).toBe(604800);expect(vm.Session.authenticated).toBe(false);
 expect(hosted.screens.every(s=>!s.audiences?.some(a=>['guest','member'].includes(a)))).toBe(true);
 const graph=buildGraph({components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures:hosted});
 for(const role of ['all','anonymous','invited','admin'])expect(()=>renderFlowBoard(graph,{boardMode:'HOSTED',boardRole:role})).not.toThrow();
 const invited=renderFlowBoard(graph,{boardMode:'HOSTED',boardRole:'invited'}).layout.nodes;expect(invited.some(n=>n.canonicalId==='newroom-member')).toBe(true);expect(invited.some(n=>n.canonicalId==='settings-overview')).toBe(false);
});
it('fails missing component, dialog, route entry and negative expiry flow from the same registry',()=>{
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures:createFixtureAdapter().catalog()};expect(validateCoverage(input)).toEqual([]);
 const component=structuredClone(input.fixtures);component.components=component.components.filter(f=>!(f.componentId==='risk-check'&&f.state==='checked'));expect(validateCoverage({...input,fixtures:component})).toContain('component:risk-check:checked');
 const dialog=structuredClone(input.fixtures);dialog.dialogs=dialog.dialogs.filter(f=>!(f.dialogId==='invitation-revoke'&&f.state==='error'));expect(validateCoverage({...input,fixtures:dialog})).toContain('dialog:invitation-revoke:error');
 const route=structuredClone(input.fixtures);route.screens=route.screens.filter(f=>f.routeId!=='account');expect(validateCoverage({...input,fixtures:route})).toContain('route:account');
 const expiry=structuredClone(input.fixtures);expiry.transitions=expiry.transitions.filter(f=>f.transitionId!=='claim-expired');expect(validateCoverage({...input,fixtures:expiry})).toContain('transition:claim-expired');
});

it('contains Tab from the focused non-tabbable gallery title while preserving ordinary control movement',()=>{
 const title={tabIndex:-1},doc={activeElement:title};
 const control=()=>({disabled:false,tabIndex:0,getClientRects:()=>[{}],focus(){doc.activeElement=this;}});
 const first=control(),middle=control(),last=control();let prevented=0;
 const dialog={ownerDocument:doc,querySelectorAll:()=>[title,first,middle,last],contains:n=>[title,first,middle,last].includes(n)};
 title.getClientRects=()=>[{}];
 const press=shiftKey=>trapDialogTab(dialog,{key:'Tab',shiftKey,preventDefault(){prevented++;}});
 press(true);expect(doc.activeElement).toBe(last);expect(prevented).toBe(1);
 doc.activeElement=title;press(false);expect(doc.activeElement).toBe(first);expect(prevented).toBe(2);
 doc.activeElement=middle;press(true);expect(doc.activeElement).toBe(middle);expect(prevented).toBe(2);
 doc.activeElement=first;press(true);expect(doc.activeElement).toBe(last);
 doc.activeElement=last;press(false);expect(doc.activeElement).toBe(first);
});
