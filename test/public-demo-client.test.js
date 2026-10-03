import {it,expect,vi} from 'vitest';
import {startPublic} from '../public/public-demo.js';
import {historyWindow,mergeHistory} from '../public/history-window.js';
import {applyPublicPage} from '../public/public-demo-session.js';
const epoch='11111111-1111-4111-8111-111111111111';
const message=n=>({sequence:n,cursor:epoch+':'+n,created_at:new Date().toISOString(),sender:{id:'fictional',nickname:'fixture'},text:'message '+n});
it('uses server pageSize two for latest first read, live delta pagination and wait without fixed limit or timeout',async()=>{
 vi.useFakeTimers();const reads=[],seen=[],nodes=new Map();let pages=0;
 const state={id:'fictional-room',root:{querySelector:key=>{if(!nodes.has(key))nodes.set(key,{textContent:''});return nodes.get(key);}},cursor:null,epoch:null,lease:null,senders:new Map(),paused:false,attempt:0};
 state.viewer={model:historyWindow(),setBusy:()=>{},apply(data,direction){const result=mergeHistory(this.model,data,direction);for(const m of data.messages){seen.push(m.sequence);if(m.sequence===6)state.paused=true;}return result;}};
 vi.stubGlobal('fetch',async(url)=>{const u=new URL(url,'https://fictional.example');
  if(u.pathname.endsWith('/watchers'))return Response.json({lease_token:'fictional-lease'});
  if(!u.pathname.endsWith('/messages')&&!u.pathname.endsWith('/wait'))return Response.json({leases:{participants:0,watchers:1},recent_buffer:{max_age_seconds:3600}});
  reads.push({path:u.pathname,query:[...u.searchParams]});const ns=++pages===1?[1,2]:pages===2?[3,4]:pages===3?[5]:[6];
  return Response.json({epoch,cursor:epoch+':'+ns.at(-1),history_status:'ok',messages:ns.map(message),has_more:pages===2,earliest_cursor:epoch+':0',latest_cursor:epoch+':'+(pages===2?5:ns.at(-1)),before_cursor:epoch+':'+ns[0],has_older:false});
 });
 try{const pending=startPublic(state,{current:()=>true,status:()=>{},append:(_s,m)=>{seen.push(m.sequence);if(m.sequence===4)state.paused=true;}});await vi.advanceTimersByTimeAsync(8000);await pending;
  expect(seen).toEqual([1,2,3,4,5,6]);expect(reads.map(r=>r.path.split('/').at(-1))).toEqual(['messages','wait','messages','wait']);expect(reads.map(r=>r.query)).toEqual([[],[['after',epoch+':2']],[['after',epoch+':4']],[['after',epoch+':5']]]);expect(state.cursor).toBe(epoch+':6');
 }finally{state.controller?.abort();vi.unstubAllGlobals();vi.useRealTimers();}
});
it('describes the truncated initial server window without inventing five minutes or twenty messages',()=>{
 const notices=[];applyPublicPage({cursor:null,epoch:null},{epoch,cursor:epoch+':9',history_status:'ok',messages:[message(8),message(9)],has_more:false,initial_window:{truncated:true,max_age_seconds:60,max_messages:2}},{append:()=>{},reset:()=>{},notice:s=>notices.push(s)});
 expect(notices).toHaveLength(1);expect(notices[0]).toContain('최근');expect(notices[0]).not.toMatch(/5분|20개/);
});
