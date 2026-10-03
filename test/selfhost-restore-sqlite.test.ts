import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SQLiteRepository,checkSQLite,applySQLite,migrateSQLite} from '../src/storage/sqlite';
import {MIGRATION_VERSION,MIGRATION_CHECKSUM} from '../src/storage/schema';
import {NODE_MIGRATION_VERSION,NODE_MIGRATION_CHECKSUM,PRIVATE_ROOM_INDEX} from '../src/storage/node-maintenance';
import {RecordCollection as C} from '../src/storage/repository';
import {restoreFixture} from './selfhost-restore-fixture';
test('SQLite explicit v1 migration preserves data and startup restores metadata-only body cleanup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'toktok-restore-')),file=join(dir,'test.sqlite');let repo:SQLiteRepository|undefined;
 try{
 const db=new DatabaseSync(file);db.exec('CREATE TABLE tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)');db.prepare('INSERT INTO tok_migrations VALUES (?,?)').run(MIGRATION_VERSION,MIGRATION_CHECKSUM);db.prepare('INSERT INTO tok_records VALUES (?,?,?,?)').run('control','settings','preserved','{"revision":7}');db.close();
 assert.throws(()=>checkSQLite(file),/MIGRATION_REQUIRED/);assert.throws(()=>applySQLite(file),/MIGRATION_REQUIRED/);assert.throws(()=>new SQLiteRepository(file),/MIGRATION_REQUIRED/);
 const old=new DatabaseSync(file,{readOnly:true});assert.equal(old.prepare('SELECT version FROM tok_migrations').get()!.version,1);old.close();migrateSQLite(file);assert.equal(checkSQLite(file),'ready');repo=new SQLiteRepository(file);assert.deepEqual(await repo.transaction('control',tx=>tx.get(C.settings,'preserved')),{revision:7});
 const result=await restoreFixture(repo);await repo.close();repo=undefined;
 const current=new DatabaseSync(file);assert.deepEqual({...current.prepare('SELECT version,checksum FROM tok_migrations').get()},{version:NODE_MIGRATION_VERSION,checksum:NODE_MIGRATION_CHECKSUM});current.exec('DROP INDEX '+PRIVATE_ROOM_INDEX);current.close();assert.throws(()=>checkSQLite(file),/SCHEMA_CONFLICT/);
 const unrelated=join(dir,'unrelated.sqlite'),other=new DatabaseSync(unrelated);other.exec('CREATE TABLE unrelated(value TEXT);INSERT INTO unrelated VALUES (\'mock\')');other.close();assert.throws(()=>migrateSQLite(unrelated),/SCHEMA_CONFLICT/);const preserved=new DatabaseSync(unrelated,{readOnly:true});assert.equal(preserved.prepare('SELECT count(*) AS n FROM unrelated').get()!.n,1);preserved.close();
 const fresh=join(dir,'fresh.sqlite');applySQLite(fresh);assert.equal(checkSQLite(fresh),'ready');console.log(JSON.stringify({phase:'sqlite-startup-restore',migration:'explicit-v1-v2',legacy_start_closed:true,index_corruption_closed:true,unrelated_rows:1,fresh_version:2,...result}));
 }finally{await repo?.close();rmSync(dir,{recursive:true,force:true});}
});
