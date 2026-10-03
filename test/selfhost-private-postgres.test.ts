import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {once} from 'node:events';
import {PostgresRepository} from '../src/storage/postgres';
import {PrivateRoomCore} from '../src/private-core';
import {privateSnapshot} from './selfhost-private-fixture';
import {TEST_BUDGET} from './selfhost-budget';
const {Pool}=createRequire(join(process.cwd(),'selfhost/package.json'))('pg') as typeof import('pg');
test('isolated PG recent buffer and opt-in history preserve epoch on restart',async()=>{
 const name='toktok-private-pg-'+process.pid,child=spawn('docker',['run','--rm','--name',name,'-e','POSTGRES_PASSWORD=mock-fixture-only','-e','POSTGRES_DB=toktok_private_test','-p','127.0.0.1::5432','postgres:16-alpine'],{stdio:'ignore'});let pool:InstanceType<typeof Pool>|undefined,repo:PostgresRepository|undefined;const cores:PrivateRoomCore[]=[];
 try{
 let port='';for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,100));try{port=execFileSync('docker',['port',name,'5432/tcp'],{stdio:['ignore','pipe','ignore']}).toString().trim().split(':').at(-1)!;if(port)break;}catch{}}assert(port);
 pool=new Pool({connectionString:'postgresql://postgres:mock-fixture-only@127.0.0.1:'+port+'/toktok_private_test',max:4,connectionTimeoutMillis:1000});pool.on('error',()=>{});
 for(let n=0;n<60;n++){try{await pool.query('SELECT 1');break;}catch{if(n===59)throw new Error('FIXTURE_START_FAILED');await new Promise(r=>setTimeout(r,100));}}
 assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
 repo=new PostgresRepository(pool,'toktok_test','fixture');await repo.apply();await repo.acquire();
 for(const persist of [false,true]){
 const {snapshot,tokens}=await privateSnapshot(persist?'persist-room':'memory-room',persist),make=()=>{const c=new PrivateRoomCore({origin:'http://localhost:18794',repo:repo!,budget:TEST_BUDGET});cores.push(c);return c;},core=make();await core.initialize(snapshot);
 const call=(c:PrivateRoomCore,path:string,method='GET',data?:object,token=tokens.read)=>c.fetch(new Request('http://localhost:18794/api/v1/rooms/'+snapshot.id+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}));
 const joined=await call(core,'/participants','POST',{nickname:'mock',client_request_id:'one',notice_version:snapshot.notice_version,visibility:'private',retention_mode:persist?'persisted':'recent_buffer'},tokens.invite);assert.equal(joined.status,201);const participant=(await joined.json()).participant_token;
 const posted=await call(core,'/messages','POST',{text:'mock body',client_message_id:'one'},participant);assert.equal(posted.status,201);const message=await posted.json();core.shutdown();const next=make(),page=await call(next,'/messages?after='+encodeURIComponent(message.cursor.split(':')[0]+':0'));assert.equal(page.status,200);const data=await page.json();
 const rows:number=(await pool.query("SELECT COUNT(*)::int AS n FROM toktok_test.tok_records WHERE scope=$1 AND collection=$2 AND key LIKE 'm:%'",['room:'+snapshot.id,persist?'private_messages':'recent_messages'])).rows[0].n;assert.equal(rows,1);assert.equal(data.messages.length,1);assert.equal(data.history_status,'ok');

 console.log(JSON.stringify({phase:'private-pg',persist,body_rows:rows,messages:data.messages.length,history_status:data.history_status}));
 }
 }finally{for(const c of cores)c.shutdown();if(repo)await repo.close();else await pool?.end();try{execFileSync('docker',['stop','-t','1',name],{stdio:'ignore'});}catch{}if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');console.log(JSON.stringify({phase:'private-pg-recovered',exit_code:child.exitCode}));}
});
