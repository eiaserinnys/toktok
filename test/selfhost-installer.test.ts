import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {SQLiteRepository} from '../src/storage/sqlite';
import {RecordCollection as C} from '../src/storage/repository';
import {ControlCore} from '../src/control-core';
import {demoInstallationProfile} from '../src/installation-profile';
async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const a=s.address();assert(a&&typeof a==='object');const port=a.port;await new Promise<void>(r=>s.close(()=>r()));return port;}
async function ended(child:ChildProcess){if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');}
test('isolated installer requires explicit apply, runs SQLite without PG, rejects second owner and restores consistent backup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'toktok-install-')),file=join(dir,'db'),port=await freePort();const children:ChildProcess[]=[];
 try{mkdirSync(join(dir,'dist'));mkdirSync(join(dir,'scripts'));
 execFileSync('selfhost/node_modules/.bin/esbuild',['src/selfhost/main.ts','--bundle','--platform=node','--format=esm','--external:pg','--external:nodemailer','--outfile='+join(dir,'dist/main.mjs')],{stdio:'pipe'});
 copyFileSync('selfhost/scripts/entrypoint.sh',join(dir,'scripts/entrypoint.sh'));copyFileSync('selfhost/scripts/selfhost-setup',join(dir,'scripts/selfhost-setup'));
 const env:NodeJS.ProcessEnv={...process.env,PATH:dirname(process.execPath)+':'+process.env.PATH,TOKTOK_BACKEND:'sqlite',TOKTOK_SQLITE_FILE:file,PUBLIC_ORIGIN:'http://localhost:'+port,PORT:String(port)};
 delete env.TOKTOK_PG_DSN;delete env.TOKTOK_DSN_FILE;delete env.TOKTOK_SMTP_CONFIG_FILE;delete env.ADMIN_BOOTSTRAP_EMAIL;
 const command=(name:string,extra:Record<string,string>={})=>execFileSync('sh',['scripts/selfhost-setup',name],{cwd:dir,env:{...env,...extra},stdio:['ignore','pipe','pipe']}).toString();
 assert.equal(JSON.parse(command('check')).state,'blank');assert.throws(()=>execFileSync('sh',['scripts/entrypoint.sh','start'],{cwd:dir,env,stdio:'pipe'}));assert.equal(JSON.parse(command('apply')).state,'ready');
 const repo=new SQLiteRepository(file);const core=new ControlCore(repo,{installation:{profile:demoInstallationProfile(),enforcement_version:1},enforcement:{version:1,ready:()=>repo.ready()}});await core.execute('get-runtime-config',{});await repo.transaction('control',async tx=>{await tx.put(C.sessions,'mock',{valid:true});await tx.put(C.invitations,'mock',{remaining:1});});await repo.close();
 const start=async()=>{const child=spawn('sh',['scripts/entrypoint.sh','start'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});children.push(child);let stderr='';child.stderr?.on('data',v=>{stderr+=String(v);});child.stdout?.resume();for(let n=0;n<80;n++){try{const r=await fetch('http://127.0.0.1:'+port+'/ready');await r.arrayBuffer();if(r.status===200)return {child,stderr:()=>stderr};}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}throw new Error('FIXTURE_READY_FAILED');};
 const first=await start();const catalog=await (await fetch('http://127.0.0.1:'+port+'/api/public/rooms')).json() as {rooms:unknown[]};assert.equal(catalog.rooms.length,demoInstallationProfile().public.catalog.filter(r=>r.enabled).length);
 const second=spawn('sh',['scripts/entrypoint.sh','start'],{cwd:dir,env,stdio:'ignore'});children.push(second);await ended(second);assert.notEqual(second.exitCode,0);
 const stopped=Date.now();first.child.kill('SIGTERM');await ended(first.child);assert(Date.now()-stopped<25000);assert.equal(JSON.parse(command('backup',{TOKTOK_BACKUP_FILE:join(dir,'backup')})).state,'ready');
 const again=await start();again.child.kill('SIGTERM');await ended(again.child);
 const restored=join(dir,'restored');copyFileSync(join(dir,'backup'),restored);const db=new DatabaseSync(restored,{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tok_records WHERE collection='sessions'").get()?.n,1);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tok_records WHERE collection='private_messages'").get()?.n,0);db.close();
 assert(!first.stderr().includes('mock'));assert(!first.stderr().includes('postgresql://'));console.log(JSON.stringify({phase:'installer-recovered',sqlite_without_pg:true,second_owner_rejected:true,shutdown_ms:Date.now()-stopped,backup_integrity:'ok'}));
 }finally{for(const child of children){if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await ended(child);}}rmSync(dir,{recursive:true,force:true});}
});
