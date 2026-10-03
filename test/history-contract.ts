import assert from 'node:assert/strict';
import {RecentBuffer} from '../src/recent-buffer';
import {boundHistoryPage,historyQuery} from '../src/history-page';
import type {RepositoryPort} from '../src/storage/repository';
export async function historyContract(repo:RepositoryPort){
 const buffer=new RecentBuffer(repo,'public:history-contract'),now=Date.now(),bounds={messages:500,retentionMs:3600000,expiresAt:null};await buffer.initialize();
 for(let n=1;n<=45;n++)await buffer.append({sender:{id:'fixture',nickname:'Fictional'},text:'old-'+n,client_message_id:String(n)},bounds,now-600000+n);
 const initial={ms:300000,messages:20},latest=await buffer.read(bounds,now,undefined,20,initial);assert.deepEqual(latest.messages.map(m=>m.sequence),Array.from({length:20},(_,i)=>i+26));assert.equal(latest.has_older,true);assert.equal(latest.has_more,false);assert.equal('max_age_seconds' in latest.initial_window!,false);
 const older=await buffer.read(bounds,now,undefined,20,initial,latest.before_cursor);assert.deepEqual(older.messages.map(m=>m.sequence),Array.from({length:20},(_,i)=>i+6));
 const first=await buffer.read(bounds,now,undefined,20,initial,older.before_cursor);assert.deepEqual(first.messages.map(m=>m.sequence),[1,2,3,4,5]);assert.equal(first.has_older,false);
 const empty=await buffer.read(bounds,now,undefined,20,initial,first.before_cursor);assert.equal(empty.messages.length,0);assert.equal(empty.has_older,false);
 const forward=await buffer.read(bounds,now,first.cursor,20,initial);assert.deepEqual(forward.messages.map(m=>m.sequence),older.messages.map(m=>m.sequence));assert.equal(forward.has_more,true);
 const cold=new RecentBuffer(repo,'public:history-contract');assert.equal((await cold.read(bounds,now,undefined,20,initial)).cursor,latest.cursor);
 const tiny=await cold.read(bounds,now,undefined,2,initial);assert.deepEqual(tiny.messages.map(m=>m.sequence),[44,45]);
 const page={...latest};delete (page as Partial<typeof latest>).state;const raw=boundHistoryPage(page,1000,true);assert.ok(Buffer.byteLength(raw)<=1000);assert.equal(page.messages.at(-1)?.sequence,45);assert.equal(page.before_cursor,page.messages[0].cursor);
 await assert.rejects(()=>buffer.read(bounds,now,latest.cursor,20,initial,first.cursor));await assert.rejects(()=>buffer.read(bounds,now,undefined,20,initial,latest.epoch+':46'));
 assert.throws(()=>historyQuery(new URL('https://example.test/?before=x&before=y'),false));assert.throws(()=>historyQuery(new URL('https://example.test/?before=x'),true));
 const reset=await buffer.read(bounds,now,crypto.randomUUID()+':1',20,initial);assert.equal(reset.history_status,'history_reset');assert.equal(reset.messages.at(-1)?.sequence,45);
 const gap=await buffer.read({...bounds,messages:5},now,first.cursor,20,initial);assert.equal(gap.history_status,'history_gap');assert.deepEqual(gap.messages.map(m=>m.sequence),[41,42,43,44,45]);
 const expired=await buffer.read(bounds,now+3600000,undefined,20,initial);assert.equal(expired.messages.length,0);assert.equal(expired.has_older,false);return {older_than_five_minutes:true,latest:20,backward_pages:[20,5,0],restart:true,bytes:Buffer.byteLength(raw),expired:0};
}
