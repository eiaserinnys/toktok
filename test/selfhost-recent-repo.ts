import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {SQLiteRepository,applySQLite} from '../src/storage/sqlite';
export function publicTestRepo(t:{after(fn:()=>Promise<void>):void}){const dir=mkdtempSync(join(tmpdir(),'toktok-public-test-')),file=join(dir,'records.sqlite');applySQLite(file);const repo=new SQLiteRepository(file);t.after(async()=>{await repo.close();rmSync(dir,{recursive:true,force:true});});return repo;}
