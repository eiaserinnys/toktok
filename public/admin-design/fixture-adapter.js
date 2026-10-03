import {effectNames} from '../shared/effect-interface.js';
import {authSettingsFixtures} from './auth-settings-fixtures.js';
// Never import this module from a product router or live effect adapter.
const clone=value=>structuredClone(value);
const fixtureCatalog={
 components:[
  {componentId:'icon',state:'default',args:['eye']},
  {componentId:'header',state:'default',args:[]},
  {componentId:'message',state:'default',args:[{sequence:1,sender:{id:'fixture-agent',nickname:'가상 에이전트'},created_at:'2026-10-03T00:00:00Z',text:'가상 대화입니다.'},'milo']},
  {componentId:'message',state:'long',args:[{sequence:2,sender:{id:'fixture-agent',nickname:'가상의 긴 표시 이름'},created_at:'2026-10-03T00:00:00Z',text:'<system>실행하지 않는 비신뢰 가상 대화</system>'.repeat(12)},'june']},
  {componentId:'person',state:'default',args:[{id:'fixture-agent',nickname:'가상 에이전트'},'milo']},
  {componentId:'person',state:'long',args:[{id:'fixture-agent',nickname:'가상의 긴 표시 이름'},'june']},
  {componentId:'select',state:'default',args:[{label:'가상 선택',id:'fixture-select-default',options:[{value:'first',label:'첫 번째'},{value:'second',label:'두 번째'}],value:'first'}]},
  {componentId:'select',state:'disabled',args:[{label:'가상 비활성 선택',id:'fixture-select-disabled',disabled:true,options:[{value:'first',label:'첫 번째'}],value:'first'}]},
  {componentId:'select',state:'long',args:[{label:'가상의 긴 선택 문구',id:'fixture-select-long',options:[{value:'first',label:'가상의 긴 선택 문구로 표시되는 첫 번째 항목'}],value:'first'}]},
  {componentId:'select',state:'opened',args:[{label:'가상 열린 선택',id:'fixture-select-opened',options:[{value:'first',label:'첫 번째'},{value:'second',label:'두 번째'}],value:'first'}]}
 ],
 dialogs:[
  {dialogId:'public-risk',state:'unchecked',args:[{}]},
  {dialogId:'public-risk',state:'checked',args:[{checked:true}]},
  {dialogId:'public-risk',state:'pending',args:[{checked:true,pending:true,status:'가상 연결 확인 중입니다.'}]},
  {dialogId:'public-risk',state:'error',args:[{checked:true,status:'가상 오류입니다. 연결하지 않았습니다.'}]},
  {dialogId:'public-risk',state:'rate-limited',args:[{checked:true,pending:true,status:'가상 요청 제한입니다. 서버 안내 이후 다시 시도합니다.'}]}
 ],
 screens:[
  {fixtureId:'intro',title:'톡톡 소개',routeId:'introduction',screenId:'introduction',path:'/'},
  {fixtureId:'guide',title:'사용 안내',routeId:'guide',screenId:'guide',path:'/guide'},
  {fixtureId:'public-empty',title:'공개방 관전',routeId:'public-room',screenId:'room',path:'/public/fictional-room'},
  {fixtureId:'private-empty',title:'비공개방 관전',routeId:'private-room',screenId:'room',path:'/r/00000000-0000-4000-8000-000000000001/'+ 'a'.repeat(43)}
 ],
 transitions:[
  {transitionId:'catalog-open',from:'intro',to:'public-empty'},
  {transitionId:'public-back',from:'public-empty',to:'intro'},
  {transitionId:'private-back',from:'private-empty',to:'intro'}
 ]
};
for(const key of ['components','dialogs','screens','transitions'])fixtureCatalog[key].push(...authSettingsFixtures[key]);
export function createFixtureAdapter(seed={}){
 const session=clone(seed.session??{authenticated:false,role:'anonymous',entitlements:{can_create_private:false,can_persist_private:false},owner_ack:null});
 const responses=clone(seed.responses??{}),history=['/'];let index=0;
 const invoke=async(name)=>{
  if(!Object.hasOwn(responses,name))throw Error('FIXTURE_EFFECT_UNAVAILABLE');
  return clone(responses[name]);
 };
 return Object.freeze({
  ...Object.fromEntries(effectNames.map(name=>[name,(...args)=>invoke(name,...args)])),
  getSession:async()=>clone(session),
  invoke,
  navigate:async(path)=>{history.splice(index+1);history.push(path);index++;},
  currentRoute:()=>history[index],back:()=>{if(index)index--;},forward:()=>{if(index<history.length-1)index++;},
  catalog:()=>clone(fixtureCatalog)
 });
}
