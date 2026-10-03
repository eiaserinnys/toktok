import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
import {PrivateRoomCore} from '../src/private-core';
import {privateSnapshot} from './selfhost-private-fixture';
import {PublicRoomCore} from '../src/public-core';
import {PUBLIC_CATALOG,PUBLIC_POLICY,PUBLIC_NOTICE,INTERNAL_IP_HEADER,type ValidatedOperatorAck} from '../src/public-contracts';
import {CoreBudget} from '../src/runtime/budget';
import {HttpError} from '../src/http';
import type {PrivateBudgetPort,PrivateBudgetKind} from '../src/private-contracts';
import {TEST_BUDGET} from './selfhost-budget';
test('A-compatible fixed-kind/amount budget IDs cover initialize/read/post/write and skip zero-byte response',async()=>{
 const reservations=new Map<string,{kind:PrivateBudgetKind;amount:number}>();const budget:PrivateBudgetPort={newOperationId:TEST_BUDGET.newOperationId,reserve:async(id,kind,amount)=>{
 const match=/^(\d+):(\d+):[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(id);assert(match);assert(Number(match[2])>Number(match[1])&&Number(match[2])-Number(match[1])<=60000);if(!Number.isSafeInteger(amount)||amount<=0)throw new HttpError(400,'INVALID_INPUT','mock');const old=reservations.get(id);if(old&&(old.kind!==kind||old.amount!==amount))throw new HttpError(409,'IDEMPOTENCY_CONFLICT','mock');reservations.set(id,{kind,amount});}};
 const dir=mkdtempSync(join(tmpdir(),'toktok-reservations-')),file=join(dir,'db');applySQLite(file);const repo=new SQLiteRepository(file);try{
 const {snapshot,tokens}=await privateSnapshot('strict-private',true);const privateRoom=new PrivateRoomCore({origin:'http://localhost:18794',repo,budget});await privateRoom.initialize(snapshot);
 const call=(path:string,method='GET',data?:object,token=tokens.read)=>privateRoom.fetch(new Request('http://localhost:18794/api/v1/rooms/strict-private'+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}));
 const joined=await call('/participants','POST',{nickname:'mock',client_request_id:'join',notice_version:snapshot.notice_version,visibility:'private',retention_mode:'persisted'},tokens.invite);assert.equal(joined.status,201);const participant=(await joined.json()).participant_token;
 const posted=await call('/messages','POST',{text:'strict mock',client_message_id:'one'},participant);assert.equal(posted.status,201);await posted.arrayBuffer();const page=await call('/messages');assert.equal(page.status,200);assert.equal((await page.json()).messages.length,1);
 const publicRoom=new PublicRoomCore({repo,origin:'http://localhost:18794',catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),budget});const ip='a'.repeat(64),grant=await publicRoom.issueOperatorGrant({room:'common-room',risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:ip} as ValidatedOperatorAck);assert.equal(grant.status,201);const base='http://localhost:18794/api/public/rooms/common-room';const publicJoin=await publicRoom.fetch(new Request(base+'/watchers',{method:'POST',headers:{[INTERNAL_IP_HEADER]:ip,'Content-Type':'application/json'},body:JSON.stringify({notice_version:PUBLIC_NOTICE})}));assert.equal(publicJoin.status,201);await publicJoin.arrayBuffer();
 const coreBudget=new CoreBudget(budget,()=>Date.now()),context=await coreBudget.admit(),count=reservations.size;const empty=await coreBudget.respond(new Response(null,{status:204}),context);assert.equal(empty.status,204);assert.equal(reservations.size,count);
 assert([...reservations.values()].some(r=>r.kind==='persistent_write_bytes'));assert([...reservations.values()].some(r=>r.kind==='response_bytes'));assert([...reservations.values()].some(r=>r.kind==='active_room_seconds'));publicRoom.shutdown();privateRoom.shutdown();console.log(JSON.stringify({phase:'kind-amount-reservations',unique_ids:reservations.size,kinds:[...new Set([...reservations.values()].map(r=>r.kind))],zero_byte_skipped:true}));
 }finally{await repo.close();rmSync(dir,{recursive:true,force:true});}
});
