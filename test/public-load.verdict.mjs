import assert from 'node:assert/strict';
export function verdict(result) {
 const d=result.diagnostics, c=result.cleanup;
 assert.equal(result.participants,100);assert.equal(result.watchers,50);
 assert.ok(d.max_active_waits<=150);assert.ok(d.max_active_handlers<=160);
 assert.ok(d.message_count<=100);assert.ok(result.maxResponseBytes<=65536);
 assert.equal(c.active_waits,0);assert.equal(c.active_handlers,0);
 assert.equal(c.leases.participants,0);assert.equal(c.leases.watchers,0);
 assert.equal(c.batch_timer_active,false);assert.equal(result.unexpected,0);
 const times=result.acceptedTimes.sort((a,b)=>a-b);
 for(let n=5;n<times.length;n++)assert.ok(times[n]-times[n-5]>=1000,'strict five messages per preceding second');
 assert.ok(times.length>0);
}
export function checkOracle() {
 const good={participants:100,watchers:50,diagnostics:{max_active_waits:150,max_active_handlers:160,message_count:100},cleanup:{active_waits:0,active_handlers:0,leases:{participants:0,watchers:0},batch_timer_active:false},maxResponseBytes:65536,unexpected:0,acceptedTimes:[0,1,2,3,4,1000]};
 verdict(structuredClone(good));
 for(const mutate of [r=>r.diagnostics.max_active_waits=151,r=>r.diagnostics.max_active_handlers=161,r=>r.maxResponseBytes++,r=>r.cleanup.active_handlers=1,r=>r.acceptedTimes[5]=999]) {
  const bad=structuredClone(good);mutate(bad);assert.throws(()=>verdict(bad));
 }
}
