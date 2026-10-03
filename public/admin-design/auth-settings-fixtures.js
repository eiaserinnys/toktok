import {settingsFixture} from './settings-fixtures.js';
const clone=value=>structuredClone(value),s=settingsFixture.settings;
export const anonymousFixture={authenticated:false,role:'anonymous',entitlements:{can_create_private:false,can_persist_private:false},owner_ack:null};
export const adminFixture={authenticated:true,role:'admin',entitlements:{can_create_private:true,can_persist_private:false},owner_ack:null};
const member={...adminFixture,role:'member'};
export const configFixture={revision:settingsFixture.revision,mode:'DEMO',signup:s.signup.policy,enabled:s.deployment.enabled,catalog:s.public.catalog.filter(row=>row.enabled).map(({slug,title})=>({slug,title})),limits:{
 public:{firstWindowSeconds:s.public.firstWindowSeconds,firstWindowMessages:s.public.firstWindowMessages,pageSize:s.public.policy.pageSize,agentReadCadenceSeconds:s.public.agentReadCadenceSeconds,browserReadCadenceSeconds:s.public.browserReadCadenceSeconds},
 private:{anonymousEnabled:s.private.anonymousEnabled,defaultPersist:false,anonymousDefaultTtlSeconds:s.private.anonymousDefaultTtlSeconds,anonymousMaxTtlSeconds:s.private.anonymousMaxTtlSeconds,authenticatedDefaultTtlSeconds:s.private.authenticatedDefaultTtlSeconds,authenticatedMaxTtlSeconds:s.private.authenticatedMaxTtlSeconds,defaultRetentionSeconds:s.private.defaultRetentionSeconds,maxRetentionSeconds:s.private.maxRetentionSeconds}}};
const auth=(screen,ui={},config=configFixture,status='ready')=>({screen,status,Session:anonymousFixture,Config:config,ui:{purpose:screen==='signup'?'signup':'login',cancelReturn:'/',...ui}});
const challenge={flow:'fictional-flow',nonce:'fictional-nonce',expires_at:'2026-10-03T12:00:00.000Z'};
const catalogEmpty=clone(settingsFixture);catalogEmpty.settings.public.catalog=[];
const catalogMax=clone(settingsFixture);catalogMax.settings.public.catalog=Array.from({length:settingsFixture.schema.fields.public.fields.catalog.max},(_,i)=>({slug:'fictional-'+i,title:'가상 공개방 '+(i+1),enabled:false}));
const change={path:'budget.warningUsd',label:'경고',before:'50',after:'12',applyTo:'runtime'};
export const authSettingsFixtures={
 components:[
  {componentId:'agent-safety',state:'service-owned',args:[]},
  ...[['anonymous',anonymousFixture],['member',member],['admin',adminFixture]].map(([state,Session])=>({componentId:'product-header',state,args:[{status:'ready',Session,Config:configFixture}]})),
  ...['loading','unavailable'].map(status=>({componentId:'product-header',state:status,args:[{status}]})),
  {componentId:'setting-field',state:'number',args:[settingsFixture.schema.fields.private.fields.anonymousDefaultTtlSeconds,s.private.anonymousDefaultTtlSeconds,'private.anonymousDefaultTtlSeconds']},
  {componentId:'setting-field',state:'enum',args:[settingsFixture.schema.fields.deployment.fields.mode,s.deployment.mode,'deployment.mode']},
  {componentId:'setting-field',state:'readonly-off',args:[settingsFixture.schema.fields.private.fields.defaultPersist,false,'private.defaultPersist']},
  ...[['catalog',settingsFixture,'public'],['empty',catalogEmpty,'public'],['max',catalogMax,'public'],['workload',settingsFixture,'budget'],['nested',settingsFixture,'identity'],['readonly-off',settingsFixture,'private']].map(([state,value,section])=>({componentId:'settings-fields',state,args:[value,section]}))
 ],
 dialogs:[
  ...['default','pending','error'].map(state=>({dialogId:'settings-review',state,args:[{revision:27,changes:[change],applicationNote:'실행 중 적용',pending:state==='pending',error:state==='error'?'가상 저장 오류입니다. 초안은 유지돼요.':''}]})),
  ...['default','unavailable'].map(state=>({dialogId:'settings-conflict',state,args:[{baseRevision:27,latestRevision:state==='default'?28:undefined,changes:[{label:'경고',draft:'12',latest:'18'}]}]})),
  {dialogId:'settings-reload',state:'default',args:[{changedCount:1}]},
  {dialogId:'settings-leave',state:'default',args:[{changedCount:1}]}
 ],
 screens:[
  ...[
   ['login','auth-login','/login',auth('login')],
   ['signup-invite','auth-signup','/invite',auth('signup')],
   ['signup-email','auth-signup','/signup',auth('signup',{invitation:{valid:true,invite_validation_id:'fictional-ticket',expires_at:challenge.expires_at}})],
   ['invite-invalid','auth-signup','/invite',auth('signup',{inviteCode:'InvalidOpaqueCase',inviteError:'INVALID_INVITATION'})],
   ['closed','auth-signup','/signup',auth('signup',{}, {...configFixture,signup:'closed'})],
   ['verify','auth-verify','/verify',auth('verify',{email:'fictional@example.com',challenge,retryAfter:30})],
   ['error','auth-verify','/verify',auth('verify',{email:'fictional@example.com',challenge,otpError:'OTP_INVALID'})],
   ['expired','auth-verify','/verify',auth('verify',{email:'fictional@example.com',challenge,otpError:'인증번호의 유효시간이 지났어요. 새 요청을 시작해주세요.'})],
   ['loading','auth-login','/login',auth('login',{},null,'loading')],
   ['unavailable','auth-login','/login',auth('login',{},null,'unavailable')]
  ].map(([state,routeId,path,vm])=>({fixtureId:'auth-'+state,title:'인증 · '+state,screenId:'auth',state,routeId,path,audiences:['guest'],args:[vm]})),
  ...['overview',...Object.keys(settingsFixture.schema.fields)].map(section=>({fixtureId:'settings-'+section,title:'설정 · '+(settingsFixture.schema.fields[section]?.label||'한눈에 보기'),screenId:'settings',state:section,routeId:'admin-settings',path:'/admin/'+section,audiences:['admin'],args:[{status:'ready',session:adminFixture,resource:settingsFixture,section}]})),
  ...['default','empty','loading','unavailable'].map(state=>({fixtureId:'rooms-'+state,title:'대화방 · '+state,screenId:'lobby',state,routeId:'rooms',path:'/rooms',args:[{status:['loading','unavailable'].includes(state)?state:'ready',Session:member,Config:{...configFixture,catalog:state==='empty'?[]:configFixture.catalog}}]})),
  ...['loading','denied','error','conflict'].map(state=>({fixtureId:'settings-'+state,title:'설정 · '+state,screenId:'settings',state,routeId:'admin-settings',path:'/admin/public',audiences:['admin'],args:[{status:state==='loading'?'loading':state==='denied'?'unavailable':'ready',session:state==='denied'?member:adminFixture,resource:state==='loading'||state==='denied'?null:settingsFixture,section:'public',changes:[change],error:{code:state==='conflict'?'REVISION_CONFLICT':state==='denied'?'ADMIN_REQUIRED':'가상 오류'}}]}))
 ],
 transitions:[
  {transitionId:'email-requested',from:'auth-login',to:'auth-verify'},
  {transitionId:'email-denied',from:'auth-login',to:'auth-unavailable'},
  {transitionId:'invitation-valid',from:'auth-signup-invite',to:'auth-signup-email'},
  {transitionId:'invitation-invalid',from:'auth-signup-invite',to:'auth-invite-invalid'},
  {transitionId:'otp-invalid',from:'auth-verify',to:'auth-error'},
  {transitionId:'otp-expired',from:'auth-verify',to:'auth-expired'},
  {transitionId:'auth-cancel',from:'auth-verify',to:'intro'},
  {transitionId:'auth-success',from:'auth-verify',to:'rooms-default'},
  {transitionId:'rooms-catalog-open',from:'rooms-default',to:'public-empty'},
  {transitionId:'settings-conflict',from:'settings-public',to:'settings-conflict'},
  {transitionId:'settings-denied',from:'settings-overview',to:'settings-denied'},
  {transitionId:'settings-back',from:'settings-overview',to:'intro'}
 ]
};
