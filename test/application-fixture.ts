import {env as workerEnv} from 'cloudflare:workers';
import {SELF,runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {beforeEach,afterEach,expect} from 'vitest';
import {CloudflareRepository} from '../src/storage/cloudflare';
import {C,save,type Tx} from '../src/control-records';
import {PRIVATE_NOTICE} from '../src/private-contracts';
import {PUBLIC_NOTICE} from '../src/public-contracts';
import type {CloudflareHostEnv} from '../src/cloudflare-host';
import {newToken,hash} from '../src/http';

const origin='http://localhost:8787';
const env=workerEnv as unknown as CloudflareHostEnv;
interface Raw {step:string;status:number;code?:string;retry_after:string|null;state?:Record<string,number|boolean|string|null>;}
const raw:Raw[]=[];const roomIds=new Set<string>();
const control=():DurableObjectStub=>env.CONTROL.getByName('control');
const privateRoom=(id:string):DurableObjectStub=>env.PRIVATE_ROOMS.getByName(id);
const records=<T>(fn:(tx:Tx)=>Promise<T>)=>runInDurableObject(control(),(_i,state)=>new CloudflareRepository(state.storage).transaction('control',fn));
const takeCookie=(r:Response,name:string)=>r.headers.getSetCookie().find(v=>v.startsWith(name+'='))?.split(';')[0]??'';
async function call(step:string,path:string,body?:unknown,headers:Record<string,string>={},method=body===undefined?'GET':'POST'){
 const original=await SELF.fetch(origin+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 // Fully consume the actor-backed response before assertions can leave active stream references.
 // This fixes fixture response ownership only. Product unused request bodies are B's separate early-denial gate.
 const bytes=await original.arrayBuffer(),text=new TextDecoder().decode(bytes);
 const code=original.headers.get('Content-Type')?.includes('application/json')?(JSON.parse(text) as {error?:{code?:string}}).error?.code:/<body\b[^>]*data-error="([A-Z0-9_]+)"/.exec(text)?.[1];
 raw.push({step,status:original.status,code,retry_after:original.headers.get('Retry-After')});
 return new Response([204,304].includes(original.status)?null:bytes,original);
}
async function parsed<T>(r:Response,status=200):Promise<T>{expect(r.status,'HTTP status; secret body intentionally omitted').toBe(status);return r.json() as Promise<T>;}
const bearer=(token:string)=>({Authorization:'Bearer '+token});
interface Room {service:object;room:{id:string;status:string};invite_url:string;read_url:string;owner_token:string;}
interface OwnedRoom extends Room {base:string;invite:string;read:string;}
function asRoom(r:Room):OwnedRoom {roomIds.add(r.room.id);return {...r,base:'/api/v1/rooms/'+r.room.id,invite:new URL(r.invite_url).pathname.split('/').at(-1)!,read:new URL(r.read_url).pathname.split('/').at(-1)!};}
interface Participant {participant_token:string;sender:{id:string;nickname:string};}
interface Message {sequence:number;cursor:string;text:string;sender:{id:string};}
interface Page {messages:Message[];cursor:string;epoch:string;has_more:boolean;has_older:boolean;before_cursor:string;room_status:string;history_status:string;}
interface Session {authenticated:boolean;role:string;csrf_token:string;}
async function anonymousGrant(){
 const context=await call('anonymous context','/api/private/create-context',{}, {Origin:origin});
 const c=await parsed<{nonce:string}>(context);const cookie=takeCookie(context,'__Host-toktok_create');
 const result=await parsed<{creation_grant:string}>(await call('anonymous acknowledgement','/api/private/create-grants',{nonce:c.nonce,risk_ack:true,risk_ack_version:PRIVATE_NOTICE},{Origin:origin,Cookie:cookie}));
 return result.creation_grant;
}
async function create(grant?:string){
 return asRoom(await parsed<Room>(await call('anonymous create','/api/v1/rooms',{purpose:'창작 방 <script>비신뢰</script>',creation_grant:grant??await anonymousGrant(),client_request_id:crypto.randomUUID()}),201));
}
async function join(r:OwnedRoom,name:string){return parsed<Participant>(await call('private join',''+r.base+'/participants',{nickname:name,client_request_id:crypto.randomUUID(),notice_version:PRIVATE_NOTICE,visibility:'private',retention_mode:'recent_buffer'},bearer(r.invite)),201);}
const send=(r:OwnedRoom,p:Participant,id:string,text=id)=>call('private send',r.base+'/messages',{text,client_message_id:id},bearer(p.participant_token));
const waitCadence=()=>new Promise(resolve=>setTimeout(resolve,2050));
async function readPage(r:OwnedRoom,token:string,query=''){return parsed<Page>(await call('private read',r.base+'/messages'+query,undefined,bearer(token)));}
async function loginStart(purpose='login',headers:Record<string,string>={},extra:Record<string,string>={}){
 const r=await call('auth bootstrap','/api/auth/start',{purpose,...extra},{Origin:origin,...headers});
 return {...await parsed<{flow:string;nonce:string}>(r),cookie:takeCookie(r,'__Host-toktok-flow')};
}
async function sendCode(f:{flow:string;cookie:string},email:string){
 await parsed(await call('email request','/api/auth/email/send',{flow_id:f.flow,email,client_request_id:crypto.randomUUID()},{Origin:origin,Cookie:f.cookie}));
 const result=await parsed<{code?:string}>(await SELF.fetch(origin+'/__application/code?email='+encodeURIComponent(email)));
 expect(typeof result.code==='string','fake sender has code; value never dumped').toBe(true);return result.code!;
}
async function complete(f:{flow:string;nonce:string;cookie:string},otp:string){
 const r=await call('OTP complete','/api/auth/complete',{flow:f.flow,nonce:f.nonce,otp},{Origin:origin,Cookie:f.cookie});await parsed(r);
 const cookie=takeCookie(r,'__Host-toktok_session');const session=await parsed<Session>(await call('session','/api/session',undefined,{Cookie:cookie}));return {cookie,session,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':session.csrf_token}};
}
function installApplicationFixture(){
beforeEach(async()=>{
 raw.length=0;
 await runInDurableObject(control(),async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();await new CloudflareRepository(state.storage).apply();});
 await evictDurableObject(control());
 for(const slug of ['common-room','workshop']){const room=env.PUBLIC_ROOMS.getByName(slug);await runInDurableObject(room,async(_i,state)=>{await state.storage.deleteAlarm();await state.storage.deleteAll();});await evictDurableObject(room);}
 await (await SELF.fetch(origin+'/__application/reset')).arrayBuffer();
});
afterEach(async()=>{
 // Raw evidence precedes assertions and excludes paths with capabilities, email, body and cookies.
 console.log('APPLICATION_HTTP_EVIDENCE '+JSON.stringify(raw));
 for(const id of roomIds){await runInDurableObject<DurableObject,void>(privateRoom(id),i=>{(i as DurableObject&{shutdown():void}).shutdown();});await evictDurableObject(privateRoom(id));}
 roomIds.clear();
});
}
export {origin,env,raw,roomIds,control,privateRoom,records,takeCookie,call,parsed,bearer,asRoom,anonymousGrant,create,join,send,waitCadence,readPage,loginStart,sendCode,complete,installApplicationFixture};
export type {Raw,Room,OwnedRoom,Participant,Message,Page,Session};
