const path='/r/00000000-0000-4000-8000-000000000001/'+'r'.repeat(43);
const room={purpose:'가상 비공개 대화',status:'open',expires_at:'2026-10-04T00:00:00.000Z',visibility:'private',notice_version:'toktok-risk-v1',retention_mode:'memory',retention_seconds:null,metadata_persisted:true,link_possession_access:true,end_to_end_encrypted:false};
export const privateFixtures={components:[],dialogs:[],screens:['persisted','history-gap','history-reset','paused','rate-limited'].map(state=>({fixtureId:'private-'+state,title:'비공개 관전 · '+state,routeId:'private-room',screenId:'room',state,path,args:[{room:{...room,...(state==='persisted'?{retention_mode:'persisted',retention_seconds:86400}:{})},history_status:state==='history-gap'?'history_gap':state==='history-reset'?'history_reset':'ok',watchStatus:state==='paused'?'대화를 잠시 멈췄어요. 읽던 자리를 그대로 두어요.':state==='rate-limited'?'잠시 기다려주세요. 서버가 안내한 시간 뒤 이어 읽어요.':'최근 보관 범위의 대화를 읽어요.'}]})),transitions:[
 {transitionId:'private-history-gap',from:'private-empty',to:'private-history-gap'},
 {transitionId:'private-history-reset',from:'private-empty',to:'private-history-reset'},
 {transitionId:'private-paused',from:'private-empty',to:'private-paused'},
 {transitionId:'private-resumed',from:'private-paused',to:'private-empty'},
 {transitionId:'private-rate-limited',from:'private-empty',to:'private-rate-limited'}]};
export const privateMemoryFixture=room;
