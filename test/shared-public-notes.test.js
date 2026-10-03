import {it,expect,vi} from 'vitest';
import {renderPublicConversationNotes} from '../public/shared/components/public-conversation-notes.js';
import {room} from '../public/shared/screens/common-room.js';
import {startPublic} from '../public/public-demo.js';

it('places registered public notices below the conversation and preserves escaped selectable copy',()=>{
 const html=room({ui:{route:'/public/fictional-room'}});
 expect(html.indexOf('public-conversation-notes')).toBeGreaterThan(html.indexOf('watch-toolbar'));
 expect(html.slice(html.indexOf('id="feed"'),html.indexOf('watch-toolbar'))).not.toContain('public-notice');
 expect(html).toContain('500개·2MiB·1시간');expect(html).toContain('PITR');
 expect(room()).not.toContain('public-conversation-notes');
 expect(renderPublicConversationNotes({historyNotice:'<script>fake</script>'})).toContain('&lt;script&gt;');
});

it('keeps auxiliary notices outside a replaced public history after a real client reset',async()=>{
 vi.useFakeTimers();const epoch='11111111-1111-4111-8111-111111111111';
 const rule={},replace=vi.fn(),note={textContent:'old notice'},feed={querySelector:()=>rule,replaceChildren:replace,insertAdjacentHTML:vi.fn()};
 const nodes={'#feed':feed,'#public-history-note':note,'#people':{replaceChildren:vi.fn()},'#waiting-people':{hidden:true},'#lease-counts':{},'#room-status':{},'.message':{}};
 const state={id:'fictional-room',root:{querySelector:s=>nodes[s]},cursor:'old:1',epoch:'old',lease:'fictional-lease',senders:new Map(),paused:false,attempt:0};
 vi.stubGlobal('fetch',async url=>url.includes('/wait')?Response.json({epoch,cursor:epoch+':1',history_status:'history_reset',messages:[{cursor:epoch+':1',sequence:1}],has_more:false}):Response.json({leases:{participants:0,watchers:1}}));
 try{const pending=startPublic(state,{current:()=>true,status:()=>{},append:()=>{state.paused=true;}});await vi.advanceTimersByTimeAsync(2000);await pending;
  expect(replace).toHaveBeenCalledExactlyOnceWith(rule);expect(note.textContent).toContain('이전 대화 일부');expect(state.cursor).toBe(epoch+':1');
 }finally{state.controller?.abort();vi.unstubAllGlobals();vi.useRealTimers();}
});

it('projects public gap/reset/window notices below the feed in the same shared screen',()=>{
 for(const vm of [{history_status:'history_gap'},{history_status:'history_reset'},{initial_window:{truncated:true}}]){
  const html=room({...vm,ui:{route:'/public/fictional-room'}}),feed=html.slice(html.indexOf('id="feed"'),html.indexOf('watch-toolbar'));
  expect(feed).toContain('<span>최근 대화</span>');expect(feed).not.toMatch(/이전 대화 일부|그 이전 대화/);
  expect(html.slice(html.indexOf('public-history-note'))).toMatch(/이전 대화 일부|그 이전 대화/);
 }
});
