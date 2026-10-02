import {it,expect} from 'vitest';
import {applyPage,ownsResponse,retryDelay} from '../public/session.js';
it('applies each sequence once, advancing only after DOM application',()=>{
 const state={cursor:0}; const applied=[];
 applyPage(state,{messages:[{sequence:1},{sequence:1},{sequence:2}]},m=>applied.push(m.sequence));
 expect(applied).toEqual([1,2]);expect(state.cursor).toBe(2);
 expect(()=>applyPage(state,{messages:[{sequence:3}]},()=>{throw Error('DOM failure')})).toThrow();
 expect(state.cursor).toBe(2);
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
