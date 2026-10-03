import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {RepositoryError,type RepositoryPort,type RecordTransaction} from './repository';
import {TargetedTransaction,executeTransaction,transactionFailure,validateScope,type RecordDriver} from './record-transaction';
import {MIGRATION_VERSION as VERSION,MIGRATION_CHECKSUM as CHECKSUM,TABLES} from './schema';
const nesting=new AsyncLocalStorage<boolean>();
function schemaState(db:DatabaseSync):'blank'|'ready' {
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  if(!tables.length)return 'blank';
  if(tables.length!==2||tables.some(name=>!TABLES.includes(name as typeof TABLES[number])))throw new RepositoryError('SCHEMA_CONFLICT');
  const rows=db.prepare('SELECT version,checksum FROM tok_migrations').all();
  if(rows.length!==1||rows[0].version!==VERSION||rows[0].checksum!==CHECKSUM)throw new RepositoryError('SCHEMA_CONFLICT');
  const columns=db.prepare('PRAGMA table_info(tok_records)').all().map(r=>r.name).join(',');
  if(columns!=='scope,collection,key,value_json')throw new RepositoryError('SCHEMA_CONFLICT');return 'ready';
}
export function checkSQLite(path:string):'blank'|'ready' {
  if(!existsSync(path))return 'blank';const db=new DatabaseSync(path,{readOnly:true});try{return schemaState(db);}catch(error){throw error instanceof RepositoryError?error:new RepositoryError('SCHEMA_CONFLICT');}finally{db.close();}
}
export function applySQLite(path:string):void {
  if(checkSQLite(path)==='ready')return;const db=new DatabaseSync(path,{timeout:5000});
  try{db.exec('BEGIN IMMEDIATE');if(schemaState(db)==='blank'){
    db.exec('CREATE TABLE tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)');
    db.prepare('INSERT INTO tok_migrations(version,checksum) VALUES (?,?)').run(VERSION,CHECKSUM);
  }db.exec('COMMIT');}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error instanceof RepositoryError?error:new RepositoryError('SCHEMA_CONFLICT');}finally{db.close();}
}
export class SQLiteRepository implements RepositoryPort {
  private readonly db:DatabaseSync;private tail:Promise<void>=Promise.resolve();private closed=false;
  constructor(path:string){if(checkSQLite(path)!=='ready')throw new RepositoryError('SCHEMA_NOT_READY');this.db=new DatabaseSync(path,{timeout:5000,enableForeignKeyConstraints:true});this.db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');}
  ready(){return !this.closed&&this.db.isOpen;}
  async transaction<T>(scope:string,fn:(tx:RecordTransaction)=>Promise<T>):Promise<T> {
    if(nesting.getStore())throw new RepositoryError('NESTED_TRANSACTION');validateScope(scope);
    const operation=this.tail.then(()=>nesting.run(true,async()=>{
      if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');this.db.exec('BEGIN IMMEDIATE');
      const driver:RecordDriver={
        get:async(c,key)=>{const row=this.db.prepare('SELECT value_json FROM tok_records WHERE scope=? AND collection=? AND key=?').get(scope,c,key);return row?.value_json as string|undefined;},
        put:async(c,key,value)=>{this.db.prepare('INSERT INTO tok_records(scope,collection,key,value_json) VALUES (?,?,?,?) ON CONFLICT(scope,collection,key) DO UPDATE SET value_json=excluded.value_json').run(scope,c,key,value);},
        delete:async(c,key)=>{this.db.prepare('DELETE FROM tok_records WHERE scope=? AND collection=? AND key=?').run(scope,c,key);},
        list:async(c,o)=>this.db.prepare("SELECT key,value_json FROM tok_records WHERE scope=? AND collection=? AND (? IS NULL OR key LIKE ? ESCAPE '\\') AND (? IS NULL OR key>?) ORDER BY key LIMIT ?").all(scope,c,o.prefix??null,o.prefix===undefined?null:o.prefix.replace(/[\\%_]/g,'\\$&')+'%',o.after??null,o.after??null,o.limit) as {key:string;value_json:string}[],
      };
      const tx=new TargetedTransaction(scope,driver);
      try{const result=await executeTransaction(tx,fn);this.db.exec('COMMIT');return result;}catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw transactionFailure(error);}finally{tx.end();}
    }));this.tail=operation.then(()=>{},()=>{});return operation;
  }
  async backupTo(path:string):Promise<void>{await this.tail;if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');await backup(this.db,path);}
  async close(){this.closed=true;await this.tail;this.db.close();}
}
