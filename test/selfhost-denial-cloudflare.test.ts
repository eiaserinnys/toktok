import {env} from 'cloudflare:workers';
import {it,expect} from 'vitest';
import type {PrivateRoom,PublicRoom} from './selfhost-worker';
import {privateSnapshot} from './selfhost-private-fixture';
import {PUBLIC_NOTICE,INTERNAL_IP_HEADER} from '../src/public-contracts';
interface Env{PRIVATE_ROOMS:DurableObjectNamespace<PrivateRoom>;PUBLIC_ROOMS:DurableObjectNamespace<PublicRoom>;}
it('CF early role denial cancels six unused request bodies and releases core slots',async()=>{
 const bindings=env as unknown as Env,id='cf-body-denial',privateStub=bindings.PRIVATE_ROOMS.getByName(id),{snapshot,tokens}=await privateSnapshot(id,false);await privateStub.initialize(snapshot);
 const req=(room:string,path:string,token:string,data:object)=>new Request('http://localhost:18794/api/v1/rooms/'+room+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
 const joined=await privateStub.fetch(req(id,'/participants',tokens.invite,{nickname:'mock',client_request_id:'join',notice_version:snapshot.notice_version,visibility:'private',retention_mode:'recent_buffer'}));expect(joined.status).toBe(201);const {participant_token}=await joined.json() as {participant_token:string};
 const cases:[string,string][]=[['/participants',tokens.read],['/messages',tokens.read],['/messages',tokens.invite],['/close',participant_token],['/close',tokens.read]],observed:{status:number;body_used:boolean;body_locked:boolean}[]=[];
 for(const [path,token] of cases){const response=await privateStub.fetch(req(id,path,token,{mock:'denied before parse'}));await response.arrayBuffer();observed.push({status:response.status,body_used:response.headers.get('x-fixture-body-used')==='true',body_locked:response.headers.get('x-fixture-body-locked')==='true'});}
 const publicStub=bindings.PUBLIC_ROOMS.getByName('common-room'),publicReq=(path:string,data:object,token?:string)=>new Request('http://localhost:18794/api/public/rooms/common-room'+path,{method:'POST',headers:{[INTERNAL_IP_HEADER]:'a'.repeat(64),'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 const watcher=await publicStub.fetch(publicReq('/watchers',{notice_version:PUBLIC_NOTICE}));expect(watcher.status).toBe(201);const {lease_token}=await watcher.json() as {lease_token:string};const denied=await publicStub.fetch(publicReq('/messages',{text:'mock',client_message_id:'denied'},lease_token));await denied.arrayBuffer();observed.push({status:denied.status,body_used:denied.headers.get('x-fixture-body-used')==='true',body_locked:denied.headers.get('x-fixture-body-locked')==='true'});
 console.log(JSON.stringify({phase:'native-role-denial',observed}));expect(observed).toHaveLength(6);for(const value of observed)expect(value).toEqual({status:403,body_used:true,body_locked:false});
 const priv=await privateStub.diagnostics(),pub=await publicStub.diagnostics();expect(priv.active_handlers).toBe(0);expect(priv.body_inflight).toBe(0);expect(pub.active_handlers).toBe(0);console.log(JSON.stringify({phase:'denial-cleanup',private_handlers:priv.active_handlers,private_body_inflight:priv.body_inflight,public_handlers:pub.active_handlers}));
});
