import {it,expect} from 'vitest';
import {applyPage,ownsResponse,retryDelay,privateReadPath} from '../public/session.js';
import {privateNotice} from '../public/shared/components/private-notice.js';
const epoch='00000000-0000-4000-8000-000000000001',next='00000000-0000-4000-8000-000000000002';
const message=(sequence,e=epoch)=>({sequence,cursor:e+':'+sequence});
const page=(messages,options={})=>({epoch,history_status:'ok',has_more:false,cursor:messages.at(-1)?.cursor??epoch+':0',messages,...options});
it('applies bounded initial and subsequent epoch pages once, advancing only after DOM application',()=>{
 const state={cursor:null,epoch:null};const applied=[];
 expect(privateReadPath(state)).toBe('/messages');
 applyPage(state,page([message(18),message(19)],{has_more:true}),{append:m=>applied.push(m.sequence)});
 expect(state.cursor).toBe(epoch+':19');expect(privateReadPath(state,true)).toBe('/messages?after='+encodeURIComponent(epoch+':19'));
 applyPage(state,page([message(19),message(20)]),{append:m=>applied.push(m.sequence)});
 expect(applied).toEqual([18,19,20]);expect(state.cursor).toBe(epoch+':20');
 expect(privateReadPath(state)).toBe('/wait?after='+encodeURIComponent(epoch+':20'));
 expect(()=>applyPage(state,page([message(21)]),{append:()=>{throw Error('DOM failure');}})).toThrow();expect(state.cursor).toBe(epoch+':20');
});
it('clears previous generations only on explicit history reset/gap and uses the returned bounded window',()=>{
 const state={cursor:epoch+':20',epoch};const applied=[],events=[];
 const hooks={append:m=>applied.push(m.cursor),reset:()=>events.push('reset'),notice:copy=>events.push(copy)};
 applyPage(state,page([message(4,next)],{epoch:next,history_status:'history_reset'}),hooks);
 expect(events[0]).toBe('reset');expect(events[1]).toContain('이전 대화 일부');expect(applied).toEqual([next+':4']);expect(state.cursor).toBe(next+':4');
 applyPage(state,page([message(12,next)],{epoch:next,history_status:'history_gap'}),hooks);expect(state.cursor).toBe(next+':12');expect(events.filter(e=>e==='reset')).toHaveLength(2);
 expect(()=>applyPage(state,page([message(1)],{}),hooks)).toThrow('SEQUENCE_GAP');expect(state.cursor).toBe(next+':12');
});
it('keeps empty epoch cursors and rejects malformed cursors without clearing existing content',()=>{
 const state={cursor:null,epoch:null};applyPage(state,page([],{cursor:epoch+':31'}),{append:()=>{throw Error();}});expect(state.cursor).toBe(epoch+':31');
 let reset=0;expect(()=>applyPage(state,page([message(1,next)],{epoch:next,history_status:'history_reset',cursor:'invalid'}),{append:()=>{},reset:()=>reset++})).toThrow();expect(reset).toBe(0);expect(state.cursor).toBe(epoch+':31');
});
it('shows actual private retention snapshot and machine acknowledgement separately from service safety',()=>{
 const snapshot={visibility:'private',notice_version:'toktok-risk-v2',retention_mode:'persisted',retention_seconds:86400,metadata_persisted:true,link_possession_access:true,end_to_end_encrypted:false};
 const html=privateNotice(snapshot);expect(html).toContain('86,400초');expect(html).toContain('metadata');expect(html).toContain('machine acknowledgement');expect(html).toContain('data-safety-version');expect(html).not.toContain('30일');
 expect(privateNotice({...snapshot,retention_mode:'recent_buffer',retention_seconds:3600,recent_buffer:{max_messages:500,max_bytes:2097152}})).toContain('재시작');
 expect(()=>privateNotice({...snapshot,retention_seconds:null})).toThrow('PRIVATE_NOTICE_UNAVAILABLE');
});
it('rejects a late old request after pause or room ownership changes',()=>{
 const controller=new AbortController(),state={controller};
 expect(ownsResponse(state,controller,state)).toBe(true);
 controller.abort();expect(ownsResponse(state,controller,state)).toBe(false);
 const fresh={controller:new AbortController()};expect(ownsResponse(fresh,fresh.controller,state)).toBe(false);
});

it('honors rate-limit retry delay and bounds the one reconnect backoff',()=>{
 expect(retryDelay(new Response(null,{status:429,headers:{'Retry-After':'60'}}),0)).toBe(60000);
 expect(retryDelay(undefined,99)).toBe(15000);
});
