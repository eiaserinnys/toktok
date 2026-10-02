import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
test('nonroot SQLite image explicit migration, ready, absent PG driver and single volume owner',async()=>{
 const image='toktok-portable-fixture:249424e1',volume='toktok-volume-fixture-'+process.pid,name='toktok-app-fixture-'+process.pid;let child:ReturnType<typeof spawn>|undefined;
 const common=['--rm','--mount','type=volume,src='+volume+',dst=/data','-e','TOKTOK_BACKEND=sqlite','-e','TOKTOK_SQLITE_FILE=/data/toktok.sqlite','-e','PUBLIC_ORIGIN=http://localhost:8080','-e','PORT=8080'];
 try{execFileSync('docker',['volume','create',volume],{stdio:'ignore'});
 const cmd=(command:string)=>JSON.parse(execFileSync('docker',['run',...common,image,command],{stdio:['ignore','pipe','pipe']}).toString());assert.equal(cmd('check').state,'blank');assert.equal(cmd('apply').state,'ready');
 const config=JSON.parse(execFileSync('docker',['image','inspect','--format','{{json .Config}}',image],{stdio:['ignore','pipe','ignore']}).toString());assert.equal(config.User,'node');
 const absent=execFileSync('docker',['run',...common,'--entrypoint','node',image,'-e',"try{require.resolve('pg');process.exit(1)}catch{};console.log(process.versions.node)"],{stdio:['ignore','pipe','pipe']}).toString().trim();assert.equal(absent,'24.21.0');
 child=spawn('docker',['run',...common,'--name',name,'-p','127.0.0.1::8080',image,'start'],{stdio:'ignore'});let port='';for(let n=0;n<80;n++){try{port=execFileSync('docker',['port',name,'8080/tcp'],{stdio:['ignore','pipe','ignore']}).toString().trim().split(':').at(-1)!;const r=await fetch('http://127.0.0.1:'+port+'/ready');await r.arrayBuffer();if(r.status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert(port);const ready=await fetch('http://127.0.0.1:'+port+'/ready');assert.equal(ready.status,200);await ready.arrayBuffer();const catalog=await fetch('http://127.0.0.1:'+port+'/api/public/rooms');assert.equal(catalog.status,200);assert.equal((await catalog.json()).rooms.length,3);
 assert.throws(()=>execFileSync('docker',['run',...common,image,'start'],{stdio:'ignore',timeout:5000}));const start=Date.now();execFileSync('docker',['stop','-t','25',name],{stdio:'ignore'});if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');assert.equal(child.exitCode,0);assert(Date.now()-start<25000);assert.equal(cmd('check').state,'ready');console.log(JSON.stringify({phase:'container',node:absent,nonroot:true,pg_required:false,second_owner_rejected:true,stop_ms:Date.now()-start,ready_after_stop:true}));
 }finally{try{execFileSync('docker',['stop','-t','1',name],{stdio:'ignore'});}catch{}if(child&&child.exitCode===null&&child.signalCode===null)await once(child,'exit');execFileSync('docker',['volume','rm',volume],{stdio:'ignore'});}
});
