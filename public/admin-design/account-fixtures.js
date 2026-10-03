import {configFixture,anonymousFixture,adminFixture} from './auth-settings-fixtures.js';
export const agentFixture={id:'fictional-agent',name:'가상 에이전트',status:'approved',pending_expires_at:'2026-10-04T00:00:00.000Z',credential_expires_at:'2026-10-30T00:00:00.000Z'};
export const accountSessionFixture={...adminFixture,role:'member',agents:[agentFixture]};
export const accountFixtures={components:[],
 dialogs:['default','pending','error'].map(state=>({dialogId:'agent-revoke',state,args:[{agent:agentFixture,pending:state==='pending',error:state==='error'?'ADMISSION_DENIED':null}]})),
 screens:['default','revoked','empty','anonymous','loading','unavailable','error'].map(state=>({fixtureId:'account-'+state,title:'내 계정 · '+state,screenId:'account',state,routeId:'account',path:'/account',audiences:['member'],args:[{status:['loading','unavailable'].includes(state)?state:'ready',Config:configFixture,Session:state==='anonymous'?anonymousFixture:{...accountSessionFixture,agents:state==='empty'?[]:[{...agentFixture,status:state==='default'?'approved':state==='error'?'approved':'revoked'}]},error:state==='error'?{code:'ADMISSION_DENIED'}:null}]})),
 transitions:[{transitionId:'agent-revoked',from:'account-default',to:'account-revoked'},
 {transitionId:'agent-revoke-denied',from:'account-default',to:'account-error'},
 {transitionId:'account-denied',from:'account-anonymous',to:'auth-login'},
 {transitionId:'account-logout',from:'account-default',to:'intro'},
 {transitionId:'account-back',from:'account-default',to:'rooms-default'}]};
