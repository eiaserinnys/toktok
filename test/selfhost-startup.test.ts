import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {applySQLite,SQLiteRepository} from '../src/storage/sqlite';
import {PRIVATE_ROOM_INDEX} from '../src/storage/node-maintenance';
import {RecordCollection as C} from '../src/storage/repository';
import {openBackend} from '../src/selfhost/backend';
import {createApplication} from '../src/selfhost/application';
import {PrivateRoomCore} from '../src/private-core';
import {messageKey} from '../src/private-state';
import {privateSnapshot} from './selfhost-private-fixture';
import {TEST_BUDGET} from './selfhost-budget';
import {MIGRATION_VERSION,MIGRATION_CHECKSUM} from '../src/storage/schema';

test('explicit backend migration precedes startup retention restore and readiness',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'toktok-startup-')),file=join(dir,'db');let app:ReturnType<typeof createApplication>|undefined;
 try{
  applySQLite(file);const original=new SQLiteRepository(file),now=Date.now()-120000;
  const {snapshot}=await privateSnapshot('startup-retained',true,now);snapshot.expires_at=now+60000;
  const core=new PrivateRoomCore({origin:'http://localhost',repo:original,budget:TEST_BUDGET,clock:()=>now});await core.initialize(snapshot);core.shutdown();
  await original.transaction('room:'+snapshot.id,async tx=>{
   const state=(await tx.get(C.private_rooms,snapshot.id))!;state.sequence=1;state.body_count=1;await tx.put(C.private_rooms,snapshot.id,state);
   await tx.put(C.private_messages,messageKey(1),{sequence:1,text:'mock retained body',created_at:new Date(now).toISOString(),dedupe_key:'d:fixture'});await tx.put(C.private_messages,'d:fixture',{sequence:1});
  });await original.close();
  // Build an exact v1 fixture; startup/apply must not silently change its schema.
  const legacy=new DatabaseSync(file);legacy.exec('DROP INDEX '+PRIVATE_ROOM_INDEX);legacy.prepare('UPDATE tok_migrations SET version=?,checksum=?').run(MIGRATION_VERSION,MIGRATION_CHECKSUM);legacy.close();
  const options={backend:'sqlite' as const,sqliteFile:file};
  for(const cmd of ['check','apply','start'] as const)await assert.rejects(openBackend(options,cmd),/MIGRATION_REQUIRED/);
  assert.deepEqual(await openBackend(options,'migrate'),{state:'ready'});
  const {repo}=await openBackend(options,'start');assert(repo);
  const list=repo.listPrivateRoomIds.bind(repo);let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});let calls=0;
  repo.listPrivateRoomIds=async options=>{calls++;await hold;return list(options);};
  app=createApplication({origin:'http://localhost',repo,budget:TEST_BUDGET});
  assert.equal(app.server.listening,false);const before=await app.app.fetch(new Request('http://localhost/ready'));assert.equal(before.status,503);await before.arrayBuffer();
  release();await app.prepare();assert(calls>0);
  assert.equal((await repo.transaction('room:'+snapshot.id,tx=>tx.list(C.private_messages,{limit:10}))).length,0);
  assert.deepEqual(app.privateRooms.diagnostics(),{rooms:0,timers:0});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const address=app.server.address();assert(address&&typeof address==='object');
  const ready=await fetch(`http://127.0.0.1:${address.port}/ready`);assert.equal(ready.status,200);await ready.arrayBuffer();
 }finally{await app?.stop();rmSync(dir,{recursive:true,force:true});}
});
