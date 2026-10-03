import {it,expect} from 'vitest';
import {componentRegistry,dialogRegistry,screenRegistry} from '../public/shared/registry.js';
import {routeRegistry} from '../public/shared/routes.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';
import {validateCoverage,buildGraph} from '../public/admin-design/coverage.js';
it('covers the same settings/auth renderers, states, routes and negative flow edges',()=>{
 const input={components:componentRegistry,dialogs:dialogRegistry,screens:screenRegistry,routes:routeRegistry,fixtures:createFixtureAdapter().catalog()};
 expect(validateCoverage(input)).toEqual([]);
 const missing=structuredClone(input.fixtures);missing.screens=missing.screens.filter(f=>!(f.screenId==='settings'&&f.state==='denied'));
 expect(validateCoverage({...input,fixtures:missing})).toContain('screen-state:settings:denied');
 const graph=buildGraph(input);expect(graph.edges.some(e=>e.transitionId==='settings-denied'&&e.kind==='error')).toBe(true);
 expect(graph.edges.some(e=>e.transitionId==='otp-expired'&&e.kind==='time')).toBe(true);
 expect(input.fixtures.dialogs.some(f=>f.dialogId==='settings-review'&&f.state==='pending')).toBe(true);
});
