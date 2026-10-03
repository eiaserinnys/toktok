import {settingsFixture} from './settings-fixtures.js';
import {configFixture,anonymousFixture} from './auth-settings-fixtures.js';
const resource={...settingsFixture,revision:27};
const Session={authenticated:true,role:'admin',entitlements:{can_create_private:true,can_persist_private:true},owner_ack:null};
const invitation={id:'00000000-0000-4000-8000-000000000011',status:'active',expires_at:'2026-10-04T00:00:00.000Z'};
const audit={actor:'가상 관리자',time:1770000000000,action:'settings.update',revision:27,changes:{'public.catalog':{count:2,enabled_count:1}}};
const states=['invitations','empty-invitations','used','expired','revoked','audit','empty-audit','loading','denied','unavailable','error'];
export const adminlogsFixtures={components:[],dialogs:[
 ...['default','pending','error'].flatMap(state=>['invitation-create','invitation-revoke'].map(dialogId=>({dialogId,state,args:[{field:settingsFixture.schema.fields.identity.fields.invitationTtlSeconds,ttl_seconds:settingsFixture.settings.identity.invitationTtlSeconds,invitation,pending:state==='pending',error:state==='error'?'가상 ADMIN_REQUIRED':undefined}]}))),
 {dialogId:'invitation-created',state:'one-time',args:[{invitation,code:'Fictional_Opaque_Invite-Code.No_UUID-Gate'}]}
],screens:[...states.map(state=>({fixtureId:'adminlogs-'+state,screenId:'adminlogs',state,routeId:state.includes('audit')?'admin-audit':'admin-invitations',path:state.includes('audit')?'/admin/audit':'/admin/invitations',title:'운영 목록 · '+state,audiences:['admin'],args:[{status:['loading','denied','unavailable'].includes(state)?state:'ready',section:state.includes('audit')?'audit':'invitations',Session:state==='denied'?anonymousFixture:Session,Config:configFixture,resource,rows:state==='audit'?[audit]:['empty-audit','empty-invitations'].includes(state)?[]:[{...invitation,status:['used','expired','revoked'].includes(state)?state:'active'}],error:state==='error'?{code:'ADMIN_REQUIRED'}:null}]})),{fixtureId:'adminlogs-audit-unavailable',screenId:'adminlogs',state:'unavailable',routeId:'admin-audit',path:'/admin/audit',title:'변경 기록 · 연결 불가',audiences:['admin'],args:[{status:'unavailable',section:'audit',Session,Config:configFixture,resource:null,rows:[],error:{code:'ADMIN_REQUIRED'}}]}],transitions:[
 {transitionId:'admin-invitation-created',from:'adminlogs-empty-invitations',to:'adminlogs-invitations'},
 {transitionId:'admin-invitation-create-denied',from:'adminlogs-empty-invitations',to:'adminlogs-error'},
 {transitionId:'admin-invitation-revoked',from:'adminlogs-invitations',to:'adminlogs-revoked'},
 {transitionId:'admin-invitation-used',from:'adminlogs-invitations',to:'adminlogs-used'},
 {transitionId:'admin-invitation-expired',from:'adminlogs-invitations',to:'adminlogs-expired'},
 {transitionId:'admin-invitation-denied',from:'adminlogs-invitations',to:'adminlogs-denied'},
 {transitionId:'admin-invitation-back',from:'adminlogs-invitations',to:'settings-signup'},
 {transitionId:'admin-audit-unavailable',from:'adminlogs-audit',to:'adminlogs-audit-unavailable'},
 {transitionId:'admin-audit-back',from:'adminlogs-audit',to:'settings-overview'}]};
