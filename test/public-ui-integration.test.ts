import {SELF,runInDurableObject} from 'cloudflare:test';
import {env as workerEnv} from 'cloudflare:workers';
import type {PublicRoom} from '../src/cloudflare-host';
const env=workerEnv as unknown as {PUBLIC_ROOMS:DurableObjectNamespace<PublicRoom>};
import {it,expect} from 'vitest';
const origin='http://localhost:8787',base='/api/public/rooms/common-room';
const req=(path:string,method='GET',data?:unknown,headers:Record<string,string>={})=>SELF.fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
it('serves real assets/guide/catalog and GET never allocates a lease or grant',async()=>{
 for(const path of ['/public/common-room','/public/common-room?format=md','/api/public/rooms']){const r=await req(path);expect(r.status).toBe(200);await r.arrayBuffer();}
 const before=await env.PUBLIC_ROOMS.getByName('common-room').diagnostics();expect(before.leases.participants).toBe(0);expect(before.leases.watchers).toBe(0);expect(before.pending_grants).toBe(0);
 const missing=await req('/api/public/rooms/common-room/no-route');expect(missing.status).toBe(404);expect(missing.headers.get('Content-Type')).toContain('application/json');await missing.arrayBuffer();
});
it('validates browser acknowledgement then RPC grant creates a real participant visible to watcher',async()=>{
 const flowResponse=await req(base+'/ack-flow','POST',{}, {'x-fixture-ip':'192.0.2.20'});expect(flowResponse.status).toBe(201);const cookie=flowResponse.headers.get('Set-Cookie')!;const flow=await flowResponse.json() as any;
 const issued=await req(base+'/operator-grants','POST',{nonce:flow.nonce,checked:true,risk_ack_version:flow.notice_version},{Cookie:cookie,'x-fixture-ip':'192.0.2.20'});expect(issued.status).toBe(201);const grant=await issued.json() as any;
 const joined=await req(base+'/participants','POST',{operator_grant:grant.operator_grant,client_request_id:'local-client',nickname:'로컬 에이전트',notice_version:flow.notice_version,visibility:'public',retention_mode:'memory'},{'x-fixture-ip':'192.0.2.20'});expect(joined.status).toBe(201);const participant=await joined.json() as any;
 const watcher=await (await req(base+'/watchers','POST',{notice_version:flow.notice_version},{'x-fixture-ip':'192.0.2.21'})).json() as any;
 const sent=await req(base+'/messages','POST',{text:'독립 HTTP 메시지',client_message_id:'one'},{Authorization:'Bearer '+participant.lease_token,'x-fixture-ip':'192.0.2.20'});expect(sent.status).toBe(201);await sent.arrayBuffer();
 const read=await req(base+'/messages?limit=20','GET',undefined,{Authorization:'Bearer '+watcher.lease_token,'x-fixture-ip':'192.0.2.21'});expect(read.status).toBe(200);const page=await read.json() as any;expect(page.messages[0].text).toBe('독립 HTTP 메시지');expect(page.cursor).toBe(page.messages[0].cursor);
 for(const token of [participant.lease_token,watcher.lease_token]){const r=await req(base+'/lease','DELETE',undefined,{Authorization:'Bearer '+token});expect(r.status).toBe(204);await r.arrayBuffer();}
 expect(await runInDurableObject(env.PUBLIC_ROOMS.getByName('common-room'),(_i,state)=>state.storage.list().then(rows=>rows.size))).toBe(0);
});
