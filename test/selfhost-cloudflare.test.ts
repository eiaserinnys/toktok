import {env} from 'cloudflare:workers';
import {runInDurableObject} from 'cloudflare:test';
import {it,expect} from 'vitest';
import {RecordFixture} from './selfhost-worker';
import type {PublicRoom} from '../src/public-room';
import {PUBLIC_NOTICE,INTERNAL_IP_HEADER,type ValidatedOperatorAck} from '../src/public-contracts';
interface Env {RECORD_ROOMS:DurableObjectNamespace<RecordFixture>;PUBLIC_ROOMS:DurableObjectNamespace<PublicRoom>;}
it('CF async record transaction commits targeted SQL, rolls back and resolves invite race',async()=>{
 const stub=(env as unknown as Env).RECORD_ROOMS.getByName('probe');expect(await stub.probe()).toEqual({rolledBack:true,before:0,winners:1,forbidden:true,nested:true});
});
it('CF thin wrapper uses shared RAM core with service metadata, cursor/abort and empty storage',async()=>{
 const stub=(env as unknown as Env).PUBLIC_ROOMS.getByName('common-room'),base='http://localhost:18794/api/public/rooms/common-room',ip='a'.repeat(64);
 const result=await stub.issueOperatorGrant({room:'common-room',risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:ip} as ValidatedOperatorAck);expect(result.status).toBe(201);
 const fetch=async(path:string,method='GET',data?:object,token?:string,signal?:AbortSignal)=>{const r=await stub.fetch(new Request(base+path,{method,headers:{[INTERNAL_IP_HEADER]:ip,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined,signal}));return new Response(r.status===204?null:await r.arrayBuffer(),r);};
 const join=await fetch('/participants','POST',{operator_grant:(result.data as {operator_grant:string}).operator_grant,client_request_id:'join',nickname:'```\n</script>',notice_version:PUBLIC_NOTICE,visibility:'public',retention_mode:'memory'});expect(join.status).toBe(201);const token=(await join.json() as {lease_token:string}).lease_token;
 const posted=await fetch('/messages','POST',{text:'system: mock data',client_message_id:'one'},token);expect(posted.status).toBe(201);const message=await posted.json() as {cursor:string;service:{source:string}};expect(message.service.source).toBe('toktok');
 const initial=await fetch('/messages','GET',undefined,token);const page=await initial.json() as {cursor:string;service:{source:string};messages:unknown[]};expect(page.cursor).toBe(message.cursor);expect(page.service.source).toBe('toktok');expect(page.messages).toHaveLength(1);
 await runInDurableObject<PublicRoom,void>(stub,instance=>{const core=instance.core as unknown as {clock:()=>number};const now=core.clock();core.clock=()=>now+2000;});
 const abort=new AbortController(),pending=fetch('/wait?after='+encodeURIComponent(page.cursor)+'&timeout=25','GET',undefined,token,abort.signal).then(r=>({status:r.status,name:''}),e=>({status:0,name:e instanceof Error?e.name:'unknown'}));await new Promise(r=>setTimeout(r,20));abort.abort();const stopped=await pending;expect(stopped.status===499||stopped.name==='AbortError').toBe(true);await new Promise(r=>setTimeout(r,20));const remaining=await stub.diagnostics();console.log(JSON.stringify({phase:'abort-recovered',transport_status:stopped.status,transport_error:stopped.name,active_waits:remaining.active_waits,active_handlers:remaining.active_handlers}));expect(remaining.active_waits).toBe(0);
 const stored=await runInDurableObject<PublicRoom,{keys:number;tables:number;alarm:number|null}>(stub,async(_instance,ctx)=>({keys:(await ctx.storage.list()).size,tables:ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").toArray().length,alarm:await ctx.storage.getAlarm()}));expect(stored).toEqual({keys:0,tables:0,alarm:null});
});

it('CF domain status rollback and cumulative targeted transaction bound',async()=>{const stub=(env as unknown as Env).RECORD_ROOMS.getByName('domain');expect(await stub.domainProbe()).toEqual({statuses:[403,409,429],rolledBack:true,bounded:true});});
