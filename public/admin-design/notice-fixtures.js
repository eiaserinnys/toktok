import {newroomFixtures} from './newroom-fixtures.js';
import {privateMemoryFixture} from './private-fixtures.js';
import {configFixture,anonymousFixture} from './auth-settings-fixtures.js';
const clone=value=>structuredClone(value);
const rooms={recent_buffer:{...privateMemoryFixture},persisted:{...privateMemoryFixture,retention_mode:'persisted',retention_seconds:86400},memory:{...privateMemoryFixture,retention_mode:'memory',retention_seconds:null,recent_buffer:undefined},'tighter-server-limit':{...privateMemoryFixture,retention_seconds:120,recent_buffer:{max_messages:7,max_bytes:65536}},unavailable:null};
const base=clone(newroomFixtures.screens.find(f=>f.state==='member').args[0]);
export const noticeFixtures={
 components:[
  ...['closed','open','focus','long','unavailable'].map(state=>({componentId:'notice-disclosure',state,args:[{id:'notice-example-'+state,title:state==='unavailable'?'보관 조건을 확인할 수 없어요. 다시 확인해주세요.':'대화 보관 안내',body:state==='long'?'<가상 사용자 내용은 실행하지 않아요> '.repeat(60):state==='unavailable'?'실제 서버 snapshot이 필요해요. 값을 추정하지 않아요.':'시각 검수를 위한 가상 설명입니다. 펼쳐도 동의나 권한은 생기지 않아요.',open:['open','long'].includes(state)}],...(state==='focus'?{focusSelector:'summary'}:{})})),
  ...Object.entries(rooms).map(([state,room])=>({componentId:'policy-summary',state,args:[{room}]})),
  {componentId:'risk-check',state:'pending',args:[{id:'fictional-risk-pending',label:'가상 명시 동의 · 서버 응답 대기',checked:true,disabled:true}]}
 ],dialogs:[],
 screens:[
  ...['name','retention','policy-open','checked','submitting','uncertain'].map(state=>({fixtureId:'notice-newroom-'+state,title:'새 방 안내 · '+state,routeId:'new-room',screenId:'newroom',state:'notice-'+state,path:'/new-room',audiences:['member'],args:[{...clone(base),purpose:state==='name'?'':'가상 이름',disclosureOpen:state==='policy-open',checked:['checked','submitting','uncertain'].includes(state),pending:state==='submitting',locked:['submitting','uncertain'].includes(state),status:state==='uncertain'?'uncertain':'ready',error:state==='uncertain'?{code:'CREATE_PENDING'}:null}]})),
  {fixtureId:'notice-room-policy-open',title:'관전 · 보관 안내 펼침',routeId:'private-room',screenId:'room',state:'policy-open',path:'/r/00000000-0000-4000-8000-000000000001/'+'a'.repeat(43),args:[{status:'ready',Session:anonymousFixture,Config:configFixture,room:privateMemoryFixture,disclosureOpen:true}]}
 ],transitions:[
  {transitionId:'notice-name-input',from:'notice-newroom-name',to:'notice-newroom-retention'},
  {transitionId:'notice-retention-expand',from:'notice-newroom-retention',to:'notice-newroom-policy-open'},
  {transitionId:'notice-retention-collapse',from:'notice-newroom-policy-open',to:'notice-newroom-retention',kind:'reference'},
  {transitionId:'notice-risk-check',from:'notice-newroom-retention',to:'notice-newroom-checked'},
  {transitionId:'notice-create-submit',from:'notice-newroom-checked',to:'notice-newroom-submitting'},
  {transitionId:'notice-create-success',from:'notice-newroom-submitting',to:'newroom-created-recent'},
  {transitionId:'notice-create-uncertain',from:'notice-newroom-submitting',to:'notice-newroom-uncertain'},
  {transitionId:'notice-create-retry',from:'notice-newroom-uncertain',to:'notice-newroom-submitting',kind:'reference'},
  {transitionId:'notice-room-expand',from:'private-empty',to:'notice-room-policy-open'},
  {transitionId:'notice-room-collapse',from:'notice-room-policy-open',to:'private-empty',kind:'reference'}
 ]
};
