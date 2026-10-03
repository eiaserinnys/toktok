import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {once} from 'node:events';
import {PostgresRepository} from '../src/storage/postgres';
import {privateLifetimeContract} from './private-lifetime-contract';


const {Pool}=createRequire(join(process.cwd(),'selfhost/package.json'))('pg') as typeof import('pg');
test('isolated PG verifies permanent lifetime and demo budget separation',async()=>{
 const name='toktok-private-pg-'+process.pid,child=spawn('docker',['run','--rm','--name',name,'-e','POSTGRES_PASSWORD=mock-fixture-only','-e','POSTGRES_DB=toktok_private_test','-p','127.0.0.1::5432','postgres:16-alpine'],{stdio:'ignore'});let pool:InstanceType<typeof Pool>|undefined,repo:PostgresRepository|undefined;
 try{
 let port='';for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,100));try{port=execFileSync('docker',['port',name,'5432/tcp'],{stdio:['ignore','pipe','ignore']}).toString().trim().split(':').at(-1)!;if(port)break;}catch{}}assert(port);
 pool=new Pool({connectionString:'postgresql://postgres:mock-fixture-only@127.0.0.1:'+port+'/toktok_private_test',max:4,connectionTimeoutMillis:1000});pool.on('error',()=>{});
 for(let n=0;n<60;n++){try{await pool.query('SELECT 1');break;}catch{if(n===59)throw new Error('FIXTURE_START_FAILED');await new Promise(r=>setTimeout(r,100));}}
 assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
 repo=new PostgresRepository(pool,'toktok_test','fixture');await repo.apply();await repo.acquire();
 console.log('PRIVATE_LIFETIME_PG '+JSON.stringify(await privateLifetimeContract(repo)));
 }finally{if(repo)await repo.close();else await pool?.end();try{execFileSync('docker',['stop','-t','1',name],{stdio:'ignore'});}catch{}if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');console.log(JSON.stringify({phase:'private-pg-recovered',exit_code:child.exitCode}));}
});
