import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {once} from 'node:events';
import {PostgresRepository} from '../src/storage/postgres';
import {restoreFixture} from './selfhost-restore-fixture';
import {MIGRATION_VERSION,MIGRATION_CHECKSUM} from '../src/storage/schema';
import {RecordCollection as C} from '../src/storage/repository';
const {Pool}=createRequire(join(process.cwd(),'selfhost/package.json'))('pg') as typeof import('pg');
test('isolated PG explicit v1 migration and startup metadata-only retention cleanup',async()=>{
 const name='toktok-restore-pg-'+process.pid,child=spawn('docker',['run','--rm','--name',name,'-e','POSTGRES_PASSWORD=mock-fixture-only','-e','POSTGRES_DB=toktok_private_test','-p','127.0.0.1::5432','postgres:16-alpine'],{stdio:'ignore'});let pool:InstanceType<typeof Pool>|undefined,repo:PostgresRepository|undefined;
 try{
 let port='';for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,100));try{port=execFileSync('docker',['port',name,'5432/tcp'],{stdio:['ignore','pipe','ignore']}).toString().trim().split(':').at(-1)!;if(port)break;}catch{}}assert(port);
 pool=new Pool({connectionString:'postgresql://postgres:mock-fixture-only@127.0.0.1:'+port+'/toktok_private_test',max:4,connectionTimeoutMillis:1000});pool.on('error',()=>{});
 for(let n=0;n<60;n++){try{await pool.query('SELECT 1');break;}catch{if(n===59)throw new Error('FIXTURE_START_FAILED');await new Promise(r=>setTimeout(r,100));}}
 assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);

 await pool.query('CREATE SCHEMA toktok_restore;CREATE TABLE toktok_restore.tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE toktok_restore.tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)');await pool.query('INSERT INTO toktok_restore.tok_migrations VALUES ($1,$2)',[MIGRATION_VERSION,MIGRATION_CHECKSUM]);await pool.query('INSERT INTO toktok_restore.tok_records VALUES ($1,$2,$3,$4)',['control','settings','preserved','{"revision":7}']);
 repo=new PostgresRepository(pool,'toktok_restore','fixture');await assert.rejects(repo.check(),/MIGRATION_REQUIRED/);await assert.rejects(repo.apply(),/MIGRATION_REQUIRED/);await assert.rejects(repo.acquire(),/MIGRATION_REQUIRED/);assert.equal((await pool.query('SELECT version FROM toktok_restore.tok_migrations')).rows[0].version,1);await repo.migrate();assert.equal(await repo.check(),'ready');await repo.acquire();assert.deepEqual(await repo.transaction('control',tx=>tx.get(C.settings,'preserved')),{revision:7});const result=await restoreFixture(repo);
 await assert.rejects(repo.migrate(),/OWNER_CONFLICT/);
 await pool.query('DROP INDEX toktok_restore.tok_private_rooms_scan');await assert.rejects(repo.check(),/SCHEMA_CONFLICT/);
 await pool.query("CREATE SCHEMA unrelated_fixture;CREATE TABLE unrelated_fixture.unrelated(value TEXT);INSERT INTO unrelated_fixture.unrelated VALUES ('mock')");const conflict=new PostgresRepository(pool,'unrelated_fixture','fixture');await assert.rejects(conflict.migrate(),/SCHEMA_CONFLICT/);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM unrelated_fixture.unrelated')).rows[0].n,1);
 const fresh=new PostgresRepository(pool,'fresh_fixture','fixture');await fresh.apply();assert.equal(await fresh.check(),'ready');console.log(JSON.stringify({phase:'pg-startup-restore',migration:'explicit-v1-v2',legacy_start_closed:true,index_corruption_closed:true,unrelated_rows:1,fresh_version:2,...result}));
 }finally{if(repo)await repo.close();else await pool?.end();try{execFileSync('docker',['stop','-t','1',name],{stdio:'ignore'});}catch{}if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');console.log(JSON.stringify({phase:'restore-pg-recovered',exit_code:child.exitCode}));}
});
