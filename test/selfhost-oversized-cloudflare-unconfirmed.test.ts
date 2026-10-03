import {env} from 'cloudflare:workers';
import {it,expect} from 'vitest';
import type {PrivateRoom} from './selfhost-worker';
import {privateSnapshot} from './selfhost-private-fixture';
interface Env {PRIVATE_ROOMS:DurableObjectNamespace<PrivateRoom>;}

it('CF oversized private streaming body settles cancellation and releases parse slots',async()=>{
 const id='cf-oversized-settle',stub=(env as unknown as Env).PRIVATE_ROOMS.getByName(id),{snapshot,tokens}=await privateSnapshot(id,false);await stub.initialize(snapshot);
 const joined=await stub.fetch(new Request('http://localhost:18794/api/v1/rooms/'+id+'/participants',{method:'POST',headers:{Authorization:'Bearer '+tokens.invite,'Content-Type':'application/json'},body:JSON.stringify({nickname:'mock',client_request_id:'join',notice_version:snapshot.notice_version,visibility:'private',retention_mode:'recent_buffer'})}));expect(joined.status).toBe(201);const {participant_token}=await joined.json() as {participant_token:string};
 let cancelled=false;const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(65537));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
 const begin=Date.now(),response=await stub.fetch(new Request('http://localhost:18794/api/v1/rooms/'+id+'/messages',{method:'POST',headers:{Authorization:'Bearer '+participant_token,'Content-Type':'application/json'},body:stream})),data=await response.json() as {error:{code:string}};
 const observedAt=Date.now();for(let n=0;n<100&&!cancelled;n++)await new Promise(resolve=>setTimeout(resolve,10));
 const diagnostic=await stub.diagnostics();console.log(JSON.stringify({phase:'cf-oversized-stream',status:response.status,error_code:data.error.code,cancelled,cancel_observation_ms:Date.now()-observedAt,body_used:response.headers.get('x-fixture-body-used')==='true',body_locked:response.headers.get('x-fixture-body-locked')==='true',handlers:diagnostic.active_handlers,body_inflight:diagnostic.body_inflight,duration_ms:Date.now()-begin}));
 expect(response.status).toBe(413);expect(data.error.code).toBe('BODY_TOO_LARGE');expect(cancelled).toBe(true);expect(response.headers.get('x-fixture-body-locked')).toBe('false');expect(diagnostic.active_handlers).toBe(0);expect(diagnostic.body_inflight).toBe(0);
});
