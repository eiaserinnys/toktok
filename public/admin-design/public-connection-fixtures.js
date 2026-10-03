import {anonymousFixture,configFixture} from './auth-settings-fixtures.js';
const slug='fictional-room',request={request_id:'00000000-0000-4000-8000-000000000001',nickname:'가상 검토 에이전트',expires_at:'2026-10-04T00:05:00.000Z',confirmation_expires_at:'2026-10-04T00:05:00.000Z',entry_expires_at:null,entry_notice_version:'toktok-entry-30d-v1',entry_duration_seconds:2592000,lease_idle_seconds:300};
const pending={...request,status:'pending',can_approve:true},approved={...request,status:'approved',can_approve:false,expires_at:'2026-11-03T00:01:00.000Z',entry_expires_at:'2026-11-03T00:01:00.000Z'},legacy={request_id:request.request_id,nickname:request.nickname,status:'approved',expires_at:request.expires_at};
export const publicConnectionFixtures={
 components:[{componentId:'public-agent-entry',state:'bare-url',args:[{slug,title:'가상 공개방'}]},...['pending','approved','unavailable'].map(state=>({componentId:'public-entry-terms',state,args:[{connection:state==='pending'?pending:state==='approved'?approved:null}]}))],
 dialogs:['unchecked','checked','pending','error','revoke','revoke-error','notice-unavailable'].map(state=>({dialogId:'public-connection',state,args:[{nickname:request.nickname,connection:state==='notice-unavailable'?null:state.startsWith('revoke')?approved:pending,checked:state==='checked',pending:state==='pending',error:state==='error'?'OPERATOR_ACK_REQUIRED':state==='revoke-error'?'BUDGET_EXCEEDED':'',revoke:state.startsWith('revoke')}]})),
 screens:['loading','pending','approved','joined','idle','legacy','notice-unavailable','denied','revoked','expired','unavailable'].map(state=>({fixtureId:'public-connection-'+state,title:'공개 연결 · '+state,routeId:'public-room',screenId:'public-connection',state,path:'/public/'+slug+'?connect='+request.request_id,
  args:[{slug,status:['loading','unavailable','expired'].includes(state)?state:'ready',Session:anonymousFixture,Config:configFixture,connection:['loading','unavailable','expired'].includes(state)?null:state==='legacy'?legacy:state==='notice-unavailable'?{...pending,entry_notice_version:null,can_approve:false}:{...(['approved','joined','idle'].includes(state)?approved:pending),status:['joined','idle'].includes(state)?'approved':state,participant_connected:state==='joined'},error:state==='expired'?{code:'CONNECTION_GONE'}:state==='unavailable'?{code:'CONNECTION_UNAVAILABLE'}:null}]})),
 transitions:[
  {transitionId:'public-request',from:'public-empty',to:'public-connection-loading'},
  {transitionId:'public-review',from:'public-connection-loading',to:'public-connection-pending'},
  {transitionId:'public-open-review',from:'public-connection-pending',to:'public-connection-review'},
  {transitionId:'public-check-entry',from:'public-connection-review',to:'public-connection-checked'},
  {transitionId:'public-submit-entry',from:'public-connection-checked',to:'public-connection-approving'},
  {transitionId:'public-approved',from:'public-connection-approving',to:'public-connection-approved'},
  {transitionId:'public-approval-error',from:'public-connection-approving',to:'public-connection-approval-error'},
  {transitionId:'public-review-cancel',from:'public-connection-review',to:'public-connection-pending',kind:'reference'},
  {transitionId:'public-joined',from:'public-connection-approved',to:'public-connection-joined'},
  {transitionId:'public-idle',from:'public-connection-joined',to:'public-connection-idle'},
  {transitionId:'public-reentered',from:'public-connection-idle',to:'public-connection-joined',kind:'reference'},
  {transitionId:'public-entry-expired',from:'public-connection-idle',to:'public-connection-expired'},
  {transitionId:'public-entry-notice-unavailable',from:'public-connection-loading',to:'public-connection-notice-unavailable'},
  {transitionId:'public-posted',from:'public-connection-joined',to:'public-empty',kind:'reference'},
  {transitionId:'public-denied',from:'public-connection-pending',to:'public-connection-denied'},
  {transitionId:'public-revoked',from:'public-connection-joined',to:'public-connection-revoked'},
  {transitionId:'public-revoke-error',from:'public-connection-joined',to:'public-connection-revoke-error'},
  {transitionId:'public-revoke-refresh',from:'public-connection-revoke-error',to:'public-connection-approved',kind:'reference'},
  {transitionId:'public-request-expired',from:'public-connection-pending',to:'public-connection-expired'},
  {transitionId:'public-request-unavailable',from:'public-connection-loading',to:'public-connection-unavailable'}
 ]
};
for(const [state,dialogState] of [['review','unchecked'],['checked','checked'],['approving','pending'],['approval-error','error']]){
 publicConnectionFixtures.screens.push({fixtureId:'public-connection-'+state,title:'공개 입장권 · '+state,routeId:'public-room',screenId:'public-connection',state,path:'/public/'+slug+'?connect='+request.request_id,
  args:[{slug,status:'ready',Session:anonymousFixture,Config:configFixture,connection:pending,pending:state==='approving'}],
  dialog:{dialogId:'public-connection',state:dialogState,args:[{nickname:request.nickname,connection:pending,checked:state==='checked',pending:state==='approving',error:state==='approval-error'?'OPERATOR_ACK_REQUIRED':''}]}});
}
publicConnectionFixtures.screens.push({fixtureId:'public-connection-revoke-error',title:'공개 입장권 · 철회 거절',routeId:'public-room',screenId:'public-connection',state:'revoke-error',path:'/public/'+slug+'?connect='+request.request_id,
 args:[{slug,status:'ready',Session:anonymousFixture,Config:configFixture,connection:approved}],dialog:{dialogId:'public-connection',state:'revoke-error',args:[{nickname:request.nickname,connection:approved,revoke:true,error:'BUDGET_EXCEEDED'}]}});
