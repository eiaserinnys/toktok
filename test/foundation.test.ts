import {approvedAgent} from './agent-fixture';
import { env } from 'cloudflare:workers';
import { SELF, runInDurableObject, runDurableObjectAlarm, evictDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const origin = 'http://localhost:8787';
let ip = 0;

async function api(path: string, token?: string, method='GET', body?: unknown, headers: Record<string,string>={}) {
  return SELF.fetch(origin+path, {method, headers:{'CF-Connecting-IP':`192.0.2.${++ip}`, ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...headers}, body:body===undefined ? undefined : JSON.stringify(body)});
}
async function create() {
  const response = await api('/api/rooms',await approvedAgent(),'POST',{purpose:'창작 대화 시험',ttl_seconds:60});
  expect(response.status).toBe(201);
  const data = await response.json() as any;
  const invite = new URL(data.invite_url).pathname.split('/').at(-1)!;
  const read = new URL(data.read_url).pathname.split('/').at(-1)!;
  return {...data, invite, read, base:`/api/rooms/${data.room.id}`};
}
async function join(room: any, name='참여자') {
  const response=await api(room.base+'/participants',room.invite,'POST',{nickname:name});
  expect(response.status).toBe(201);
  return await response.json() as any;
}
const send = (r:any,p:any,id:string,text=id,reply_to?:number) => api(r.base+'/messages',p.participant_token,'POST',{text,client_message_id:id, ...(reply_to===undefined?{}:{reply_to})});
const stub = (r:any): DurableObjectStub => env.ROOMS.get(env.ROOMS.idFromName(r.room.id));
const counts = (r:any) => runInDurableObject(stub(r),(_instance,state)=> ({tables:state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").toArray(), bytes:state.storage.sql.databaseSize}));

// Each test starts through HTTP; internal inspection is only for physical deletion and lifecycle cleanup.
describe('HTTP room foundation in Workers SQLite runtime',()=>{
  it('blocks missing/invalid creator credentials and refuses external browser changes',async()=>{
    expect((await api('/api/rooms',undefined,'POST',{purpose:'창작'})).status).toBe(401);
    expect((await api('/api/rooms','bad','POST',{purpose:'창작'})).status).toBe(401);
    expect((await api('/api/rooms','local-fixture-creator','POST',{purpose:'창작'},{Origin:'https://outside.example'})).status).toBe(403);
  });
  it('separates all capabilities and keeps guide GET side-effect free',async()=>{
    const r=await create();
    for(let n=0;n<2;n++) {
      const guide=await api(new URL(r.invite_url).pathname+'?format=md');
      expect(guide.status).toBe(200);
      const text=await guide.text();
      expect(text).toContain('/wait?after=');
      expect(text).not.toContain(r.owner_token);
      expect(text).not.toContain('local-fixture-creator');
    }
    const total=await runInDurableObject(stub(r),(_i,s)=>s.storage.sql.exec('SELECT COUNT(*) AS n FROM participants').one().n);
    expect(total).toBe(0);
    expect((await api(new URL(r.invite_url).pathname)).headers.get('Content-Type')).toContain('text/plain');
    expect((await api(r.base)).status).toBe(401);
    expect((await api(r.base,'bad')).status).toBe(403);
    expect((await api(r.base+'/participants',r.read,'POST',{nickname:'관전'})).status).toBe(403);
    const p=await join(r);
    for(const t of [r.invite,r.read,r.owner_token]) expect((await api(r.base+'/messages',t,'POST',{text:'창작',client_message_id:'a'})).status).toBe(403);
    expect((await api(r.base+'/close',p.participant_token,'POST')).status).toBe(403);
    expect(new Set([r.invite,r.read,r.owner_token,p.participant_token]).size).toBe(4);
    for(const token of [r.invite,r.read,r.owner_token,p.participant_token]) expect(token).toMatch(/^[\w-]{43}$/);
  });
  it('stores concurrent messages in monotonic order with idempotent retry and conflict',async()=>{
    const r=await create(), a=await join(r,'같은 이름'), b=await join(r,'같은 이름');
    const responses=await Promise.all(Array.from({length:12},(_,i)=>send(r,i%2?a:b,`id-${i}`)));
    expect(responses.every(x=>x.status===201)).toBe(true);
    const same=await Promise.all([send(r,a,'retry','재전송'),send(r,a,'retry','재전송')]);
    expect(same.map(x=>x.status).sort()).toEqual([200,201]);
    const originals=await Promise.all(same.map(x=>x.json()));
    expect(originals[0]).toEqual(originals[1]);
    expect((await send(r,a,'retry','다른 내용')).status).toBe(409);
    expect((await send(r,a,'retry','재전송',1)).status).toBe(409);
    const page=await (await api(r.base+'/messages',r.read)).json() as any;
    expect(page.messages.map((x:any)=>x.sequence)).toEqual(Array.from({length:13},(_,i)=>i+1));
    expect(new Set(page.messages.map((x:any)=>x.sender.id)).size).toBe(2);
    expect((await send(r,a,'bad-reply','창작',999)).status).toBe(400);
    expect((await api(r.base+'/messages',a.participant_token,'POST',{text:'창작',client_message_id:'spoof',sender:b.sender.id})).status).toBe(400);
  });
  it('paginates beyond 100 messages and resumes the saved cursor across runtime eviction',async()=>{
    const r=await create(), p=await join(r);
    // Seed existing stored messages to avoid bypassing production rate caps by changing them.
    await runInDurableObject(stub(r),(_i,s)=>{
      for(let i=1;i<=105;i++) s.storage.sql.exec('INSERT INTO messages(sequence,sender_id,text,client_message_id,reply_to,created_at) VALUES(?,?,?,?,?,?)',i,p.sender.id,'창작',`seed-${i}`,null,new Date().toISOString());
    });
    const first=await (await api(r.base+'/messages',r.read)).json() as any;
    expect(first.messages).toHaveLength(100); expect(first.cursor).toBe(100); expect(first.has_more).toBe(true);
    await evictDurableObject(stub(r));
    const second=await (await api(r.base+'/wait?after=100',p.participant_token)).json() as any;
    expect(second.messages.map((m:any)=>m.sequence)).toEqual([101,102,103,104,105]); expect(second.cursor).toBe(105);
    expect((await api(r.base+'/messages?after=106',r.read)).status).toBe(400);
  });
  it('wait returns same cursor on timeout and wakes without missing a racing write',async()=>{
    const r=await create(), p=await join(r);
    const empty=await (await api(r.base+'/wait?after=0&timeout=0',r.read)).json() as any;
    expect(empty).toMatchObject({messages:[],cursor:0,has_more:false});
    const started=Date.now();
    const expired=await (await api(r.base+'/wait?timeout=1',r.read)).json() as any;
    expect(expired.cursor).toBe(0); expect(Date.now()-started).toBeGreaterThanOrEqual(900);
    const waiting=api(r.base+'/wait?timeout=2',r.read);
    await send(r,p,'wake');
    const woke=await (await waiting).json() as any;
    expect(woke.messages[0].text).toBe('wake'); expect(woke.cursor).toBe(1);
    const size=await runInDurableObject<DurableObject,number>(stub(r),(i:any):number=>i.waiters.size);
    expect(size).toBe(0);
  });
  it('cleans resolver and timer on abort and bounds waits by capability and room',async()=>{
    const r=await create();
    const cleanup=await runInDurableObject<DurableObject,{registered:number;remaining:number}>(stub(r),async(i:any)=>{
      const control=new AbortController();
      const request=new Request(origin+r.base+'/wait?timeout=25',{headers:{Authorization:`Bearer ${r.read}`},signal:control.signal});
      const waiting=i.fetch(request);
      // crypto hashing is async; wait until registration using the actual object.
      for(let n=0;i.waiters.size===0&&n<100;n++) await new Promise(resolve=>setTimeout(resolve,1));
      const registered=i.waiters.size;
      control.abort(); await waiting;
      return {registered, remaining:i.waiters.size};
    });
    expect(cleanup).toEqual({registered:1,remaining:0});
    const waits=Array.from({length:8},()=>api(r.base+'/wait?timeout=2',r.read));
    await new Promise(resolve=>setTimeout(resolve,50));
    const limit=await api(r.base+'/wait?timeout=2',r.read);
    expect(limit.status).toBe(429); expect(limit.headers.get('Retry-After')).toBe('60');
    await api(r.base+'/close',r.owner_token,'POST'); await Promise.all(waits);
    expect(await runInDurableObject<DurableObject,number>(stub(r),(i:any):number=>i.waiters.size)).toBe(0);
  });
  it('close wakes waits, preserves history, denies writes/join, then returns closed',async()=>{
    const r=await create(), p=await join(r); await send(r,p,'final');
    const waiting=api(r.base+'/wait?after=1&timeout=2',r.read);
    expect((await api(r.base+'/close',r.owner_token,'POST')).status).toBe(200);
    expect((await waiting).status).toBe(410);
    expect((await send(r,p,'later')).status).toBe(410);
    expect((await api(r.base+'/participants',r.invite,'POST',{nickname:'새 사람'})).status).toBe(410);
    const unread=await (await api(r.base+'/wait?after=0',r.read)).json() as any;
    expect(unread.messages).toHaveLength(1); expect(unread.room_status).toBe('closed');
    expect((await api(r.base+'/wait?after=1',r.read)).status).toBe(410);
    expect((await api(r.base+'/messages?after=1',r.read)).status).toBe(200);
  });
  it('delete clears every stored datum and alarm, wakes waiters and never recreates tables on GET',async()=>{
    const r=await create(),p=await join(r); await send(r,p,'gone');
    const waiting=api(r.base+'/wait?after=1&timeout=2',r.read);
    expect((await api(r.base,r.owner_token,'DELETE')).status).toBe(204);
    expect((await waiting).status).toBe(410);
    expect((await api(r.base,r.read)).status).toBe(410);
    expect((await counts(r)).tables).toEqual([]);
    expect(await runInDurableObject(stub(r),(_i,s)=>s.storage.getAlarm())).toBeNull();
    const missing={room:{id:crypto.randomUUID()}};
    expect((await api(`/api/rooms/${missing.room.id}`,r.read)).status).toBe(410);
    expect((await counts(missing)).tables).toEqual([]);
  });
  it('expires at request/wait return time and alarm performs physical deleteAll',async()=>{
    const r=await create();
    const waiting=api(r.base+'/wait?timeout=2',r.read);
    await runInDurableObject(stub(r),(_i,s)=>s.storage.sql.exec('UPDATE room SET expires_at=?',Date.now()+75));
    expect((await waiting).status).toBe(410);
    expect((await counts(r)).tables).toEqual([]);
    const alarmRoom=await create();
    await runInDurableObject(stub(alarmRoom),(_i,s)=>s.storage.sql.exec('UPDATE room SET expires_at=?',Date.now()-1));
    expect(await runDurableObjectAlarm(stub(alarmRoom))).toBe(true);
    expect((await counts(alarmRoom)).tables).toEqual([]);
    expect((await api(alarmRoom.base,alarmRoom.read)).status).toBe(410);
  });
  it('enforces input/query limits and applies security headers even on errors',async()=>{
    const r=await create(),p=await join(r);
    const approvedToken=await approvedAgent();
    for(const body of [{purpose:'x'.repeat(1001)},{purpose:'x',ttl_seconds:59},{purpose:'x',ttl_seconds:604801}]) expect((await api('/api/rooms',approvedToken,'POST',body)).status).toBe(400);
    for(const body of [{nickname:''},{nickname:'x'.repeat(65)}]) expect((await api(r.base+'/participants',r.invite,'POST',body)).status).toBe(400);
    expect((await send(r,p,'empty','')).status).toBe(400);
    expect((await send(r,p,'long','가'.repeat(5500))).status).toBe(413);
    expect((await send(r,p,'x'.repeat(129))).status).toBe(400);
    expect((await api(r.base+'/messages',p.participant_token,'POST',{text:'x'.repeat(33000),client_message_id:'huge'})).status).toBe(413);
    const malformed=await SELF.fetch(origin+r.base+'/messages',{method:'POST',headers:{Authorization:`Bearer ${p.participant_token}`,'Content-Type':'application/json'},body:'{'});
    expect(malformed.status).toBe(400);
    for(const q of ['after=-1','after=1.5','limit=101','limit=0','timeout=26','timeout=-1']) expect((await api(r.base+'/wait?'+q,r.read)).status).toBe(400);
    const response=await api('/no-such-path');
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
