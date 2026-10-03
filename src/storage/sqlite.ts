import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {RepositoryError,type RepositoryPort,type RecordTransaction} from './repository';
import {TargetedTransaction,executeTransaction,transactionFailure,validateScope,type RecordDriver} from './record-transaction';
import {MIGRATION_VERSION as LEGACY_VERSION,MIGRATION_CHECKSUM as LEGACY_CHECKSUM,TABLES} from './schema';
import {NODE_MIGRATION_VERSION as VERSION,NODE_MIGRATION_CHECKSUM as CHECKSUM,PRIVATE_ROOM_INDEX,validateRoomIdPage,roomIdPage,type PrivateRoomIdOptions,type NodePrivateMaintenance} from './node-maintenance';
const nesting=new AsyncLocalStorage<boolean>();
function schemaState(db:DatabaseSync):'blank'|'legacy'|'ready' {
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 if(!tables.length)return 'blank';
 if(tables.length!==2||tables.some(name=>!TABLES.includes(name as typeof TABLES[number])))throw new RepositoryError('SCHEMA_CONFLICT');
 const expected=[['scope','TEXT',1,1],['collection','TEXT',1,2],['key','TEXT',1,3],['value_json','TEXT',1,0]];
 const columns=db.prepare('PRAGMA table_info(tok_records)').all().map(r=>[r.name,r.type,r.notnull,r.pk]);
 const markerColumns=db.prepare('PRAGMA table_info(tok_migrations)').all().map(r=>[r.name,r.type,r.notnull,r.pk]);
 if(JSON.stringify(columns)!==JSON.stringify(expected)||JSON.stringify(markerColumns)!==JSON.stringify([['version','INTEGER',0,1],['checksum','TEXT',1,0]]))throw new RepositoryError('SCHEMA_CONFLICT');
 const rows=db.prepare('SELECT version,checksum FROM tok_migrations').all();
 if(rows.length!==1)throw new RepositoryError('SCHEMA_CONFLICT');
 if(rows[0].version===LEGACY_VERSION&&rows[0].checksum===LEGACY_CHECKSUM)return 'legacy';
 if(rows[0].version!==VERSION||rows[0].checksum!==CHECKSUM)throw new RepositoryError('SCHEMA_CONFLICT');
 const indexes=db.prepare('PRAGMA index_list(tok_records)').all();
 const index=indexes.find(r=>r.name===PRIVATE_ROOM_INDEX);
 const keys=db.prepare('PRAGMA index_xinfo('+PRIVATE_ROOM_INDEX+')').all().filter(r=>r.key===1).map(r=>[r.name,r.coll,r.desc]);
 if(!index||index.unique!==0||index.partial!==0||index.origin!=='c'||JSON.stringify(keys)!==JSON.stringify([['collection','BINARY',0],['scope','BINARY',0],['key','BINARY',0]]))throw new RepositoryError('SCHEMA_CONFLICT');
 return 'ready';
}
function currentState(db:DatabaseSync):'blank'|'ready' {const state=schemaState(db);if(state==='legacy')throw new RepositoryError('MIGRATION_REQUIRED');return state;}
export function checkSQLite(path:string):'blank'|'ready' {
 if(!existsSync(path))return 'blank';const db=new DatabaseSync(path,{readOnly:true});try{return currentState(db);}catch(error){throw error instanceof RepositoryError?error:new RepositoryError('SCHEMA_CONFLICT');}finally{db.close();}
}
export function applySQLite(path:string):void {
 if(checkSQLite(path)==='ready')return;const db=new DatabaseSync(path,{timeout:5000});
 try{db.exec('BEGIN IMMEDIATE');if(currentState(db)==='blank'){
  db.exec('CREATE TABLE tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)');
  db.exec('CREATE INDEX '+PRIVATE_ROOM_INDEX+' ON tok_records(collection,scope,key)');
  db.prepare('INSERT INTO tok_migrations(version,checksum) VALUES (?,?)').run(VERSION,CHECKSUM);
 }currentState(db);db.exec('COMMIT');}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error instanceof RepositoryError?error:new RepositoryError('SCHEMA_CONFLICT');}finally{db.close();}
}
/** Explicit user migration command only; never called by startup/apply. Back up first. */
export function migrateSQLite(path:string):void {
 if(!existsSync(path))throw new RepositoryError('SCHEMA_NOT_READY');const db=new DatabaseSync(path,{timeout:5000});
 try{db.exec('BEGIN IMMEDIATE');const state=schemaState(db);if(state==='blank')throw new RepositoryError('SCHEMA_NOT_READY');if(state==='legacy'){
  db.exec('CREATE INDEX '+PRIVATE_ROOM_INDEX+' ON tok_records(collection,scope,key)');
  db.prepare('UPDATE tok_migrations SET version=?,checksum=? WHERE version=? AND checksum=?').run(VERSION,CHECKSUM,LEGACY_VERSION,LEGACY_CHECKSUM);
 }currentState(db);db.exec('COMMIT');}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error instanceof RepositoryError?error:new RepositoryError('SCHEMA_CONFLICT');}finally{db.close();}
}
export class SQLiteRepository implements RepositoryPort,NodePrivateMaintenance {
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
  async listPrivateRoomIds(options:PrivateRoomIdOptions){
    if(nesting.getStore())throw new RepositoryError('NESTED_TRANSACTION');validateRoomIdPage(options);
    const operation=this.tail.then(()=>{if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');try{
      // Cursor is fully consumed synchronously; only room ID leaves the adapter.
      const ids=this.db.prepare("SELECT key FROM tok_records WHERE collection='private_rooms' AND scope> ? AND scope < 'room;' AND scope='room:'||key AND json_extract(value_json,'$.snapshot.id')=key AND json_extract(value_json,'$.snapshot.persist')=1 AND json_extract(value_json,'$.body_count')>0 ORDER BY scope LIMIT ?").all('room:'+(options.after??''),options.limit).map(r=>String(r.key));
      return roomIdPage(ids,options.limit);
    }catch(error){throw transactionFailure(error);}});this.tail=operation.then(()=>{},()=>{});return operation;
  }
  async backupTo(path:string):Promise<void>{await this.tail;if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');await backup(this.db,path);}
  async close(){this.closed=true;await this.tail;this.db.close();}
}
