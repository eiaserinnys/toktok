import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createServer as tcpServer} from 'node:net';
import {createServer as tlsServer} from 'node:tls';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

// Entire network boundary is loopback and the CA is scoped to the child fixture.
test('built Node installation sends the shared OTP through a verified local TLS SMTP fixture',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'toktok-smtp-http-'));
 let app,smtp,connections=0,messages=0,received='',stderr='';const sockets=new Set();
 try{
  const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
  smtp=tlsServer({key:await readFile(key),cert:await readFile(cert)},socket=>{
   connections++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(15000,()=>socket.destroy());socket.setEncoding('utf8');socket.write('220 localhost fixture\r\n');let buffer='',data=false,body='';
   socket.on('data',chunk=>{buffer+=chunk;if(buffer.length+body.length>65536){socket.destroy();return;}let end;
    while((end=buffer.indexOf('\r\n'))!==-1){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
     if(data){if(line==='.'){received=body;messages++;body='';data=false;socket.write('250 accepted fixture\r\n');}else body+=line+'\r\n';continue;}
     if(line.startsWith('EHLO'))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
     else if(line.startsWith('AUTH PLAIN'))socket.write('235 authenticated fixture\r\n');
     else if(line==='DATA'){data=true;socket.write('354 data\r\n');}
     else if(line==='QUIT'){socket.end('221 closing\r\n');}
     else socket.write('250 ok\r\n');
    }
   });
  });smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
  const reserve=tcpServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const origin='http://127.0.0.1:'+port,config=join(dir,'smtp.json');
  await writeFile(config,JSON.stringify({host:'127.0.0.1',servername:'localhost',port:smtp.address().port,secure:true,from:'login@fixture.example',user:'fixture',password:'fixture'}),{mode:0o600});
  const env={...process.env,PATH:dirname(process.execPath)+':'+process.env.PATH,NODE_EXTRA_CA_CERTS:cert,TOKTOK_BACKEND:'sqlite',TOKTOK_SQLITE_FILE:join(dir,'db.sqlite'),TOKTOK_SMTP_CONFIG_FILE:config,PUBLIC_ORIGIN:origin,PORT:String(port),TOKTOK_ASSETS:resolve('public'),ADMIN_BOOTSTRAP_EMAIL:'admin@fixture.example'};
  const cwd=resolve('selfhost'),entry=resolve('selfhost/scripts/entrypoint.sh');
  execFileSync(entry,['apply'],{cwd,env,stdio:'ignore'});
  app=spawn(entry,['start'],{cwd,env,stdio:['ignore','ignore','pipe']});app.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2048);});
  let ready=false;
  for(let i=0;i<100;i++){if(app.exitCode!==null)break;try{const r=await fetch(origin+'/ready');await r.arrayBuffer();if(r.ok){ready=true;break;}}catch{}await delay(50);}
  assert(ready,'compiled host did not become ready');assert.equal(connections,0);assert.equal(messages,0);
  const start=await fetch(origin+'/api/auth/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({purpose:'login'})});assert.equal(start.status,200);const flow=await start.json();
  const cookies=start.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const sent=await fetch(origin+'/api/auth/email/send',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookies},body:JSON.stringify({flow_id:flow.flow,email:'admin@fixture.example',client_request_id:'local-smtp-delivery'})});assert.equal(sent.status,200);await sent.arrayBuffer();
  assert.equal(messages,1);assert.equal(connections,1);assert(received.includes('admin@fixture.example'),'fixture recipient was not delivered');assert(!stderr.includes('admin@fixture.example'),'recipient leaked to process log');assert(!stderr.includes('fixture-password'),'credential leaked');
 }finally{
  if(app&&app.exitCode===null){const stopped=once(app,'exit');app.kill('SIGTERM');await Promise.race([stopped,delay(10000).then(()=>{if(app.exitCode===null)app.kill('SIGKILL');})]);}
  for(const socket of sockets)socket.destroy();if(smtp)await new Promise(r=>smtp.close(r));await rm(dir,{recursive:true,force:true});
 }
});
