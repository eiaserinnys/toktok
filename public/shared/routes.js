// One route inventory is used by product navigation and the QA graph.
export const routeRegistry=Object.freeze([
 {routeId:'new-room',screenId:'newroom',match:/^\/new-room$/,params:[],transitions:[
  {transitionId:'private-created',event:'create-submit',kind:'success',to:'new-room'},
  {transitionId:'private-pending',event:'create-submit',kind:'error',to:'new-room'},
  {transitionId:'private-result-lost',event:'create-retry',kind:'error',to:'new-room'},
  {transitionId:'private-persist-denied',event:'create-submit',kind:'error',to:'new-room'},
  {transitionId:'private-open-read',event:'read-link',kind:'success',to:'private-room'},
  {transitionId:'new-room-back',event:'back-link',kind:'back',to:'rooms'}]},
 {routeId:'claim',screenId:'claim',nestedScreens:['auth'],match:/^\/claim\/([a-f0-9-]{36})\/([\w-]{43})$/,params:['id','cap'],transitions:[
  {transitionId:'claim-approved',event:'approve-confirm',kind:'success',to:'claim'},
  {transitionId:'claim-denied',event:'approve-confirm',kind:'error',to:'claim'},
  {transitionId:'claim-expired',event:'server-expiry',kind:'time',to:'claim'},
  {transitionId:'claim-email',event:'login-open',kind:'success',to:'claim'},
  {transitionId:'claim-otp',event:'email-submit',kind:'success',to:'claim'},
  {transitionId:'claim-session-verified',event:'otp-submit',kind:'success',to:'claim'},
  {transitionId:'claim-otp-denied',event:'otp-submit',kind:'error',to:'claim'},
  {transitionId:'claim-logout',event:'logout',kind:'success',to:'rooms'},
  {transitionId:'claim-back',event:'cancel',kind:'back',to:'rooms'}]},
 {routeId:'account',screenId:'account',match:/^\/account$/,params:[],transitions:[
  {transitionId:'agent-revoked',event:'revoke-confirm',kind:'success',to:'account'},
  {transitionId:'agent-revoke-denied',event:'revoke-confirm',kind:'error',to:'account'},
  {transitionId:'account-denied',event:'server-auth-check',kind:'error',to:'auth-login'},
  {transitionId:'account-logout',event:'logout',kind:'success',to:'introduction'},
  {transitionId:'account-back',event:'rooms-link',kind:'back',to:'rooms'}]},
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
  {transitionId:'budget-unavailable',event:'budget-read',kind:'error',to:'admin-settings'},
  {transitionId:'settings-conflict',event:'save-confirm',kind:'error',to:'admin-settings'},
  {transitionId:'settings-denied',event:'server-auth-check',kind:'error',to:'admin-settings'},
  {transitionId:'settings-back',event:'rooms-link',kind:'back',to:'introduction'}]},
 {routeId:'introduction',screenId:'introduction',aliases:['/about'],match:/^\/(?:about)?$/,params:[],transitions:[
  {transitionId:'catalog-open',event:'catalog-link',kind:'success',to:'public-room'}]},
 {routeId:'guide',screenId:'guide',match:/^\/guide$/,params:[],transitions:[]},
 {routeId:'public-room',screenId:'room',match:/^\/public\/([a-z0-9-]+)$/,params:['slug'],transitions:[
  {transitionId:'public-back',event:'back-link',kind:'back',to:'introduction'}]},
 {routeId:'private-room',screenId:'room',match:/^\/r\/([a-f0-9-]{36})\/([\w-]{43})$/,params:['id','cap'],transitions:[
  {transitionId:'private-history-gap',event:'history-gap',kind:'error',to:'private-room'},
  {transitionId:'private-history-reset',event:'history-reset',kind:'error',to:'private-room'},
  {transitionId:'private-paused',event:'pause',kind:'success',to:'private-room'},
  {transitionId:'private-resumed',event:'resume',kind:'success',to:'private-room'},
  {transitionId:'private-rate-limited',event:'read-429',kind:'error',to:'private-room'},
  {transitionId:'private-back',event:'back-link',kind:'back',to:'introduction'}]}
]);
export function resolveRoute(path){
 for(const route of routeRegistry){
  const match=route.match.exec(path);
  if(match)return {routeId:route.routeId,screenId:route.screenId,params:Object.fromEntries(route.params.map((name,i)=>[name,match[i+1]]))};
 }
 return null;
}
