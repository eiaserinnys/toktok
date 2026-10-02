import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createServer} from '../src/runtime/node-http';
import type {RepositoryPort} from '../src/storage/repository';
test('Node bridge preserves two Set-Cookie headers and route-specific CSP unchanged',async()=>{
 const repo:RepositoryPort={ready:()=>true,close:async()=>{},transaction:async()=>{throw new Error('UNEXPECTED_REPOSITORY');}};
 const runtime=createServer({origin:'http://localhost:18795',repo,close:()=>{},handler:async()=>{const h=new Headers({'Content-Security-Policy':"default-src 'none'",'X-Mock':'retained'});h.append('Set-Cookie','session=mock; Secure; HttpOnly; Path=/');h.append('Set-Cookie','context=mock; Secure; HttpOnly; Path=/');return new Response('mock',{headers:h});}});
 runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');const a=runtime.server.address();assert(a&&typeof a==='object');try{
 const observed=await new Promise<{cookies:string[];csp:string|undefined;other:string|undefined}>(resolve=>{request('http://127.0.0.1:'+a.port+'/',r=>{r.resume();r.once('end',()=>resolve({cookies:r.headers['set-cookie']??[],csp:String(r.headers['content-security-policy']??''),other:r.headers['x-mock'] as string}));}).end();});assert.equal(observed.cookies.length,2);assert.equal(observed.other,'retained');assert.equal(observed.csp,"default-src 'none'");console.log(JSON.stringify({phase:'cookie-bridge',cookie_count:observed.cookies.length,route_csp_preserved:true}));
 }finally{await runtime.stop();}
});
