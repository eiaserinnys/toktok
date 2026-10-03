import {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer as probeServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
import {createApplication} from '../src/selfhost/application';
import {DEFAULT_SETTINGS,type Settings} from '../src/settings-schema';
import {demoInstallationProfile} from '../src/installation-profile';
import {RecordCollection as C} from '../src/storage/repository';
import {PRIVATE_NOTICE} from '../src/private-contracts';
import {hash,newToken} from '../src/http';

type HeadersInput=Record<string,string>;
interface ErrorData {error?:{code?:string};}
interface Reply<T>{status:number;data:T;headers:Headers;}
export interface Room {room:{id:string;status:string;mode:string;retention_mode:string;notice_version:string;expires_at:string|null;lifetime?:string;created_at:string};owner_token:string;invite_url:string;read_url:string;}
export interface Owned extends Room {base:string;invite:string;read:string;}
export interface Participant {participant_token:string;sender:{id:string;nickname:string};}
export interface Message {sequence:number;cursor:string;text:string;sender:{id:string};}
export interface Page {messages:Message[];cursor:string;epoch:string;has_more:boolean;room_status:string;history_status:string;}
export const status=<T>(r:Reply<T>,expected:number,label:string)=>assert.equal(r.status,expected,label+' (response body deliberately omitted)');
const cookie=(r:Reply<unknown>,name:string)=>r.headers.getSetCookie().find(v=>v.startsWith(name+'='))?.split(';')[0]??'';
export async function fixture(t:TestContext,profile=demoInstallationProfile()){
 const dir=mkdtempSync(join(tmpdir(),'toktok-private-verification-')),file=join(dir,'db.sqlite');applySQLite(file);
 const probe=probeServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert(address&&typeof address==='object');const port=address.port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const origin='http://localhost:'+port;let now=Date.now(),repo=new SQLiteRepository(file),app:ReturnType<typeof createApplication>|undefined;
 const raw:{step:string;status:number;code?:string}[]=[];
 const start=async()=>{app=createApplication({origin,repo,profile,assets:process.cwd()+'/public',auth:{now:()=>now}});await app.prepare();app.server.listen(port,'127.0.0.1');await once(app.server,'listening');};
 await start();t.after(async()=>{if(app)await app.stop();else await repo.close();rmSync(dir,{recursive:true,force:true});console.log('PRIVATE_HTTP_EVIDENCE '+JSON.stringify({case:t.name,clock:'DI; no actual five-minute idle elapsed',raw,cleanup:true}));});
 async function call<T=ErrorData>(step:string,path:string,method='GET',body?:unknown,token?:string,headers:HeadersInput={}):Promise<Reply<T>>{
  // Each request owns a fresh socket so a deliberate same-port server restart cannot reuse undici's retired pool entry.
  const r=await fetch(origin+path,{method,headers:{Accept:'application/json',Connection:'close',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text(),data=text?JSON.parse(text):null;raw.push({step,status:r.status,...(data?.error?.code?{code:String(data.error.code)}:{})});return {status:r.status,data:data as T,headers:r.headers};
 }
 async function session(options:{kind?:'invited'|'hosted';create?:boolean;persist?:boolean;verified?:boolean}={}){
  const id=randomUUID(),token=newToken(),csrf=newToken();await repo.transaction('control',async tx=>{await tx.put(C.accounts,'a:'+id,{id,provider:'email-otp',subject:'fictional@fixture.example',email:'fictional@fixture.example',email_verified:options.verified===false?0:1,role:'member',admission_kind:options.kind??'invited',can_create_private:options.create===false?0:1,can_persist_private:options.persist===false?0:1});await tx.put(C.sessions,await hash(token),{owner_id:id,csrf,expires_at:now+86400000});});return {Origin:origin,Cookie:'__Host-toktok_session='+token,'X-CSRF-Token':csrf};
 }
 async function grant(headers:HeadersInput={}){
  const context=await call<{nonce:string;notice_version:string;can_persist_private:boolean}>('creation context','/api/private/create-context','POST',{},undefined,{Origin:origin,...headers});status(context,200,'context');
  const bound={Origin:origin,...headers,Cookie:[headers.Cookie,cookie(context,'__Host-toktok_create')].filter(Boolean).join('; ')};
  const approved=await call<{creation_grant:string}>('explicit local creation acknowledgement','/api/private/create-grants','POST',{nonce:context.data.nonce,risk_ack:true,risk_ack_version:context.data.notice_version},undefined,bound);status(approved,200,'grant');return {value:approved.data.creation_grant,headers:bound,canPersist:context.data.can_persist_private};
 }
 async function create(g:Awaited<ReturnType<typeof grant>>,body:Record<string,unknown>={}){
  const input={purpose:'가상 비공개 검증',client_request_id:randomUUID(),creation_grant:g.value,...body};
  const r=await call<Room>('private create','/api/v1/rooms','POST',input,undefined,g.headers);status(r,201,'create');const owned:Owned={...r.data,base:'/api/v1/rooms/'+r.data.room.id,invite:new URL(r.data.invite_url).pathname.split('/').at(-1)!,read:new URL(r.data.read_url).pathname.split('/').at(-1)!};return {owned,input};
 }
 const joinInput=(room:Owned,id:string=randomUUID())=>({nickname:'가상 참여자',client_request_id:id,notice_version:room.room.notice_version,visibility:'private',retention_mode:room.room.retention_mode});
 async function participate(room:Owned,id:string=randomUUID()){const input=joinInput(room,id),r=await call<Participant>('private participant',''+room.base+'/participants','POST',input,room.invite);status(r,201,'join');return {participant:r.data,input};}
 async function restart(){await app!.stop();app=undefined;repo=new SQLiteRepository(file);await start();}
 return {call,grant,create,participate,joinInput,session,restart,origin,advance:(ms:number)=>{now+=ms;},get now(){return now;},get repo(){return repo;},get app(){return app!;}};
}

