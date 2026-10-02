import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createServer} from 'node:net';
const scenario=process.argv[2];if(!['A','B','C','D','E'].includes(scenario))throw Error('scenario must be A..E');
const seeds={A:26100201,B:26100202,C:26100203,D:26100204,E:26100205},seed=seeds[scenario];let randomState=seed;
function random(){randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;}
const agentCadence={A:2000,B:5000,C:10000,D:5000,E:5000}[scenario],watcherCadence=2000;
const participants=scenario==='D'?2:scenario==='E'?10:100,watchers=scenario==='D'?0:scenario==='E'?10:50,small=['D','E'].includes(scenario);
const origin='http://localhost:18793',base='/api/public/rooms/common-room',notice='toktok-risk-v1';
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const percentile=values=>{if(!values.length)return {count:0,p50_ms:null,p95_ms:null,max_ms:null};const s=[...values].sort((a,b)=>a-b);return {count:s.length,p50_ms:s[Math.min(s.length-1,Math.floor(s.length*.5))],p95_ms:s[Math.min(s.length-1,Math.floor(s.length*.95))],max_ms:s.at(-1)};};
const durationGroups=cases=>({nonempty:percentile(cases.filter(c=>c.kind==='read'&&c.status===200&&c.page_count>0).map(c=>c.duration_ms)),empty_timeout:percentile(cases.filter(c=>c.kind==='read'&&c.status===200&&c.page_count===0).map(c=>c.duration_ms))});
await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(18793,'127.0.0.1',()=>s.close(resolve));});
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config','test/public-wrangler.jsonc','--port','18793','--inspector-port','0','--log-level','error'],{stdio:['ignore','pipe','pipe'],env:process.env});child.stdout.resume();child.stderr.resume();
const clients=[],rawCases=[],accepted=new Map(),deliveries=[],sendTasks=[],controllers=new Set();
let started=Infinity,windowEnded=false,recoveryEnded=false,unexpected=0,maxResponseBytes=0,maxLocalProcessRss=0,diagnostics;
let setupRequests=0,recoveryRequests=0,cancelledWaits=0,measurementCutWaits=0,overlapSkipped=0,sampler,recoveryTimer;
const durations={nonempty:[],empty_timeout:[],limited:[]},windowStatuses={},windowKinds={};
function retryDelay(r,attempt){const minimum=Math.max(Number(r.retryAfter??0)*1000,r.value.error?.retry_after_ms??0);return minimum+random()*Math.min(8000,1000*2**Math.min(attempt-1,3));}
async function request(path,c,method='GET',data,kind='control',signal,job) {
 const begin=performance.now(),offset=begin-started,measured=offset>=0&&offset<60000;
 if(measured){windowKinds[kind]=(windowKinds[kind]??0)+1;}else if(offset>=60000)recoveryRequests++;else setupRequests++;
 const ownControl=signal?undefined:new AbortController();if(ownControl)controllers.add(ownControl);
 try{
  const response=await fetch(origin+path,{method,signal:signal??ownControl.signal,headers:{'x-fixture-ip':c?.ip??'192.0.2.254',...(c?.lease_token?{Authorization:'Bearer '+c.lease_token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  const raw=await response.text(),consumed=Date.now(),value=raw?JSON.parse(raw):{},duration=performance.now()-begin;
  if(![200,201,204,429].includes(response.status))unexpected++;
  if(measured)windowStatuses[response.status]=(windowStatuses[response.status]??0)+1;
  if(kind==='read'&&response.status===200){maxResponseBytes=Math.max(maxResponseBytes,Buffer.byteLength(raw));durations[value.messages.length?'nonempty':'empty_timeout'].push(duration);}
  if(kind==='read'&&response.status===429)durations.limited.push(duration);
  if(['read','post'].includes(kind))rawCases.push({client:c.label,kind,job,start_ms:offset,duration_ms:duration,consumed_at_ms:consumed,measurement_request:measured,status:response.status,error_code:value.error?.code,retry_after_ms:value.error?.retry_after_ms,retry_after_seconds:response.headers.get('Retry-After'),cursor:value.cursor,page_count:value.messages?.length,has_more:value.has_more,history_status:value.history_status,bytes:Buffer.byteLength(raw)});
  return {status:response.status,value,retryAfter:response.headers.get('Retry-After'),consumed,duration,measured};
 }catch(error){if(kind==='read'&&(signal?.aborted||ownControl?.signal.aborted)){cancelledWaits++;rawCases.push({client:c.label,kind,start_ms:offset,duration_ms:performance.now()-begin,measurement_request:measured,cancelled:true});}throw error;}finally{if(ownControl)controllers.delete(ownControl);}
}
async function rss(pid){try{const raw=await readFile(`/proc/${pid}/status`,'utf8');let total=Number(/VmRSS:\s+(\d+)/.exec(raw)?.[1]??0)*1024;const descendants=await readFile(`/proc/${pid}/task/${pid}/children`,'utf8');for(const p of descendants.trim().split(/\s+/).filter(Boolean))total+=await rss(Number(p));return total;}catch{return 0;}}
function apply(c,r,initial=false){const p=r.value;if(p.history_status!=='ok'){c.notices.push({status:p.history_status,cursor:p.cursor,at_ms:performance.now()-started});c.lastSequence=undefined;}
 for(const m of p.messages){const key=p.epoch+':'+m.sequence;if(c.seen.has(key)){c.duplicates++;continue;}
  if(c.lastSequence!==undefined&&m.sequence!==c.lastSequence+1)c.gaps.push({after:c.lastSequence,next:m.sequence});
  c.lastSequence=m.sequence;c.seen.add(key);if(initial){c.initialExcluded++;continue;}
  const time=Date.parse(m.created_at);deliveries.push({client:c.label,epoch:p.epoch,sequence:m.sequence,created_at_ms:time,consumed_at_ms:r.consumed,lag_ms:r.consumed-time,recovery:r.consumed>=windowStartWall+60000});
 }
 c.cursor=p.cursor;c.hasMore=p.has_more;c.pageCount++;
}
let windowStartWall,readers=[];
async function reader(c){let attempt=0,delay=c.cadence;while(!windowEnded){await sleep(delay);if(windowEnded)break;const control=new AbortController();controllers.add(control);c.waiting=true;
 try{const r=await request(base+'/wait?timeout=25&after='+encodeURIComponent(c.cursor),c,'GET',undefined,'read',control.signal);if(r.status===200){apply(c,r);attempt=0;delay=c.hasMore?2000:c.cadence;}else if(r.status===429){delay=retryDelay(r,++attempt);}else break;}catch(error){if(!recoveryEnded)throw error;}finally{c.waiting=false;controllers.delete(control);}}
}
async function sender(c,burst){if(c.sending){overlapSkipped++;return;}c.sending=true;const id=crypto.randomUUID();let attempt=0;
 try{while(!windowEnded){const r=await request(base+'/messages',c,'POST',{client_message_id:id,text:'로컬 cadence 비교'},'post',undefined,`${c.label}/burst-${burst}`);if(r.status===201){accepted.set(r.value.cursor,{epoch:r.value.cursor.split(':')[0],sequence:r.value.sequence,created_at_ms:Date.parse(r.value.created_at),ack_in_window:r.measured});return;}if(r.status!==429)return;const delay=retryDelay(r,++attempt);if(performance.now()-started+delay>=60000)return;await sleep(delay);}}finally{c.sending=false;}
}
try{
 let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('fixture exited');try{if((await fetch(origin+'/api/public/rooms')).ok){ready=true;break;}}catch{}await sleep(100);}if(!ready)throw Error('fixture readiness timeout');
 for(let n=0;n<participants+watchers;n++){const c={ip:`198.51.1.${n+1}`,label:(n<participants?'participant-':'watcher-')+n,cadence:n<participants?agentCadence:watcherCadence,seen:new Set(),notices:[],gaps:[],duplicates:0,initialExcluded:0,pageCount:0,waiting:false,sending:false};
  if(n<participants){const g=await request('/__fixture/grants/common-room',c,'POST');if(g.status!==201)throw Error('grant setup rejected');const joined=await request(base+'/participants',c,'POST',{operator_grant:g.value.operator_grant,client_request_id:crypto.randomUUID(),nickname:'비교 참여자',notice_version:notice,visibility:'public',retention_mode:'memory'});if(joined.status!==201)throw Error('participant setup rejected');c.lease_token=joined.value.lease_token;}
  else {const joined=await request(base+'/watchers',c,'POST',{notice_version:notice});if(joined.status!==201)throw Error('watcher setup rejected');c.lease_token=joined.value.lease_token;}
  clients.push(c);
 }
 await Promise.all(clients.map(async c=>{const initial=await request(base+'/messages',c,'GET',undefined,'setup');if(initial.status!==200)throw Error('initial cursor setup rejected');apply(c,initial,true);}));
 diagnostics=(await request('/__fixture/diagnostics/common-room')).value;
 if(diagnostics.leases.participants!==participants||diagnostics.leases.watchers!==watchers)throw Error('lease setup mismatch');
 started=performance.now();windowStartWall=Date.now();readers=clients.map(reader);
 for(let burst=0;burst<2;burst++)for(const [n,c] of clients.slice(0,participants).entries())sendTasks.push((async()=>{await sleep(Math.max(0,started+burst*30000+(small?n*30000/participants:0)-performance.now()));if(!windowEnded)await sender(c,burst);})());
 sampler=setInterval(async()=>{try{diagnostics=(await request('/__fixture/diagnostics/common-room',undefined,'GET',undefined,'diagnostics')).value;maxLocalProcessRss=Math.max(maxLocalProcessRss,await rss(child.pid));}catch{}},1000);
 await sleep(Math.max(0,started+60000-performance.now()));windowEnded=true;const cutAt=performance.now();measurementCutWaits=clients.filter(c=>c.waiting).length;clearInterval(sampler);
 recoveryTimer=setTimeout(()=>{recoveryEnded=true;for(const control of controllers)control.abort();},30000);
 // 측정 종료 시 이미 시작한 대기는 회수하되 새 요청은 recovery traffic으로만 기록합니다.
 await Promise.all(sendTasks);await Promise.all(readers);
 const beforeRecovery=(await request('/__fixture/diagnostics/common-room')).value;
 // 마지막 window가 아직 남아 있으면 metadata 최신 cursor까지 단일 GET으로 이어받습니다.
 const target=beforeRecovery.epoch+':'+beforeRecovery.accepted_messages;
 for(let round=0;round<8&&!recoveryEnded&&performance.now()<cutAt+28000&&clients.some(c=>c.cursor!==target);round++){
  await sleep(2000);if(recoveryEnded)break;await Promise.all(clients.filter(c=>c.cursor!==target).map(async c=>{try{const r=await request(base+'/messages?after='+encodeURIComponent(c.cursor),c,'GET',undefined,'read');if(r.status===200)apply(c,r);else if(r.status===429)c.recoveryLimited=(c.recoveryLimited??0)+1;}catch(error){if(!recoveryEnded)throw error;}}));
 }
 recoveryEnded=true;clearTimeout(recoveryTimer);for(const control of controllers)control.abort();await Promise.allSettled(readers);
 const recoveryMs=performance.now()-cutAt;const missing=clients.map(c=>({client:c.label,count:[...accepted.keys()].filter(k=>!c.seen.has(k)).length}));
 const snapshots=clients.map(c=>({client:c.label,cursor:c.cursor,seen_count:c.seen.size,initial_excluded:c.initialExcluded,page_count:c.pageCount,duplicates:c.duplicates,gaps:c.gaps,notices:c.notices,has_more:c.hasMore,missing_accepted:missing.find(m=>m.client===c.label).count,recovery_limited:c.recoveryLimited??0}));
 await Promise.all(clients.map(c=>request(base+'/lease',c,'DELETE',undefined,'cleanup')));const cleanup=(await request('/__fixture/diagnostics/common-room')).value;
 const times=[...accepted.values()].map(a=>a.created_at_ms).sort((a,b)=>a-b);let strict=true;for(let n=5;n<times.length;n++)if(times[n]-times[n-5]<1000)strict=false;
 const summary={scenario,seed,participants,watchers,policy:{server_batch_ms:2000,agent_cadence_ms:agentCadence,watcher_cadence_ms:watcherCadence,has_more_cadence_ms:2000,operator_ms:30000,room_sliding_ms:1000,room_max:5,send_jitter:'0..min(8000,1000*2^(consecutive429-1))ms',retry_minimum:'max(Retry-After seconds,error.retry_after_ms)',one_send_and_wait_per_client:true},window:{started_at_ms:windowStartWall,duration_ms:60000,requests_started: Object.entries(windowKinds).filter(([k])=>k!=='diagnostics').reduce((n,[,v])=>n+v,0),by_kind:windowKinds,statuses:windowStatuses,accepted_acknowledged:accepted.size,accepted_server:beforeRecovery.accepted_messages,scheduled_messages:participants*2,overlap_skipped:overlapSkipped,pending_or_unaccepted:participants*2-accepted.size-overlapSkipped},request_duration:{empty_timeout:percentile(durations.empty_timeout),nonempty:percentile(durations.nonempty),limited:percentile(durations.limited)},delivery_lag:{all:percentile(deliveries.map(d=>d.lag_ms)),during_window:percentile(deliveries.filter(d=>!d.recovery).map(d=>d.lag_ms)),recovery:percentile(deliveries.filter(d=>d.recovery).map(d=>d.lag_ms))},counts:{actually_applied:deliveries.length,possible_accepted_deliveries:accepted.size*(participants+watchers),missing_deliveries:missing.reduce((n,m)=>n+m.count,0),initial_excluded:clients.reduce((n,c)=>n+c.initialExcluded,0),gap_notices:clients.reduce((n,c)=>n+c.gaps.length+c.notices.length,0),unexpected},recovery:{duration_ms:recoveryMs,requests_started:recoveryRequests,measurement_cut_waits:measurementCutWaits,cancelled_waits:cancelledWaits},setupRequests,maxResponseBytes,maxLocalProcessRss,diagnostics:beforeRecovery,cleanup,invariants:{strict_room_window:strict,wait_limit:beforeRecovery.max_active_waits<=150,handler_limit:beforeRecovery.max_active_handlers<=160,byte_limit:maxResponseBytes<=65536,cleanup_zero:cleanup.active_waits===0&&cleanup.active_handlers===0&&cleanup.leases.participants===0&&cleanup.leases.watchers===0&&!cleanup.batch_timer_active}};
 const result={...summary,clients:snapshots,accepted:[...accepted.values()],deliveries,rawCases};
 summary.request_duration.during_window=durationGroups(rawCases.filter(c=>c.measurement_request));summary.request_duration.recovery=durationGroups(rawCases.filter(c=>!c.measurement_request));
 summary.window.accepted_created_in_window=result.accepted.filter(a=>a.created_at_ms>=windowStartWall&&a.created_at_ms<windowStartWall+60000).length;
 await writeFile(`test/public-load.compare-${scenario}.json`,JSON.stringify(summary,null,2).slice(0,-2)+',\n  "clients": '+JSON.stringify(snapshots)+',\n  "accepted": '+JSON.stringify(result.accepted)+',\n  "deliveries": [\n'+deliveries.map(d=>'    '+JSON.stringify(d)).join(',\n')+'\n  ],\n  "rawCases": [\n'+rawCases.map(c=>'    '+JSON.stringify(c)).join(',\n')+'\n  ]\n}\n');
 console.log(JSON.stringify({result:'OBSERVED',...summary}));
 if(!Object.values(summary.invariants).every(Boolean)||unexpected||summary.counts.gap_notices||summary.counts.missing_deliveries)process.exitCode=1;
}finally{windowEnded=true;recoveryEnded=true;clearInterval(sampler);clearTimeout(recoveryTimer);for(const c of controllers)c.abort();await Promise.allSettled(readers);await Promise.allSettled(sendTasks);child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);});}
