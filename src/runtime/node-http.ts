import {createServer as httpServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import {hash,json,secure} from '../http';
import {INTERNAL_IP_HEADER} from '../public-contracts';
import type {RepositoryPort} from '../storage/repository';
import {TrustedProxyPolicy} from './trusted-ip';
import {bindTrustedAddress} from '../request-context';
export interface NodeServerOptions {origin:string;handler:(request:Request)=>Promise<Response>;repo:RepositoryPort;close:()=>void|Promise<void>;trustedProxyCidrs?:readonly string[];readiness?:()=>Promise<boolean>;}
export function createServer(options:NodeServerOptions){
  const proxies=new TrustedProxyPolicy(options.trustedProxyCidrs);let stopping=false;
  const server=httpServer((incoming,outgoing)=>{void handle(incoming,outgoing);});server.headersTimeout=10000;server.requestTimeout=30000;
  async function handle(incoming:IncomingMessage,outgoing:ServerResponse){
    const abort=new AbortController(),onClose=()=>{if(!outgoing.writableFinished)abort.abort();};incoming.once('aborted',()=>abort.abort());outgoing.once('close',onClose);
    let response:Response|undefined;
    try{
      const url=new URL(incoming.url??'/',options.origin);const live=url.pathname==='/health',ready=url.pathname==='/ready';
      if((live||ready)&&incoming.method==='GET'){const available=live||(!stopping&&options.repo.ready()&&(!options.readiness||await options.readiness()));response=secure(json({status:live?'alive':available?'ready':'unavailable'},available?200:503));}
      else if(stopping||!options.repo.ready())response=secure(json({error:{code:'SERVICE_UNAVAILABLE',message:'서비스가 준비되지 않았습니다.'}},503));
      else {
        const headers=new Headers();for(const [name,value] of Object.entries(incoming.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
        headers.delete(INTERNAL_IP_HEADER);headers.delete('CF-Connecting-IP');
        const ip=proxies.resolve(incoming.socket.remoteAddress??'',incoming.headers['x-forwarded-for'] as string|undefined);headers.set(INTERNAL_IP_HEADER,await hash(ip));
        const method=incoming.method??'GET',init:RequestInit&{duplex?:'half'}={method,headers,signal:abort.signal};
        if(method!=='GET'&&method!=='HEAD'){init.body=Readable.toWeb(incoming) as ReadableStream<Uint8Array>;init.duplex='half';}
        response=await options.handler(bindTrustedAddress(new Request(url,init),ip));
        if(!options.repo.ready()){await response.body?.cancel();response=secure(json({error:{code:'SERVICE_UNAVAILABLE',message:'서비스가 준비되지 않았습니다.'}},503));}
      }
      if(abort.signal.aborted){await response.body?.cancel();return;}
      const headers=Object.fromEntries([...response.headers].filter(([key])=>key.toLowerCase()!=='set-cookie'));const cookies=response.headers.getSetCookie();if(cookies.length)outgoing.setHeader('set-cookie',cookies);outgoing.writeHead(response.status,headers);
      if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;if(abort.signal.aborted){await reader.cancel();break;}if(!outgoing.write(value))await Promise.race([once(outgoing,'drain'),once(outgoing,'close')]);}}finally{reader.releaseLock();}}
      outgoing.end();
    }catch{if(!outgoing.destroyed&&!outgoing.headersSent){outgoing.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end(JSON.stringify({error:{code:'INTERNAL_ERROR',message:'요청을 처리하지 못했습니다.'}}));}else outgoing.destroy();}
    finally{outgoing.removeListener('close',onClose);if(abort.signal.aborted)incoming.destroy();}
  }
  async function stop(){if(stopping)return;stopping=true;await options.close();const done=new Promise<void>(resolve=>server.close(()=>resolve()));server.closeIdleConnections();const timer=setTimeout(()=>server.closeAllConnections(),24000);try{await done;await options.repo.close();}finally{clearTimeout(timer);}}
  return {server,stop};
}
