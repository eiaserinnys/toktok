// One route inventory is used by product navigation and the QA graph.
export const routeRegistry=Object.freeze([
 {routeId:'introduction',screenId:'introduction',match:/^\/$/,params:[],transitions:[
  {transitionId:'catalog-open',event:'catalog-link',kind:'success',to:'public-room'}]},
 {routeId:'guide',screenId:'guide',match:/^\/guide$/,params:[],transitions:[]},
 {routeId:'public-room',screenId:'room',match:/^\/public\/([a-z0-9-]+)$/,params:['slug'],transitions:[
  {transitionId:'public-back',event:'back-link',kind:'back',to:'introduction'}]},
 {routeId:'private-room',screenId:'room',match:/^\/r\/([a-f0-9-]{36})\/([\w-]{43})$/,params:['id','cap'],transitions:[
  {transitionId:'private-back',event:'back-link',kind:'back',to:'introduction'}]}
]);
export function resolveRoute(path){
 for(const route of routeRegistry){
  const match=route.match.exec(path);
  if(match)return {routeId:route.routeId,screenId:route.screenId,params:Object.fromEntries(route.params.map((name,i)=>[name,match[i+1]]))};
 }
 return null;
}
