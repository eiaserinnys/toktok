import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {createServer} from '../src/runtime/node-http';
import {cancelUnusedRequestBody} from '../src/public-http';
import type {RepositoryPort} from '../src/storage/repository';

test('Node rejected uploads detach safely and preserve the response and next request',async()=>{
 const repo:RepositoryPort={ready:()=>true,close:async()=>{},transaction:async()=>{throw new Error('No database expected');}};
 const host=createServer({origin:'http://localhost',repo,close:()=>{},handler:async request=>{
  if(new URL(request.url).pathname==='/accept')return Response.json({bytes:(await request.arrayBuffer()).byteLength});
  cancelUnusedRequestBody(request);return Response.json({error:{code:'DENIED'}},{status:403});
 }});
 host.server.listen(0,'127.0.0.1');await once(host.server,'listening');const addr=host.server.address();assert(addr&&typeof addr==='object');const origin=`http://127.0.0.1:${addr.port}`;
 try{
  for(let i=0;i<3;i++){
   const response=await fetch(origin+'/deny',{method:'POST',body:'x'.repeat(65536)});
   assert.equal(response.status,403);assert.equal(response.headers.get('connection'),'close');assert.deepEqual(await response.json(),{error:{code:'DENIED'}});
  }
  // Reject while the client is still sending; do not drain the rest of the upload.
  await new Promise<void>((resolve,reject)=>{
   let timer:ReturnType<typeof setInterval>|undefined;
   const req=httpRequest(origin+'/deny',{method:'POST'},response=>{
    clearInterval(timer);let data='';response.setEncoding('utf8');response.on('data',chunk=>{data+=chunk;});response.on('error',reject);
    response.on('end',()=>{try{assert.equal(response.statusCode,403);assert.equal(JSON.parse(data).error.code,'DENIED');req.destroy();resolve();}catch(error){reject(error);}});
   });
   req.on('error',reject);req.write('x'.repeat(4096));timer=setInterval(()=>req.write('y'.repeat(4096)),10);
  });
  const accepted=await fetch(origin+'/accept',{method:'POST',body:'ok'});assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{bytes:2});
 }finally{await host.stop();}
});
