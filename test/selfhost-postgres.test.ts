import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {once} from 'node:events';
import {PostgresRepository} from '../src/storage/postgres';
import {RecordCollection as C,RepositoryError} from '../src/storage/repository';
const {Pool}=createRequire(join(process.cwd(),'selfhost/package.json'))('pg') as typeof import('pg');
test('isolated PG owner and scoped transactions serialize two connections, rollback and preserve unrelated schema',async()=>{
 const name='toktok-pg-fixture-'+process.pid;
 const processFixture=spawn('docker',['run','--rm','--name',name,'-e','POSTGRES_PASSWORD=mock-fixture-only','-e','POSTGRES_DB=toktok_selfhost_test','-p','127.0.0.1::5432','postgres:16-alpine'],{stdio:['ignore','ignore','ignore']});
 let pool:InstanceType<typeof Pool>|undefined,repo:PostgresRepository|undefined;
 try{
  console.log(JSON.stringify({phase:'fixture-start'}));
  let port='';for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,100));try{port=execFileSync('docker',['port',name,'5432/tcp'],{stdio:['ignore','pipe','ignore']}).toString().trim().split(':').at(-1)!;if(port)break;}catch{}}
  assert(port);console.log(JSON.stringify({phase:'fixture-port-ready'}));const config={connectionString:'postgresql://postgres:mock-fixture-only@127.0.0.1:'+port+'/toktok_selfhost_test',max:4,connectionTimeoutMillis:1000};pool=new Pool(config);pool.on('error',()=>{});
  for(let n=0;n<60;n++){try{await pool.query('SELECT 1');break;}catch{if(n===59)throw new Error('FIXTURE_START_FAILED');await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
  console.log(JSON.stringify({phase:'empty-db-confirmed'}));
  repo=new PostgresRepository(pool,'toktok_test','toktok');assert.equal(await repo.check(),'blank');await repo.apply();await repo.acquire();
  const competingPool=new Pool(config),competing=new PostgresRepository(competingPool,'toktok_test','other-deployment');await assert.rejects(competing.acquire(),/OWNER_CONFLICT/);await competing.close();
  await repo.transaction('control',async tx=>{await tx.put(C.budgets,'quota',{used:0});await tx.put(C.invitations,'one',{remaining:1});await tx.put(C.settings,'revision',{value:1});});
  const actors=await Promise.all(Array.from({length:2},()=>repo!.transaction('control',async tx=>{const q=(await tx.get(C.budgets,'quota'))!;if(q.used!==0)return false;await tx.put(C.budgets,'quota',{used:1});await tx.put(C.invitations,'one',{remaining:0});await tx.put(C.settings,'revision',{value:2});return true;})));console.log(JSON.stringify({phase:'atomic-race',winners:actors.filter(Boolean).length}));assert.equal(actors.filter(Boolean).length,1);
  await assert.rejects(repo.transaction('control',async tx=>{await tx.put(C.budgets,'quota',{used:99});throw new RepositoryError('ROLLBACK_PROBE');}),/ROLLBACK_PROBE/);assert.equal(await repo.transaction('control',async tx=>(await tx.get(C.budgets,'quota'))!.used),1);
  await assert.rejects(repo.transaction('control',async()=>repo!.transaction('control',async()=>1)),/NESTED_TRANSACTION/);
  await pool.query('CREATE SCHEMA unrelated;CREATE TABLE unrelated.keep(value TEXT);INSERT INTO unrelated.keep VALUES ($$keep$$)');
  const otherPool=new Pool(config),other=new PostgresRepository(otherPool,'unrelated','toktok');await assert.rejects(other.apply(),/SCHEMA_CONFLICT/);await other.close();assert.equal((await pool.query('SELECT value FROM unrelated.keep')).rows[0].value,'keep');
  const owner=(await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted")).rows[0];assert(owner);await pool.query('SELECT pg_terminate_backend($1)',[owner.pid]);await new Promise(r=>setTimeout(r,100));assert.equal(repo.ready(),false);await assert.rejects(repo.transaction('control',async()=>1),/REPOSITORY_UNAVAILABLE/);
 }finally{if(repo)await repo.close();else await pool?.end();try{execFileSync('docker',['stop','-t','1',name],{stdio:'ignore'});}catch{}if(processFixture.exitCode===null&&processFixture.signalCode===null)await once(processFixture,'exit');console.log(JSON.stringify({phase:'fixture-recovered',exit_code:processFixture.exitCode,signal:processFixture.signalCode}));}
});
