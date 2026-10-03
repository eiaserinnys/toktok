import {publicTestRepo} from './selfhost-recent-repo';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PublicRooms} from '../src/runtime/public-rooms';
import {PUBLIC_POLICY,PUBLIC_NOTICE,INTERNAL_IP_HEADER,type ValidatedOperatorAck} from '../src/public-contracts';
import {TEST_BUDGET} from './selfhost-budget';
const origin='http://localhost:18794',ip='a'.repeat(64),catalog=(slug:string)=>[{slug,title:'mock'}];
const req=(slug:string,path:string,method='GET',data?:object,token?:string,signal?:AbortSignal)=>new Request(origin+'/api/public/rooms/'+slug+path,{method,headers:{[INTERNAL_IP_HEADER]:ip,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined,signal});
test('public registry bounds renamed cores while active leases and pending work drain naturally',async t=>{const repo=publicTestRepo(t);
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const registry=new PublicRooms(origin,catalog('old-room'),{...PUBLIC_POLICY},TEST_BUDGET,repo);
 try{
  const old=registry.room('old-room'),joined=await old.fetch(req('old-room','/watchers','POST',{notice_version:PUBLIC_NOTICE}));assert.equal(joined.status,201);
  const {lease_token:token}=await joined.json() as {lease_token:string};
  const first=await old.fetch(req('old-room','/messages','GET',undefined,token));const {cursor}=await first.json() as {cursor:string};
  now+=2000;const abort=new AbortController(),wait=old.fetch(req('old-room','/wait?after='+encodeURIComponent(cursor)+'&timeout=25','GET',undefined,token,abort.signal));
  for(let n=0;n<30&&old.diagnostics().active_waits===0;n++)await new Promise(r=>setTimeout(r,1));assert.equal(old.diagnostics().active_waits,1);
  registry.configure(1,{...PUBLIC_POLICY},catalog('room-0'));assert.equal(registry.room('old-room'),old);assert.equal(registry.has('old-room'),true);
  abort.abort();const stopped=await wait;assert.equal(stopped.status,499);await stopped.arrayBuffer();
  const left=await old.fetch(req('old-room','/lease','DELETE',undefined,token));assert.equal(left.status,204);
  registry.room('room-0');assert.equal(registry.has('old-room'),false);assert.equal(old.diagnostics().batch_timer_active,false);
  let firstHeld:ReturnType<PublicRooms['room']>|undefined;
  for(let n=0;n<100;n++){
   const slug='room-'+n;registry.configure(n+2,{...PUBLIC_POLICY},catalog(slug));const core=registry.room(slug);if(n===0)firstHeld=core;
   const grant=await core.issueOperatorGrant({room:slug,risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:ip} as ValidatedOperatorAck);assert.equal(grant.status,201);
  }
  registry.configure(102,{...PUBLIC_POLICY},catalog('room-100'));
  const limited=await registry.fetch(req('room-100','/watchers','POST',{notice_version:PUBLIC_NOTICE}));assert.equal(limited?.status,429);assert.equal(limited?.headers.get('Retry-After'),'1');const error=await limited!.json() as {error:{retry_after_ms:number}};assert.equal(error.error.retry_after_ms,1000);
  assert.equal(registry.room('room-0'),firstHeld);
  now+=PUBLIC_POLICY.grantMs+1;registry.room('room-100');assert.equal(registry.has('room-0'),false);assert.equal(registry.has('room-99'),false);assert.equal(registry.has('room-100'),true);
  registry.configure(103,{...PUBLIC_POLICY},catalog('room-next'));assert.equal(registry.has('room-100'),false);registry.room('room-next');
  console.log(JSON.stringify({phase:'public-registry-gc',bound:100,overflow_status:limited!.status,pending_expiry_gc:true,active_wait_drain:true,old_timer:false}));
 }finally{registry.shutdown();}
});
