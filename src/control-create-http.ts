import {body,bearer,hash,newToken,json,secure,bad,limited} from './http';
import {requireOrigin,sessionInput,registry} from './identity-http';
import {trustedIP,normalizeIP,type IdentityOptions} from './email';
import type {IdentityEnv,RegistryInput} from './identity-types';
import type {PrivateRoomInit} from './private-contracts';
import type {CreationBody} from './create-admission';
const name='__Host-toktok_create';
const cookie=(r:Request)=>r.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const session=async(r:Request,e:IdentityEnv)=>r.headers.get('Cookie')?.split(';').some(x=>x.trim().startsWith('__Host-toktok_session='))?sessionInput(r,e,true):{};
const ip=(r:Request,o:IdentityOptions)=>normalizeIP((o.trustedIP??trustedIP)(r));
const cookies=(token:string)=>`${name}=${token}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`;
/** Only confirmation endpoints. Root owns POST /api/v1/rooms and actual initialize/commitSlot dispatch. */
export async function privateCreateRoute(request:Request,env:IdentityEnv,options:IdentityOptions):Promise<Response|undefined>{
 const path=new URL(request.url).pathname;if(request.method!=='POST'||!['/api/private/create-context','/api/private/create-grants'].includes(path))return;
 requireOrigin(request,env);const rawIp=ip(request,options);if(!(await env.IP_RATE_LIMIT.limit({key:rawIp})).success)limited();
 const caller={...await session(request,env),ip:rawIp,now:options.now?.()??Date.now()};
 if(path==='/api/private/create-context'){
  await body(request,[]);const browser=cookie(request)??newToken(),nonce=newToken();const data=await registry<{expires_at:number;notice_version:string;authenticated:boolean;can_persist_private:boolean}>(env,'create-context',{...caller,creation_context:{context_hash:await hash(browser),nonce_hash:await hash(nonce)}});
  const response=json({...data,nonce,expires_at:new Date(data.expires_at).toISOString()});response.headers.set('Set-Cookie',cookies(browser));return secure(response);
 }
 const b=await body(request,['nonce','risk_ack','risk_ack_version']),browser=cookie(request);if(!browser||typeof b.nonce!=='string'||!/^[\w-]{43}$/.test(b.nonce))bad();const grant=newToken();
 const data=await registry<{expires_at:number;notice_version:string}>(env,'create-grant',{...caller,creation_grant:{context_hash:await hash(browser),nonce_hash:await hash(b.nonce),grant_hash:await hash(grant),risk_ack:b.risk_ack===true,risk_ack_version:String(b.risk_ack_version)}});
 return secure(json({creation_grant:grant,expires_at:new Date(data.expires_at).toISOString(),notice_version:data.notice_version}));
}
export interface CreationHashes {invite_hash:string;read_hash:string;owner_hash:string;}
export interface CreationReservation {room_id:string;snapshot:PrivateRoomInit;state:'pending';}
/** Tokens are minted by the root host for the first result, hashes only reach control storage. */
export async function reserveCreation(request:Request,env:IdentityEnv,options:IdentityOptions,hashes:CreationHashes):Promise<CreationReservation>{
 if(request.headers.has('Origin'))requireOrigin(request,env);const b=await body(request,['purpose','ttl_seconds','persist','retention_seconds','client_request_id','creation_grant']);
 const grant=b.creation_grant;if(grant!==undefined&&(typeof grant!=='string'||!/^[\w-]{43}$/.test(grant)))bad();
 const input:RegistryInput={...await session(request,env),ip:ip(request,options),now:options.now?.()??Date.now(),creation:{body:{purpose:b.purpose,ttl_seconds:b.ttl_seconds,persist:b.persist,retention_seconds:b.retention_seconds,client_request_id:b.client_request_id} as CreationBody,grant_hash:grant?await hash(String(grant)):undefined,...hashes}};
 if(request.headers.has('Authorization'))input.token_hash=await hash(bearer(request));return registry<CreationReservation>(env,'create-reserve',input);
}
/** Trusted host calls after actual room status is confirmed. Not a public lifecycle API. */
export function commitSlot(env:IdentityEnv,room_id:string,proof:'initialized'|'closed'|'uninitialized',now=Date.now()){return registry(env,'create-commit',{creation_commit:{room_id,proof},now});}
