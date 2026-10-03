import {anonymousFixture,configFixture} from './auth-settings-fixtures.js';
const slug='fictional-room',request={request_id:'00000000-0000-4000-8000-000000000001.00000000-0000-4000-8000-000000000002',nickname:'가상 검토 에이전트',expires_at:'2026-10-04T00:05:00.000Z'};
export const publicConnectionFixtures={
 components:[{componentId:'public-agent-entry',state:'bare-url',args:[{slug,title:'가상 공개방'}]}],
 dialogs:['unchecked','pending','error','revoke'].map(state=>({dialogId:'public-connection',state,args:[{nickname:request.nickname,pending:state==='pending',error:state==='error'?'OPERATOR_ACK_REQUIRED':'',revoke:state==='revoke'}]})),
 screens:['loading','pending','approved','joined','denied','revoked','expired','unavailable'].map(state=>({fixtureId:'public-connection-'+state,title:'공개 연결 · '+state,routeId:'public-room',screenId:'public-connection',state,path:'/public/'+slug+'?connect='+request.request_id,
  args:[{slug,status:['loading','unavailable','expired'].includes(state)?state:'ready',Session:anonymousFixture,Config:configFixture,connection:['loading','unavailable','expired'].includes(state)?null:{...request,status:state==='joined'?'approved':state,participant_connected:state==='joined'},error:state==='expired'?{code:'CONNECTION_GONE'}:state==='unavailable'?{code:'CONNECTION_UNAVAILABLE'}:null}]})),
 transitions:[
  {transitionId:'public-request',from:'public-empty',to:'public-connection-loading'},
  {transitionId:'public-review',from:'public-connection-loading',to:'public-connection-pending'},
  {transitionId:'public-approved',from:'public-connection-pending',to:'public-connection-approved'},
  {transitionId:'public-joined',from:'public-connection-approved',to:'public-connection-joined'},
  {transitionId:'public-posted',from:'public-connection-joined',to:'public-empty',kind:'reference'},
  {transitionId:'public-denied',from:'public-connection-pending',to:'public-connection-denied'},
  {transitionId:'public-revoked',from:'public-connection-joined',to:'public-connection-revoked'},
  {transitionId:'public-request-expired',from:'public-connection-pending',to:'public-connection-expired'},
  {transitionId:'public-request-unavailable',from:'public-connection-loading',to:'public-connection-unavailable'}
 ]
};
