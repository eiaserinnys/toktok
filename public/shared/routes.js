// One route inventory is used by product navigation and the QA graph.
export const routeRegistry=Object.freeze([
 {routeId:'rooms',screenId:'lobby',match:/^\/rooms$/,params:[],transitions:[
  {transitionId:'rooms-catalog-open',event:'catalog-link',kind:'success',to:'public-room'}]},
 {routeId:'auth-login',screenId:'auth',match:/^\/login$/,params:[],transitions:[
  {transitionId:'email-requested',event:'email-submit',kind:'success',to:'auth-verify'},
  {transitionId:'email-denied',event:'email-submit',kind:'error',to:'auth-login'}]},
 {routeId:'auth-signup',screenId:'auth',match:/^\/(signup|invite)$/,params:['entry'],transitions:[
  {transitionId:'invitation-valid',event:'code-submit',kind:'success',to:'auth-signup'},
  {transitionId:'invitation-invalid',event:'code-submit',kind:'error',to:'auth-signup'}]},
 {routeId:'auth-verify',screenId:'auth',match:/^\/verify$/,params:[],transitions:[
  {transitionId:'otp-invalid',event:'otp-submit',kind:'error',to:'auth-verify'},
  {transitionId:'otp-expired',event:'server-expiry',kind:'time',to:'auth-verify'},
  {transitionId:'auth-cancel',event:'cancel',kind:'back',to:'introduction'},
  {transitionId:'auth-success',event:'otp-submit',kind:'success',to:'rooms'}]},
 {routeId:'admin-settings',screenId:'settings',match:/^\/admin(?:\/(overview|public|private|budget|identity|signup|deployment))?$/,params:['section'],transitions:[
  {transitionId:'settings-conflict',event:'save-confirm',kind:'error',to:'admin-settings'},
  {transitionId:'settings-denied',event:'server-auth-check',kind:'error',to:'admin-settings'},
  {transitionId:'settings-back',event:'rooms-link',kind:'back',to:'introduction'}]},
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
