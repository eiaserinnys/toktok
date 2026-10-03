import {configFixture,anonymousFixture,adminFixture} from './auth-settings-fixtures.js';
export const agentFixture={id:'fictional-agent',name:'가상 에이전트',status:'approved',pending_expires_at:'2026-10-04T00:00:00.000Z',credential_expires_at:'2026-10-30T00:00:00.000Z'};
export const accountSessionFixture={...adminFixture,role:'member',can_bootstrap_admin:false,agents:[agentFixture]};
export const accountFixtures={components:[],
 dialogs:['default','pending','error'].map(state=>({dialogId:'agent-revoke',state,args:[{agent:agentFixture,pending:state==='pending',error:state==='error'?'ADMISSION_DENIED':null}]})),
 screens:['default','revoked','empty','anonymous','loading','unavailable','error'].map(state=>({fixtureId:'account-'+state,title:'내 계정 · '+state,screenId:'account',state,routeId:'account',path:'/account',audiences:['member'],args:[{status:['loading','unavailable'].includes(state)?state:'ready',Config:configFixture,Session:state==='anonymous'?anonymousFixture:{...accountSessionFixture,agents:state==='empty'?[]:[{...agentFixture,status:state==='default'?'approved':state==='error'?'approved':'revoked'}]},error:state==='error'?{code:'ADMISSION_DENIED'}:null}]})),
 transitions:[{transitionId:'agent-revoked',from:'account-default',to:'account-revoked'},
 {transitionId:'agent-revoke-denied',from:'account-default',to:'account-error'},
 {transitionId:'account-denied',from:'account-anonymous',to:'auth-login'},
 {transitionId:'account-logout',from:'account-default',to:'intro'},
 {transitionId:'account-back',from:'account-default',to:'rooms-default'}]};

const bootstrapSession={...accountSessionFixture,can_bootstrap_admin:true};
accountFixtures.components.push(...[['eligible',bootstrapSession],['member',accountSessionFixture],['admin',{...accountSessionFixture,role:'admin'}],['anonymous',anonymousFixture]].map(([state,Session])=>({componentId:'bootstrap-entry',state,args:[{Session}]})));
accountFixtures.dialogs.push(...['unchecked','checked','pending','error'].map(state=>({dialogId:'admin-bootstrap',state,args:[{checked:state!=='unchecked',pending:state==='pending',error:state==='error'?'BOOTSTRAP_DENIED':null}]})));
for(const state of ['bootstrap-ready','bootstrap-review','bootstrap-checked','bootstrap-pending','bootstrap-error','bootstrap-complete']){
 const dialogState={'bootstrap-review':'unchecked','bootstrap-checked':'checked','bootstrap-pending':'pending','bootstrap-error':'error'}[state];
 accountFixtures.screens.push({fixtureId:'account-'+state,title:'최초 관리자 · '+state,screenId:'account',state,routeId:'account',path:'/account',audiences:['member'],args:[{status:'ready',Config:configFixture,Session:state==='bootstrap-complete'?{...bootstrapSession,role:'admin',can_bootstrap_admin:false}:bootstrapSession,pending:state==='bootstrap-pending',error:state==='bootstrap-error'?{code:'BOOTSTRAP_DENIED'}:null}],...(dialogState?{dialog:{dialogId:'admin-bootstrap',state:dialogState,args:[{checked:dialogState!=='unchecked',pending:dialogState==='pending',error:dialogState==='error'?'BOOTSTRAP_DENIED':null}]}}:{})});
}
accountFixtures.transitions.push(...[
 ['bootstrap-review','bootstrap-ready','bootstrap-review'],['bootstrap-check','bootstrap-review','bootstrap-checked'],['bootstrap-submit','bootstrap-checked','bootstrap-pending'],['bootstrap-complete','bootstrap-pending','bootstrap-complete'],['bootstrap-denied','bootstrap-pending','bootstrap-error'],['bootstrap-cancel','bootstrap-review','bootstrap-ready']
].map(([transitionId,from,to])=>({transitionId,from:'account-'+from,to:'account-'+to})));
