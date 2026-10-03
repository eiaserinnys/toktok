import assert from 'node:assert/strict';
import {PrivateRoomCore} from '../src/private-core';
import {PrivateRooms} from '../src/runtime/private-rooms';
import {RecordCollection as C,type RepositoryPort} from '../src/storage/repository';
import type {NodePrivateMaintenance} from '../src/storage/node-maintenance';
import {messageKey} from '../src/private-state';
import {privateSnapshot} from './selfhost-private-fixture';
import {TEST_BUDGET} from './selfhost-budget';
/** No HTTP access after restart. Output is counts only; all stored content is mock data. */
export async function restoreFixture(repo:RepositoryPort&NodePrivateMaintenance){
 let now=Date.now();const registry=new PrivateRooms({origin:'http://localhost:18794',repo,budget:TEST_BUDGET,clock:()=>now});
 try{
 for(const [id,total,deleted] of [['restore-aged',101,false],['restore-deleted',1,true]] as const){
  const {snapshot}=await privateSnapshot(id,true,now),core=new PrivateRoomCore({origin:'http://localhost:18794',repo,budget:TEST_BUDGET,clock:()=>now});snapshot.expires_at=now+71000;await core.initialize(snapshot);core.shutdown();
  await repo.transaction('room:'+id,async tx=>{const state=(await tx.get(C.private_rooms,id))!;state.body_count=total;state.sequence=total;state.status=deleted?'deleted':'open';await tx.put(C.private_rooms,id,state);for(let seq=1;seq<=total;seq++){const key='d:fixture:'+seq;await tx.put(C.private_messages,messageKey(seq),{sequence:seq,cursor:String(state.epoch)+':'+seq,sender:{id:'mock',nickname:'mock'},text:'mock body',client_message_id:String(seq),reply_to:null,created_at:new Date(now).toISOString(),dedupe_key:key});await tx.put(C.private_messages,key,{sequence:seq});}});
 }
 await repo.transaction('control',tx=>tx.put(C.private_rooms,'not-allowed',{})).then(()=>assert.fail('scope guard'),()=>{});
 await repo.transaction('control',tx=>tx.put(C.settings,'pending-room-reservation',{room_id:'not-initialized'}));
 const count=(id:string)=>repo.transaction('room:'+id,async tx=>({body:(await tx.list(C.private_messages,{prefix:'m:',limit:1000})).length,dedupe:(await tx.list(C.private_messages,{prefix:'d:',limit:1000})).length}));
 now+=70000;const pages=[];let after:string|undefined;let restored=0;
 do{const page=await repo.listPrivateRoomIds({limit:1,after});pages.push(page.ids.length);assert(page.ids.every(id=>['restore-aged','restore-deleted'].includes(id)));for(const id of page.ids){await registry.restoreRoom(id);restored++;}after=page.next;}while(after);
 assert.equal(restored,2);assert.deepEqual(pages,[1,1,0]);assert.deepEqual(await count('restore-aged'),{body:1,dedupe:1});assert.deepEqual(await count('restore-deleted'),{body:0,dedupe:0});
 // The expired body batch is followed by the existing timer, without any room request.
 now+=1000;for(let n=0;n<75;n++){await new Promise(r=>setTimeout(r,20));if((await count('restore-aged')).body===0)break;}
 assert.deepEqual(await count('restore-aged'),{body:0,dedupe:0});assert.deepEqual(await repo.listPrivateRoomIds({limit:100}),{ids:[]});
 await assert.rejects(repo.listPrivateRoomIds({limit:101}),/INVALID_MAINTENANCE_PAGE/);
 await assert.rejects(registry.restoreRoom('not-initialized'),e=>(e as {status:number}).status===404);
 assert.equal(await repo.transaction('room:not-initialized',tx=>tx.get(C.private_rooms,'not-initialized')),undefined);
 registry.shutdown();assert.equal(registry.diagnostics().timers,0);return {restored,pages,final_body_rows:0,final_dedupe_rows:0,timers:0,uninitialized_rows:0};
 }finally{registry.shutdown();}
}
