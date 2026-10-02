import {approvedAgent} from './agent-fixture';
import { env } from 'cloudflare:workers';
import { SELF, runInDurableObject } from 'cloudflare:test';
import { it, expect } from 'vitest';
const origin='http://localhost:8787';
const get=(path:string,accept='text/html')=>SELF.fetch(origin+path,{headers:{Accept:accept}});
async function room(){
 const r=await SELF.fetch(origin+'/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+await approvedAgent(),'Content-Type':'application/json'},body:JSON.stringify({purpose:'창작 방 <script>안전</script>',ttl_seconds:60})});
 return await r.json() as {room:{id:string};invite_url:string;read_url:string;owner_token:string};
}
it('serves local Common room assets and introduction with unchanged security policy',async()=>{
 for(const path of ['/','/guide','/styles.css','/app.js','/favicon.svg']){
  const r=await get(path);expect(r.status).toBe(200);
  expect(r.headers.get('Cache-Control')).toBe('no-store');
  expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(r.headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 }
 const html=await (await get('/')).text();expect(html).toContain('/app.js');expect(html).not.toContain('data:image');
 expect((await get('/api/no-room')).headers.get('Content-Type')).toContain('application/json');
});
it('negotiates HTML/Markdown/JSON without joining or exposing owner capability',async()=>{
 const r=await room();
 for(const link of [r.invite_url,r.read_url]){
  const path=new URL(link).pathname;
  const html=await get(path);expect(html.status).toBe(200);expect(html.headers.get('Content-Type')).toContain('text/html');
  expect(await html.text()).not.toContain(r.owner_token);
  for(const [suffix,accept] of [['','text/markdown'],['?format=md','text/html']]){
   const md=await get(path+suffix,accept);expect(md.headers.get('Content-Type')).toContain('text/markdown');expect(await md.text()).toContain('/wait?after=');
  }
 }
 const stub=env.ROOMS.get(env.ROOMS.idFromName(r.room.id));
 expect(await runInDurableObject(stub,(_i,s)=>s.storage.sql.exec('SELECT COUNT(*) AS n FROM participants').one().n)).toBe(0);
 const api=await SELF.fetch(origin+'/api/rooms/'+r.room.id,{headers:{Authorization:'Bearer '+new URL(r.read_url).pathname.split('/').at(-1),Accept:'text/html'}});
 expect(api.headers.get('Content-Type')).toContain('application/json');
 const denied=await get('/r/'+r.room.id+'/'+r.owner_token);expect(denied.status).toBe(403);expect(denied.headers.get('Content-Type')).toContain('text/html');
});
it('preserves invalid/gone status for HTML and JSON, with no missing-room tables',async()=>{
 const r=await room();
 const bad='/r/'+r.room.id+'/'+'x'.repeat(43);
 expect((await get(bad)).status).toBe(403);expect((await get(bad,'text/markdown')).headers.get('Content-Type')).toContain('application/json');
 await SELF.fetch(origin+'/api/rooms/'+r.room.id,{method:'DELETE',headers:{Authorization:'Bearer '+r.owner_token}});
 const gone=await get(new URL(r.read_url).pathname);expect(gone.status).toBe(410);expect(gone.headers.get('Content-Type')).toContain('text/html');
 const missing=crypto.randomUUID();expect((await get('/r/'+missing+'/'+'x'.repeat(43))).status).toBe(410);
 expect(await runInDurableObject(env.ROOMS.get(env.ROOMS.idFromName(missing)),(_i,s)=>s.storage.sql.exec("SELECT name FROM sqlite_master WHERE name='room'").toArray().length)).toBe(0);
});
