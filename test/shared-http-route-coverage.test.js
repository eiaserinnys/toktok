import {it,expect} from 'vitest';
import {productHtmlPaths,adminHtmlPaths} from '../src/application';
import {resolveRoute,routeRegistry} from '../public/shared/routes.js';
import {screenRegistry} from '../public/shared/registry.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';

// Discover entries from the actual HTTP dispatch inventory, not a second test list.
// Existing registry coverage then checks every required state/dialog/flow edge.
it('registers every server HTML entry in the shared product and QA screen inventory',()=>{
 const fixtures=createFixtureAdapter().catalog();
 const missing=[];
 for(const path of [...productHtmlPaths,...adminHtmlPaths]){
  const route=resolveRoute(path);
  if(!route){missing.push(path+':route');continue;}
  if(!screenRegistry[route.screenId])missing.push(path+':renderer');
  if(!fixtures.screens.some(f=>f.routeId===route.routeId))missing.push(path+':fixture');
 }
 expect(missing).toEqual([]);
 // Matching a generic fallback must never conceal an omitted registry route.
 expect(resolveRoute('/unregistered-product-screen')).toBeNull();
 expect(routeRegistry.every(r=>screenRegistry[r.screenId])).toBe(true);
});
