export function validateCoverage({components,dialogs,screens,routes,fixtures}){
 const errors=[];
 for(const [id,entry] of Object.entries(components))for(const state of entry.requiredStates)
  if(!fixtures.components.some(f=>f.componentId===id&&f.state===state))errors.push(`component:${id}:${state}`);
 for(const f of fixtures.components)if(!components[f.componentId]?.requiredStates.includes(f.state))errors.push(`component-entry:${f.componentId}:${f.state}`);
 for(const [id,entry] of Object.entries(dialogs))for(const state of entry.requiredStates)
  if(!fixtures.dialogs.some(f=>f.dialogId===id&&f.state===state))errors.push(`dialog:${id}:${state}`);
 for(const f of fixtures.dialogs)if(!dialogs[f.dialogId]?.requiredStates.includes(f.state))errors.push(`dialog-entry:${f.dialogId}:${f.state}`);
 const ids=new Set();
 for(const f of fixtures.screens){
  if(ids.has(f.fixtureId))errors.push(`duplicate:${f.fixtureId}`);ids.add(f.fixtureId);
  if(!screens[f.screenId])errors.push(`screen:${f.screenId}`);
  if(!routes.some(r=>r.routeId===f.routeId&&r.screenId===f.screenId))errors.push(`route-entry:${f.routeId}`);
 }
 const transitions=routes.flatMap(r=>r.transitions);
 for(const route of routes){
  if(!fixtures.screens.some(f=>f.routeId===route.routeId))errors.push(`route:${route.routeId}`);
  for(const edge of route.transitions)if(!fixtures.transitions.some(f=>f.transitionId===edge.transitionId))errors.push(`transition:${edge.transitionId}`);
 }
 const edges=new Set();
 for(const edge of fixtures.transitions){
  if(edges.has(edge.transitionId))errors.push(`duplicate:${edge.transitionId}`);edges.add(edge.transitionId);
  if(!transitions.some(t=>t.transitionId===edge.transitionId))errors.push(`transition-entry:${edge.transitionId}`);
  if(!ids.has(edge.from)||!ids.has(edge.to))errors.push(`dangling:${edge.transitionId}`);
 }
 return errors;
}
export function buildGraph(input){
 const errors=validateCoverage(input);if(errors.length)throw Error(errors.join(', '));
 const transitions=input.routes.flatMap(r=>r.transitions);
 return {
  nodes:input.fixtures.screens.map(f=>({id:f.fixtureId,route:f.path,mode:'all',...f})),
  edges:input.fixtures.transitions.map(f=>{const edge=transitions.find(t=>t.transitionId===f.transitionId);return {...edge,...f,label:edge.event,kind:edge.kind==='success'?'forward':edge.kind,layout:edge.kind!=='back'};})
 };
}
