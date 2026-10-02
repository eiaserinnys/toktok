import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
const reservation=createServer();
await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const base=`http://127.0.0.1:${port}`,token='local-fixture-curl-creator';
const registry=JSON.stringify([{creator_id:'local-curl',token_sha256:createHash('sha256').update(token).digest('hex'),enabled:true}]);
// This foreground parent owns and reaps the server. Output is drained, never persisted.
const server=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--var',`PUBLIC_ORIGIN:${base}`,'--var',`CREATOR_CREDENTIALS_JSON:${registry}`],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
server.stdout.resume(); server.stderr.resume();
let exited=false;
const stopped=new Promise(resolve=>server.once('exit',()=>{exited=true;resolve();}));
try {
  let ready=false;
  for(let i=0;i<100&&!exited;i++) {
    const check=spawnSync('curl',['--silent','--fail','--max-time','1',base+'/health'],{encoding:'utf8'});
    if(check.status===0&&JSON.parse(check.stdout).status==='ok') {ready=true;break;}
    await delay(100);
  }
  if(!ready) throw Error('Local Worker did not become ready');
  const result=spawnSync('python3',['scripts/acceptance.py','--base',base],{cwd:root,stdio:'inherit',env:{...process.env,TOKTOK_LOCAL_CREATOR:token},timeout:60000});
  if(result.status!==0) throw Error('curl acceptance failed');
} finally {
  server.kill('SIGTERM'); await stopped;
}
