import {it,expect} from 'vitest';
import {screenRegistry,renderScreen,componentRegistry,dialogRegistry} from '../public/shared/registry.js';
import {routeRegistry,resolveRoute} from '../public/shared/routes.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage,buildGraph} from '../public/admin-design/coverage.js';
import * as compatibility from '../public/view.js';

it('keeps the product Common room renderer identical to the registered implementation',()=>{
 expect(compatibility.room).toBe(screenRegistry.room.render);
 expect(renderScreen('room')).toBe(compatibility.room());
 expect(compatibility.message).toBe(componentRegistry.message.render);
 expect(compatibility.person).toBe(componentRegistry.person.render);
 expect(compatibility.terminal).toBe(screenRegistry.terminal.render);
 expect(dialogRegistry['public-risk'].requiredStates).toContain('unchecked');
});

it('resolves actual product entry paths through the common route registry',()=>{
 const id='00000000-0000-4000-8000-000000000001',cap='a'.repeat(43);
 expect(resolveRoute('/public/common-room')).toMatchObject({routeId:'public-room',screenId:'room',params:{slug:'common-room'}});
 expect(resolveRoute(`/r/${id}/${cap}`)).toMatchObject({routeId:'private-room',screenId:'room',params:{id,cap}});
 expect(resolveRoute('/guide')).toMatchObject({screenId:'guide'});
 expect(resolveRoute('/')).toMatchObject({screenId:'introduction'});
 expect(resolveRoute('/api/admin/settings')).toBeNull();
});

it('isolates preview data, navigation and effects without any HTTP fallback',async()=>{
 let network=0;const fetch=()=>{network++;throw Error('live HTTP is forbidden');};
 const first=createFixtureAdapter({session:{authenticated:false,role:null,entitlements:{},owner_ack:null},fetch});
 const second=createFixtureAdapter({session:{authenticated:false,role:null,entitlements:{},owner_ack:null},fetch});
 await first.navigate('/public/fictional-room');
 expect(first.currentRoute()).toBe('/public/fictional-room');expect(second.currentRoute()).toBe('/');
 first.back();expect(first.currentRoute()).toBe('/');first.forward();expect(first.currentRoute()).toBe('/public/fictional-room');
 const changed=await first.getSession();changed.authenticated=true;
 expect((await second.getSession()).authenticated).toBe(false);
 expect((await first.getSession()).authenticated).toBe(false);
 await expect(first.invoke('sendEmail',{})).rejects.toThrow('FIXTURE_EFFECT_UNAVAILABLE');
 expect(network).toBe(0);
});

it('detects missing component/dialog/route/transition coverage and dangling graph entries',()=>{
 const fixtures=createFixtureAdapter().catalog();
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures};
 expect(validateCoverage(input)).toEqual([]);
 const missing=structuredClone(fixtures);missing.components=missing.components.filter(f=>!(f.componentId==='message'&&f.state==='long'));
 expect(validateCoverage({...input,fixtures:missing})).toContain('component:message:long');
 const dialog=structuredClone(fixtures);dialog.dialogs=dialog.dialogs.filter(f=>f.state!=='unchecked');
 expect(validateCoverage({...input,fixtures:dialog})).toContain('dialog:public-risk:unchecked');
 const route=structuredClone(fixtures);route.screens=route.screens.filter(f=>f.routeId!=='private-room');
 expect(validateCoverage({...input,fixtures:route})).toContain('route:private-room');
 const edge=structuredClone(fixtures);edge.transitions.pop();
 expect(validateCoverage({...input,fixtures:edge}).some(e=>e.startsWith('transition:'))).toBe(true);
 const dangling=structuredClone(fixtures);dangling.screens.push({fixtureId:'invalid',screenId:'unknown',routeId:'public-room'});
 expect(validateCoverage({...input,fixtures:dangling})).toContain('screen:unknown');
 const graph=buildGraph(input);expect(graph.nodes.length).toBeGreaterThan(1);
 expect(graph.edges.every(e=>graph.nodes.some(n=>n.id===e.from)&&graph.nodes.some(n=>n.id===e.to))).toBe(true);
});
