import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
import {PostgresRepository} from '../src/storage/postgres';
import {RecordCollection as C, type RepositoryPort} from '../src/storage/repository';
import {TargetedTransaction} from '../src/storage/record-transaction';
import {HttpError} from '../src/http';
async function domainProbe(repo:RepositoryPort){
 const statuses:number[]=[];
 for(const status of [403,409,429]){const domain=new HttpError(status,'DOMAIN_'+status,'mock domain');await assert.rejects(repo.transaction('control',async tx=>{await tx.put(C.budgets,'domain',{used:status});throw domain;}),e=>e===domain);assert.equal(await repo.transaction('control',async tx=>await tx.get(C.budgets,'domain')),undefined);statuses.push(status);}
 console.log(JSON.stringify({phase:'domain-rollback',statuses}));
}
test('SQLite domain 403/409/429 survive rollback and SQL driver errors remain scrubbed',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'toktok-domain-'));try{const path=join(dir,'db');applySQLite(path);const repo=new SQLiteRepository(path);try{await domainProbe(repo);}finally{await repo.close();}
 const tx=new TargetedTransaction('control',{get:async()=>{throw new Error('mock DSN secret SQL');},put:async()=>{},delete:async()=>{},list:async()=>[]});await assert.rejects(tx.get(C.budgets,'one'),e=>e instanceof Error&&e.message==='DRIVER_FAILED');tx.end();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('isolated PG domain 403/409/429 survive rollback on selected transaction path',async()=>{
 const {Pool}=createRequire(join(process.cwd(),'selfhost/package.json'))('pg') as typeof import('pg');
 const name='toktok-pg-domain-'+process.pid,child=spawn('docker',['run','--rm','--name',name,'-e','POSTGRES_PASSWORD=mock-fixture-only','-e','POSTGRES_DB=toktok_domain_test','-p','127.0.0.1::5432','postgres:16-alpine'],{stdio:'ignore'});let repo:PostgresRepository|undefined,pool:InstanceType<typeof Pool>|undefined;
 try{let port='';for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));try{port=execFileSync('docker',['port',name,'5432/tcp'],{stdio:['ignore','pipe','ignore']}).toString().trim().split(':').at(-1)!;if(port)break;}catch{}}assert(port);
 pool=new Pool({connectionString:'postgresql://postgres:mock-fixture-only@127.0.0.1:'+port+'/toktok_domain_test',connectionTimeoutMillis:1000,max:4});pool.on('error',()=>{});
 for(let i=0;i<60;i++){try{await pool.query('SELECT 1');break;}catch{if(i===59)throw new Error('FIXTURE_START_FAILED');await new Promise(r=>setTimeout(r,100));}}
 assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
 repo=new PostgresRepository(pool,'toktok_domain','toktok');await repo.apply();await repo.acquire();await domainProbe(repo);
 }finally{if(repo)await repo.close();else await pool?.end();try{execFileSync('docker',['stop','-t','1',name],{stdio:'ignore'});}catch{}if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');console.log(JSON.stringify({phase:'domain-fixture-recovered',exit_code:child.exitCode}));}
});
