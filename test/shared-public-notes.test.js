import {it,expect,vi} from 'vitest';
import {renderPublicConversationNotes} from '../public/shared/components/public-conversation-notes.js';
import {room} from '../public/shared/screens/common-room.js';
import {historyWindow,mergeHistory} from '../public/history-window.js';
import {startPublic} from '../public/public-demo.js';

it('places registered public notices below the conversation and preserves escaped selectable copy',()=>{
 const html=room({ui:{route:'/public/fictional-room'}});
 expect(html.indexOf('public-conversation-notes')).toBeGreaterThan(html.indexOf('watch-toolbar'));
 expect(html.slice(html.indexOf('id="feed"'),html.indexOf('watch-toolbar'))).not.toContain('public-notice');
 expect(html).toContain('id="public-retention"');expect(html).toContain('500개');expect(html).toContain('2MiB');expect(html).toContain('1시간');expect(html).toContain('PITR');
 expect(room()).not.toContain('public-conversation-notes');
 expect(renderPublicConversationNotes({historyNotice:'<script>fake</script>'})).toContain('&lt;script&gt;');
});

it('keeps auxiliary notices outside a replaced public history after a real client reset',async()=>{
 vi.useFakeTimers();const epoch='11111111-1111-4111-8111-111111111111';
 const rule={},replace=vi.fn(),note={textContent:'old notice',setAttribute:vi.fn()},feed={querySelector:()=>rule,replaceChildren:replace,insertAdjacentHTML:vi.fn()};
 const policy={ownerDocument:{activeElement:null},querySelectorAll:()=>[],contains:()=>false,innerHTML:''};
 const nodes={'[data-role=public-retention]':policy,'#feed':feed,'#public-history-note':note,'#people':{replaceChildren:vi.fn()},'#waiting-people':{hidden:true},'#lease-counts':{},'#room-status':{},'.message':{}};
 const state={id:'fictional-room',root:{querySelector:s=>nodes[s]},cursor:'old:1',epoch:'old',lease:'fictional-lease',senders:new Map(),paused:false,attempt:0};
 state.viewer={model:historyWindow(),setBusy:()=>{},apply(data,direction){state.paused=true;return mergeHistory(this.model,data,direction);}};
 vi.stubGlobal('fetch',async url=>url.includes('/wait')?Response.json({epoch,cursor:epoch+':1',history_status:'history_reset',messages:[{cursor:epoch+':1',sequence:1,created_at:new Date().toISOString(),sender:{id:'fictional'},text:'fixture'}],has_more:false,earliest_cursor:epoch+':0',latest_cursor:epoch+':1',before_cursor:epoch+':1',has_older:false}):Response.json({leases:{participants:0,watchers:1},recent_buffer:{max_age_seconds:3600}}));
 try{const pending=startPublic(state,{current:()=>true,status:()=>{},append:()=>{state.paused=true;}});await vi.advanceTimersByTimeAsync(2000);await pending;
  expect(state.viewer.model.epoch).toBe(epoch);expect(state.viewer.model.messages).toHaveLength(1);expect(note.textContent).toContain('이전 대화 일부');expect(state.cursor).toBe(epoch+':1');
 }finally{state.controller?.abort();vi.unstubAllGlobals();vi.useRealTimers();}
});

it('projects public gap/reset/window notices below the feed in the same shared screen',()=>{
 for(const vm of [{history_status:'history_gap'},{history_status:'history_reset'},{initial_window:{truncated:true}}]){
  const html=room({...vm,ui:{route:'/public/fictional-room'}}),feed=html.slice(html.indexOf('id="feed"'),html.indexOf('watch-toolbar'));
  expect(feed).toContain('<span>최근 대화</span>');expect(feed).not.toMatch(/이전 대화 일부|그 이전 대화/);
  expect(html.slice(html.indexOf('public-history-note'))).toMatch(vm.initial_window?/이전 대화는 위로 스크롤/:/이전 대화 일부/);
 }
});
