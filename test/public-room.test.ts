import { env } from 'cloudflare:workers';
import { SELF,runInDurableObject,evictDurableObject } from 'cloudflare:test';
import { describe,it,expect } from 'vitest';
import type { PublicEnv,PublicPolicy,Bucket } from '../src/public-contracts';
import type {PublicRoom} from '../src/public-room';
interface PublicFixtureEnv extends Omit<PublicEnv,'PUBLIC_ROOMS'> {PUBLIC_ROOMS:DurableObjectNamespace<PublicRoom>;}
import { PUBLIC_NOTICE,PUBLIC_POLICY,INTERNAL_IP_HEADER } from '../src/public-contracts';
const origin='http://localhost:18793',base='/api/public/rooms/common-room';
const stub=()=> (env as unknown as PublicFixtureEnv).PUBLIC_ROOMS.getByName('common-room');
interface FixtureState {clock:()=>number;policy:PublicPolicy;responses:Bucket;bytes:Bucket;}
// Mutation callbacks return void; observations below have a concrete JSON-safe record R.
const inRoom=(callback:(instance:FixtureState)=>void):Promise<void>=>runInDurableObject<PublicRoom,void>(stub(),i=>callback(i as unknown as FixtureState));
let ipNumber=0;
const freshIP=()=>`198.51.${Math.floor(++ipNumber/250)}.${ipNumber%250+1}`;
async function api(path:string,token?:string,method='GET',data?:unknown,ip='192.0.2.1',extra:Record<string,string>={}) {
  const response=await SELF.fetch(origin+path,{method,headers:{'x-fixture-ip':ip,...(token?{Authorization:`Bearer ${token}`}:{ }),...(data!==undefined?{'Content-Type':'application/json'}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});
  // Drain the runtime transport even when an assertion only inspects status.
  return new Response(response.status===204?null:await response.arrayBuffer(),response);
}
async function grant(ip:string) {const r=await api('/__fixture/grants/common-room',undefined,'POST',undefined,ip);expect(r.status).toBe(201);return (await r.json() as any).operator_grant;}
async function join(ip=freshIP(),operator?:string,id=crypto.randomUUID()) {
  const g=operator??await grant(ip);
  const r=await api(base+'/participants',undefined,'POST',{operator_grant:g,client_request_id:id,nickname:'창작 참여자',notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'memory'},ip);
  expect(r.status).toBe(201);return {...await r.json() as any,ip,operator:g,joinId:id};
}
async function watch(ip=freshIP()) {const r=await api(base+'/watchers',undefined,'POST',{notice_version:PUBLIC_NOTICE},ip);expect(r.status).toBe(201);return {...await r.json() as any,ip};}
const send=(p:any,id:string,text='창작 메시지')=>api(base+'/messages',p.lease_token,'POST',{text,client_message_id:id},p.ip);
const advance=(ms:number)=>inRoom(i=>{const now=i.clock()+ms;i.clock=()=>now;});
const reset=async()=>{await inRoom(()=>null);await evictDurableObject(stub());};
describe('independent public memory engine through Worker HTTP',()=>{
 it('validates allowlist/method/origin/notice and keeps unchecked operator HTTP closed',async()=>{
  expect((await api('/api/public/rooms')).status).toBe(200);
  expect((await api('/api/public/rooms/arbitrary')).status).toBe(404);
  expect((await api(base+'/operator-grants',undefined,'POST',{checked:true})).status).toBe(403);
  expect((await api(base+'/watchers',undefined,'POST',{notice_version:PUBLIC_NOTICE},freshIP(),{Origin:'https://evil.example'})).status).toBe(403);
  expect((await api(base+'/watchers',undefined,'POST',{notice_version:'wrong'})).status).toBe(400);
 });
 it('enforces 100 participant and 50 watcher leases without joining twice',async()=>{
  await reset();const first=await join();
  const retry=await join(first.ip,first.operator,first.joinId);expect(retry.lease_token).toBe(first.lease_token);
  for(let n=1;n<100;n++)await join();
  const ip=freshIP(),g=await grant(ip);
  const denied=await api(base+'/participants',undefined,'POST',{operator_grant:g,client_request_id:'overflow',nickname:'넘침',notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'memory'},ip);
  expect(denied.status).toBe(429);expect(denied.headers.get('Retry-After')).not.toBeNull();
  for(let n=0;n<50;n++)await watch();
  expect((await api(base+'/watchers',undefined,'POST',{notice_version:PUBLIC_NOTICE},freshIP())).status).toBe(429);
  const meta=await (await api(base,first.lease_token,'GET',undefined,first.ip)).json() as any;
  expect(meta.leases).toEqual({participants:100,watchers:50,unit:'logical_lease'});
 });
 it('returns slots on leave and idle expiry; refusals do not extend a lease',async()=>{
  await reset();const p=await join();await api(base+'/lease',p.lease_token,'DELETE',undefined,p.ip);
  expect((await api(base,p.lease_token)).status).toBe(403);
  const w=await watch();await advance(300001);
  expect((await api(base,w.lease_token)).status).toBe(403);
  const d=await stub().diagnostics();expect(d.leases).toEqual({participants:0,watchers:0,unit:'logical_lease'});
 });
 it('bounds grant/IP admission and never replaces live rate keys when full',async()=>{
  await reset();const ip=freshIP();for(let n=0;n<5;n++)await grant(ip);
  expect((await api('/__fixture/grants/common-room',undefined,'POST',undefined,ip)).status).toBe(429);
  await inRoom(i=>{i.policy={...i.policy,ipKeys:1};});
  expect((await api('/__fixture/grants/common-room',undefined,'POST',undefined,freshIP())).status).toBe(429);
  await inRoom(i=>{i.policy={...i.policy,ipKeys:2048,pendingGrants:5};});
  expect((await api('/__fixture/grants/common-room',undefined,'POST',undefined,freshIP())).status).toBe(429);
 });
 it('uses one operator cooldown across leave/rejoin, plus IP and strict sliding room limits',async()=>{
  await reset();const a=await join(),b=await join(a.ip);
  expect((await send(a,'a')).status).toBe(201);
  const limited=await send(b,'b');expect(limited.status).toBe(429);expect((await limited.json() as any).error.retry_after_ms).toBeGreaterThan(0);
  await api(base+'/lease',a.lease_token,'DELETE',undefined,a.ip);
  const rejoined=await join(a.ip,a.operator);
  expect((await send(rejoined,'new')).status).toBe(429);
  await advance(30000);
  const speakers=[rejoined,b,...await Promise.all(Array.from({length:5},()=>join()))];
  const results=await Promise.all(speakers.map((p,n)=>send(p,'burst'+n)));
  expect(results.filter(r=>r.status===201).length).toBe(5);
  const rejected=results.findIndex((r,n)=>n>=2&&r.status===429);
  expect(rejected).toBeGreaterThanOrEqual(2);
  await advance(999);expect((await send(speakers[rejected],'early')).status).toBe(429);
  await advance(1);expect((await send(speakers[rejected],'next')).status).toBe(201);
 });
 it('keeps one message for identical retries and rejects changed content, with ordered concurrent posts',async()=>{
  await reset();const ps=await Promise.all(Array.from({length:5},()=>join()));
  const posted=await Promise.all(ps.map((p,n)=>send(p,'id'+n).then(r=>r.json() as Promise<any>)));
  expect(posted.map(m=>m.sequence).sort()).toEqual([1,2,3,4,5]);
  const retry=await send(ps[0],'id0');expect(retry.status).toBe(200);expect(await retry.json()).toEqual(posted[0]);
  expect((await send(ps[0],'id0','別の創作')).status).toBe(409);
  const empty=await runInDurableObject<PublicRoom,{keys:number;tables:{name:string}[];alarm:number|null}>(stub(),async(_i,s)=>({keys:(await s.storage.list()).size,tables:s.storage.sql.exec<{name:string}>("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").toArray(),alarm:await s.storage.getAlarm()}));
  expect(empty.keys).toBe(0);expect(empty.tables).toEqual([]);expect(empty.alarm).toBeNull();
 });
 it('enforces UTF8/body/page bytes and 100/count + 1h/time pruning with explicit gaps',async()=>{
  await reset();const p=await join(),second=await join();
  expect((await send(p,'large','한'.repeat(683))).status).toBe(413);
  expect((await send(p,'body','x'.repeat(8193))).status).toBe(413);
  for(let n=0;n<101;n++){await advance(15000);const r=await send(n%2?p:second,'m'+n,'\u0001'.repeat(1024));expect(r.status).toBe(201);}
  const gap=await (await api(base+'/messages?after='+encodeURIComponent((await stub().diagnostics()).epoch+':0'),p.lease_token,'GET',undefined,p.ip)).json() as any;
  expect(gap.history_status).toBe('history_gap');expect(gap.notice).toBeTruthy();expect(gap.messages.length).toBeLessThanOrEqual(20);
  await advance(2000);const r=await api(base+'/messages',p.lease_token,'GET',undefined,p.ip);const raw=await r.text();
  expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(65536);expect(JSON.parse(raw).messages.length).toBeLessThan(20);
  expect(JSON.parse(raw).initial_window).toEqual({max_age_seconds:300,max_messages:20,truncated:true});
  expect(JSON.parse(raw).cursor).toBe(JSON.parse(raw).messages.at(-1).cursor);
  await advance(3600001);const w=await watch();const page=await (await api(base+'/messages',w.lease_token,'GET',undefined,w.ip)).json() as any;
  expect(page.messages).toEqual([]);expect((await stub().diagnostics()).buffer_bytes).toBe(0);
 });
 it('changes epoch on eviction and reports reset without reproducing old body',async()=>{
  await reset();const p=await join(),sent=await (await send(p,'old','忘れる本文')).json() as any;
  await reset();expect((await api(base,p.lease_token)).status).toBe(409);
  const w=await watch();const r=await api(base+'/messages?after='+encodeURIComponent(sent.cursor),w.lease_token,'GET',undefined,w.ip);
  const raw=await r.text();expect(JSON.parse(raw).history_status).toBe('history_reset');expect(raw).not.toContain('忘れる本文');
 });
 it('batches reads at 2s, rejects duplicate waits and cleans abort through Worker fetch to DO fetch',async()=>{
  await reset();const p=await join(),w=await watch();
  const control=new AbortController();
  const pending=SELF.fetch(origin+base+'/wait?timeout=25',{headers:{Authorization:`Bearer ${w.lease_token}`,'x-fixture-ip':w.ip},signal:control.signal}).catch(()=>null);
  for(let n=0;n<50&&(await stub().diagnostics()).active_waits===0;n++)await new Promise(r=>setTimeout(r,10));
  expect((await api(base+'/wait',w.lease_token,'GET',undefined,w.ip)).status).toBe(409);
  control.abort();const canceled=await pending;if(canceled)await canceled.arrayBuffer();
  for(let n=0;n<50&&(await stub().diagnostics()).active_handlers!==0;n++)await new Promise(r=>setTimeout(r,10));
  expect((await stub().diagnostics()).active_waits).toBe(0);expect((await stub().diagnostics()).active_handlers).toBe(0);
  await send(p,'batch');const start=Date.now();const first=await api(base+'/messages',w.lease_token,'GET',undefined,w.ip);expect(first.status).toBe(200);
  expect(Date.now()-start).toBeLessThan(2200);
  expect((await api(base+'/messages',w.lease_token,'GET',undefined,w.ip)).status).toBe(429);
 });
 it('reclaims silent waits at 25 seconds and applies count/byte response budgets',async()=>{
  await reset();const w=await watch();const start=Date.now();
  expect((await api(base+'/wait?timeout=25',w.lease_token,'GET',undefined,w.ip)).status).toBe(200);
  expect(Date.now()-start).toBeLessThan(25500);expect((await stub().diagnostics()).active_waits).toBe(0);
  await inRoom(i=>{i.responses.tokens=0;i.policy={...i.policy,responsesPerSecond:0};});
  await advance(2000);expect((await api(base+'/messages',w.lease_token,'GET',undefined,w.ip)).status).toBe(429);
  await inRoom(i=>{i.responses.tokens=150;i.bytes.tokens=0;i.policy={...i.policy,bytesPerSecond:0};});
  expect((await api(base+'/messages',w.lease_token,'GET',undefined,w.ip)).status).toBe(429);
 });
 it('replaces external internal-IP headers and rejects invalid bodies before refreshing activity',async()=>{
  await reset();const p=await join();const d=await api(base+'/messages',p.lease_token,'POST',{text:'x',client_message_id:'spoof'},p.ip,{[INTERNAL_IP_HEADER]:'attacker'});
  expect(d.status).toBe(201);
  expect((await api(base+'/messages',p.lease_token,'POST',{text:'x',client_message_id:'spoof2'},p.ip,{[INTERNAL_IP_HEADER]:'different'})).status).toBe(429);
  expect(PUBLIC_POLICY.roomWindowMs).toBe(1000);
 });
 it('provides bounded initial window, delta and empty timeout cursors with a static fragment guide',async()=>{
  await reset();const p=await join(),w=await watch();
  const initial=await (await api(base+'/messages',w.lease_token,'GET',undefined,w.ip)).json() as any;
  expect(initial.cursor).toMatch(/:0$/);expect(initial.initial_window.truncated).toBe(false);
  const sent=await (await send(p,'first')).json() as any;await advance(2000);
  const delta=await (await api(base+'/messages?after='+encodeURIComponent(initial.cursor),w.lease_token,'GET',undefined,w.ip)).json() as any;
  expect(delta.messages.map((m:any)=>m.sequence)).toEqual([1]);expect(delta.cursor).toBe(sent.cursor);expect(delta.initial_window).toBeUndefined();
  await advance(2000);const empty=await (await api(base+'/wait?timeout=0&after='+encodeURIComponent(sent.cursor),w.lease_token,'GET',undefined,w.ip)).json() as any;
  expect(empty.messages).toEqual([]);expect(empty.cursor).toBe(sent.cursor);
  const before=await stub().diagnostics();const r=await api('/public/common-room?format=md');const guide=await r.text();
  expect(guide).toContain('#grant=SECRET');expect(guide).toContain('30초');expect(guide).not.toContain(p.operator);expect((await stub().diagnostics()).leases).toEqual(before.leases);
 });
});
