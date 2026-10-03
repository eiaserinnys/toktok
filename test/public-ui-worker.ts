import worker from '../src/index';
import {handlePublicBrowser} from '../src/public-browser';
import type {Env} from '../src/contracts';
import {json,hash,newToken} from '../src/http';
export {Room,PublicRoom} from '../src/index';
// Local transport DI only: never a production flag, header or runtime fallback.
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const path=new URL(request.url).pathname;
 if(path==='/__fixture/private-view'&&request.method==='POST'){
  const id=crypto.randomUUID(),invite=newToken(),read=newToken(),owner=newToken();
  await env.ROOMS.getByName(id).initialize({id,purpose:'비공개 관전 불변 확인',creator_id:'fixture',ttl_seconds:3600,invite_hash:await hash(invite),read_hash:await hash(read),owner_hash:await hash(owner)});
  return json({read_url:new URL('/r/'+id+'/'+read,request.url).href});
 }
 return await handlePublicBrowser(request,env,{trustedIP:()=>request.headers.get('x-fixture-ip')??'192.0.2.1'})??worker.fetch(request,env);
}} satisfies ExportedHandler<Env>;
