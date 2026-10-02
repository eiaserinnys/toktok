import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SQLiteRepository,applySQLite,checkSQLite} from '../src/storage/sqlite';
import {RecordCollection as C,RepositoryError,TRANSACTION_LIMITS} from '../src/storage/repository';

test('SQLite setup preserves unrelated DB, requires explicit apply and validates marker',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'toktok-sqlite-'));try{
    const path=join(dir,'db.sqlite');assert.equal(checkSQLite(path),'blank');
    assert.throws(()=>new SQLiteRepository(path),/SCHEMA_NOT_READY/);applySQLite(path);assert.equal(checkSQLite(path),'ready');
    const db=new DatabaseSync(path);db.exec("UPDATE tok_migrations SET checksum='wrong'");db.close();assert.throws(()=>checkSQLite(path),/SCHEMA_CONFLICT/);
    const other=join(dir,'other.sqlite'),unrelated=new DatabaseSync(other);unrelated.exec('CREATE TABLE unrelated(x TEXT);INSERT INTO unrelated VALUES (\'keep\')');unrelated.close();
    assert.throws(()=>applySQLite(other),/SCHEMA_CONFLICT/);const preserved=new DatabaseSync(other);assert.equal(preserved.prepare('SELECT x FROM unrelated').get()?.x,'keep');preserved.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('SQLite targeted async view clones records, rolls back and atomically resolves CAS/invite/quota',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'toktok-tx-')),path=join(dir,'db.sqlite');try{
    applySQLite(path);const repo=new SQLiteRepository(path);
    await repo.transaction('control',async tx=>{await tx.put(C.settings,'revision',{value:1});await tx.put(C.invitations,'one',{remaining:1});await tx.put(C.budgets,'quota',{used:0});});
    await assert.rejects(repo.transaction('control',async tx=>{await tx.put(C.settings,'revision',{value:99});throw new RepositoryError('ROLLBACK_PROBE');}),/ROLLBACK_PROBE/);
    assert.equal(await repo.transaction('control',async tx=>(await tx.get(C.settings,'revision'))?.value),1);
    const input={value:2};await repo.transaction('control',async tx=>await tx.put(C.settings,'cloned',input));input.value=999;
    assert.equal(await repo.transaction('control',async tx=>(await tx.get(C.settings,'cloned'))?.value),2);
    await assert.rejects(repo.transaction('control',async tx=>{await tx.put(C.settings,'bad',{value:1});return repo.transaction('control',async()=>1);}),/NESTED_TRANSACTION/);
    assert.equal(await repo.transaction('control',async tx=>await tx.get(C.settings,'bad')),undefined);
    const results=await Promise.all(Array.from({length:2},()=>repo.transaction('control',async tx=>{
      const row=(await tx.get(C.settings,'revision'))!;if(row.value!==1)return false;
      await tx.put(C.settings,'revision',{value:2});await tx.put(C.invitations,'one',{remaining:0});await tx.put(C.budgets,'quota',{used:1});return true;
    })));assert.equal(results.filter(Boolean).length,1);
    await assert.rejects(repo.transaction('control',async tx=>await tx.put(C.settings,'nan',{value:NaN})),/INVALID_JSON/);
    await assert.rejects(repo.transaction('control',async tx=>await tx.put(C.settings,'huge',{value:'x'.repeat(TRANSACTION_LIMITS.valueBytes)})),/TRANSACTION_LIMIT/);
    await assert.rejects(repo.transaction('control',async tx=>await tx.put(C.private_messages,'forbidden',{text:'mock'})),/SCOPE_DENIED/);
    await assert.rejects(repo.transaction('room:test',async tx=>await tx.put(C.private_messages,'forbidden',{text:'mock'})),/PERSIST_DENIED/);
    await repo.transaction('room:test',async tx=>{await tx.put(C.private_rooms,'test',{persist_authorized:true,retention_mode:'persist'});await tx.put(C.private_messages,'one',{text:'mock opted-in'});});
    await repo.close();const reopened=new SQLiteRepository(path);assert.equal(await reopened.transaction('room:test',async tx=>(await tx.list(C.private_messages,{limit:20})).length),1);await reopened.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
