import {anonymousFixture,adminFixture,configFixture} from './auth-settings-fixtures.js';
import {privateMemoryFixture} from './private-fixtures.js';
const member={...adminFixture,role:'member'};
export function commonHeaderVm(state='anonymous',route='/'){
 return {status:['loading','unavailable'].includes(state)?state:'ready',Session:state==='anonymous'?anonymousFixture:state==='admin'?adminFixture:member,Config:configFixture,ui:{route}};
}
const privatePath='/r/00000000-0000-4000-8000-000000000001/'+'r'.repeat(43);
export const commonHeaderFixtures={
 components:[{componentId:'service-description',state:'default',args:[]},...['member-open','admin-open','logout-pending','logout-error'].map(state=>({componentId:'product-header',state,args:[{...commonHeaderVm(state==='admin-open'?'admin':'member','/guide'),ui:{route:'/guide',accountOpen:true,logoutPending:state==='logout-pending',logoutError:state==='logout-error'?'가상 로그아웃 오류입니다.':''}}]}))],
 dialogs:[],
 screens:[
  ...['introduction','guide'].flatMap(screenId=>['member','admin','loading','unavailable'].map(state=>({fixtureId:screenId+'-header-'+state,title:screenId+' · '+state,routeId:screenId,screenId,state,path:screenId==='guide'?'/guide':'/',audiences:state==='member'||state==='admin'?[state]:['guest'],args:[commonHeaderVm(state,screenId==='guide'?'/guide':'/')]}))),
  {fixtureId:'guide-header-logout-error',title:'사용 안내 · 로그아웃 오류',routeId:'guide',screenId:'guide',state:'logout-error',path:'/guide',audiences:['member'],args:[{...commonHeaderVm('member','/guide'),ui:{route:'/guide',accountOpen:true,logoutError:'가상 로그아웃 오류입니다.'}}]},
  ...['member','admin','loading','unavailable'].map(state=>({fixtureId:'private-header-'+state,title:'비공개 관전 헤더 · '+state,routeId:'private-room',screenId:'room',state:'header-'+state,path:privatePath,audiences:state==='member'||state==='admin'?[state]:['guest'],args:[{...commonHeaderVm(state,privatePath),room:privateMemoryFixture}]})),
  ...['anonymous','member','admin','loading','unavailable'].map(state=>({fixtureId:'terminal-header-'+state,title:'만료 안내 헤더 · '+state,routeId:'private-room',screenId:'terminal',state,path:privatePath,audiences:state==='member'||state==='admin'?[state]:['guest'],args:['ROOM_GONE',commonHeaderVm(state,privatePath)]}))
 ],
 transitions:[
  {transitionId:'introduction-rooms',from:'intro',to:'rooms-default'},
  {transitionId:'introduction-guide',from:'intro',to:'guide'},
  {transitionId:'guide-account',from:'guide-header-member',to:'account-default'},
  {transitionId:'guide-admin',from:'guide-header-admin',to:'settings-overview'},
  {transitionId:'guide-logout-denied',from:'guide-header-member',to:'guide-header-logout-error'},
  {transitionId:'private-expired',from:'private-empty',to:'terminal-header-anonymous'}
 ]
};
