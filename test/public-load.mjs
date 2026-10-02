import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createServer} from 'node:net';
import {checkOracle,verdict} from './public-load.verdict.mjs';
const origin='http://localhost:18793',base='/api/public/rooms/common-room',notice='toktok-risk-v1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
checkOracle();
await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(18793,'127.0.0.1',()=>s.close(resolve));});
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config','test/public-wrangler.jsonc','--port','18793','--inspector-port','0','--log-level','error'],{stdio:['ignore','pipe','pipe'],env:process.env});
// Do not persist request URLs, credentials or fixture response bodies in runner output.
child.stdout.resume();child.stderr.resume();
let phase='setup',stop=false,unexpected=0,maxResponseBytes=0,maxLocalProcessRss=0;
const stats={},acceptedTimes=[],controllers=new Set(),latencies={},clients=[],rawCases=[];
function record(kind,status,elapsed,bytes){if(phase==='setup'||phase==='cleanup')return;const s=stats[phase]??={requests:0,statuses:{},json_bytes:0};s.requests++;s.statuses[status]=(s.statuses[status]??0)+1;s.json_bytes+=bytes;(latencies[phase+':'+kind]??=[]).push(elapsed);}
async function request(path,client,method='GET',data,signal,kind='control') {
 const start=performance.now();const r=await fetch(origin+path,{method,signal,headers:{'x-fixture-ip':client?.ip??'192.0.2.254',...(client?.lease_token?{Authorization:'Bearer '+client.lease_token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const raw=await r.text(),bytes=Buffer.byteLength(raw);record(kind,r.status,performance.now()-start,bytes);
 if(kind==='read'&&r.status===200)maxResponseBytes=Math.max(maxResponseBytes,bytes);
 if(![200,201,204,429].includes(r.status))unexpected++;
 const value=raw?JSON.parse(raw):{};
 if(['read','post'].includes(kind))rawCases.push({phase,kind,status:r.status,error_code:value.error?.code,retry_after_ms:value.error?.retry_after_ms,cursor:value.cursor,page_count:value.messages?.length,bytes,accepted:r.status===201});
 return {status:r.status,value,bytes};
}
async function rss(pid){try{const raw=await readFile(`/proc/${pid}/status`,'utf8');let total=Number(/VmRSS:\s+(\d+)/.exec(raw)?.[1]??0)*1024;const children=await readFile(`/proc/${pid}/task/${pid}/children`,'utf8');for(const c of children.trim().split(/\s+/).filter(Boolean))total+=await rss(Number(c));return total;}catch{return 0;}}
let diagnostics,readers=[],sampler;
try {
 let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('local fixture exited before readiness');try{if((await fetch(origin+'/api/public/rooms')).ok){ready=true;break;}}catch{}await sleep(100);}
 if(!ready)throw Error('local fixture startup timed out');
 for(let n=0;n<150;n++) {
  const c={ip:`198.51.${Math.floor(n/250)}.${n%250+1}`};
  if(n<100){const g=await request('/__fixture/grants/common-room',c,'POST');if(g.status!==201)throw Error('grant setup rejected');const joined=await request(base+'/participants',c,'POST',{operator_grant:g.value.operator_grant,client_request_id:crypto.randomUUID(),nickname:'부하 참여자',notice_version:notice,visibility:'public',retention_mode:'memory'});if(joined.status!==201)throw Error('participant setup rejected');Object.assign(c,joined.value);}
  else {const joined=await request(base+'/watchers',c,'POST',{notice_version:notice});if(joined.status!==201)throw Error('watcher setup rejected');Object.assign(c,joined.value);}
  clients.push(c);
 }
 diagnostics=(await request('/__fixture/diagnostics/common-room')).value;
 if(diagnostics.leases.participants!==100||diagnostics.leases.watchers!==50)throw Error('setup lease count mismatch');
 async function reader(c){let cursor;while(!stop){const controller=new AbortController();controllers.add(controller);try{const r=await request(base+'/wait?timeout=25'+(cursor?'&after='+encodeURIComponent(cursor):''),c,'GET',undefined,controller.signal,'read');if(r.status===200)cursor=r.value.cursor;await sleep(r.status===429?Math.max(20,r.value.error.retry_after_ms)+Math.random()*100:2000+Math.random()*100);}catch(e){if(!stop)throw e;}finally{controllers.delete(controller);}}}
 async function post(c,id){const r=await request(base+'/messages',c,'POST',{client_message_id:id,text:'로컬 부하 검증'},undefined,'post');if(r.status===201)acceptedTimes.push(Date.parse(r.value.created_at));return r;}
 phase='aligned_1';readers=clients.map(reader);
 sampler=setInterval(async()=>{try{diagnostics=(await request('/__fixture/diagnostics/common-room',undefined,'GET',undefined,undefined,'diagnostics')).value;maxLocalProcessRss=Math.max(maxLocalProcessRss,await rss(child.pid));}catch{}},1000);
 async function aligned(){const start=performance.now(),deadline=start+30000;await Promise.all(clients.slice(0,100).map(async c=>{const id=crypto.randomUUID();while(performance.now()<deadline){const r=await post(c,id);if(r.status!==429)break;const delay=r.value.error.retry_after_ms+Math.random()*150;if(performance.now()+delay>=deadline)break;await sleep(delay);}}));await sleep(Math.max(0,deadline-performance.now()));}
 await aligned();phase='aligned_2';await aligned();
 stop=true;clearInterval(sampler);for(const c of controllers)c.abort();await Promise.all(readers);
 diagnostics=(await request('/__fixture/diagnostics/common-room')).value;
 phase='cleanup';await Promise.all(clients.map(c=>request(base+'/lease',c,'DELETE')));
 const cleanup=(await request('/__fixture/diagnostics/common-room')).value;
 const latency={};for(const [key,values] of Object.entries(latencies)){values.sort((a,b)=>a-b);latency[key]={count:values.length,p50_ms:values[Math.floor(values.length*.5)],p95_ms:values[Math.floor(values.length*.95)]};}
 const result={checked_at:new Date().toISOString(),participants:100,watchers:50,phase_seconds:30,stats,latency,maxResponseBytes,maxLocalProcessRss,diagnostics,cleanup,unexpected,acceptedTimes,rawCases};
 verdict(result);delete result.acceptedTimes;
 const {rawCases:cases,...summary}=result;
 await writeFile('test/public-load.result.json',JSON.stringify(summary,null,2).slice(0,-2)+',\n  "rawCases": [\n'+cases.map(c=>'    '+JSON.stringify(c)).join(',\n')+'\n  ]\n}\n');
 console.log(JSON.stringify({result:'PASS',...result,rawCases:rawCases.length}));
}finally{stop=true;clearInterval(sampler);for(const c of controllers)c.abort();await Promise.allSettled(readers);child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);});}
