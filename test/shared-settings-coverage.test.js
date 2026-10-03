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
 const noNested=routeRegistry.map(r=>({...r,nestedScreens:[]}));
 expect(validateCoverage({...input,routes:noNested})).toContain('route-entry:claim');
 const noAlias=structuredClone(input.fixtures);noAlias.screens=noAlias.screens.filter(f=>f.path!=='/about');expect(validateCoverage({...input,fixtures:noAlias})).toContain('route-alias:introduction:/about');
 const noReset=structuredClone(input.fixtures);noReset.screens=noReset.screens.filter(f=>!(f.screenId==='room'&&f.state==='history-reset'));expect(validateCoverage({...input,fixtures:noReset})).toContain('screen-state:room:history-reset');
 const noAudit=structuredClone(input.fixtures);noAudit.screens=noAudit.screens.filter(f=>f.routeId!=='admin-audit');expect(validateCoverage({...input,fixtures:noAudit})).toContain('route:admin-audit');
 const graph=buildGraph(input);expect(graph.edges.some(e=>e.transitionId==='settings-denied'&&e.kind==='error')).toBe(true);
 expect(graph.edges.some(e=>e.transitionId==='otp-expired'&&e.kind==='time')).toBe(true);
 expect(input.fixtures.dialogs.some(f=>f.dialogId==='settings-review'&&f.state==='pending')).toBe(true);
});
