import {AsyncLocalStorage} from 'node:async_hooks';
import {RepositoryError,type RepositoryPort,type RecordTransaction} from './repository';
import {TargetedTransaction,executeTransaction,transactionFailure,validateScope,type RecordDriver} from './record-transaction';
import {MIGRATION_VERSION as VERSION,MIGRATION_CHECKSUM as CHECKSUM,TABLES} from './schema';
export type CloudflareSqlValue=ArrayBuffer|string|number|null;
export interface CloudflareRecordStorage {
  sql:{exec<T extends Record<string,CloudflareSqlValue>>(query:string,...bindings:(string|number|null)[]):{toArray():T[]}};
  transaction<T>(fn:()=>Promise<T>):Promise<T>;
}
const nesting=new AsyncLocalStorage<boolean>();
/** No DO emulation. Requires SQLite-class DO and nodejs_als/nodejs_compat in the owning Worker. */
export class CloudflareRepository implements RepositoryPort {
  private closed=false;
  constructor(private readonly storage:CloudflareRecordStorage){}
  private rows<T extends Record<string,CloudflareSqlValue>>(sql:string,...bindings:(string|number|null)[]):T[]{return this.storage.sql.exec<T>(sql,...bindings).toArray();}
  check():'blank'|'ready' {
    const tables=this.rows<{name:string}>("SELECT name FROM sqlite_master WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%' AND name!='__cf_kv' ORDER BY name");
    if(!tables.length)return 'blank';if(tables.length!==2||tables.some(r=>!TABLES.includes(r.name as typeof TABLES[number])))throw new RepositoryError('SCHEMA_CONFLICT');
    const marker=this.rows<{version:number;checksum:string}>('SELECT version,checksum FROM tok_migrations');
    if(marker.length!==1||marker[0].version!==VERSION||marker[0].checksum!==CHECKSUM)throw new RepositoryError('SCHEMA_CONFLICT');
    const columns=this.rows<{name:string}>('PRAGMA table_info(tok_records)').map(r=>r.name).join(',');if(columns!=='scope,collection,key,value_json')throw new RepositoryError('SCHEMA_CONFLICT');return 'ready';
  }
  async apply(){await this.storage.transaction(async()=>{if(this.check()==='blank'){this.rows('CREATE TABLE tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)');this.rows('INSERT INTO tok_migrations VALUES (?,?)',VERSION,CHECKSUM);}});}
  ready(){return !this.closed&&this.check()==='ready';}
  async transaction<T>(scope:string,fn:(tx:RecordTransaction)=>Promise<T>):Promise<T>{
    if(nesting.getStore())throw new RepositoryError('NESTED_TRANSACTION');validateScope(scope);if(!this.ready())throw new RepositoryError('SCHEMA_NOT_READY');
    try{return await this.storage.transaction(()=>nesting.run(true,async()=>{
      const driver:RecordDriver={
        get:async(c,key)=>this.rows<{value_json:string}>('SELECT value_json FROM tok_records WHERE scope=? AND collection=? AND key=?',scope,c,key)[0]?.value_json,
        put:async(c,key,value)=>{this.rows('INSERT INTO tok_records VALUES (?,?,?,?) ON CONFLICT(scope,collection,key) DO UPDATE SET value_json=excluded.value_json',scope,c,key,value);},
        delete:async(c,key)=>{this.rows('DELETE FROM tok_records WHERE scope=? AND collection=? AND key=?',scope,c,key);},
        list:async(c,o)=>this.rows<{key:string;value_json:string}>("SELECT key,value_json FROM tok_records WHERE scope=? AND collection=? AND (? IS NULL OR key LIKE ? ESCAPE '\\') AND (? IS NULL OR key>?) ORDER BY key LIMIT ?",scope,c,o.prefix??null,o.prefix===undefined?null:o.prefix.replace(/[\\%_]/g,'\\$&')+'%',o.after??null,o.after??null,o.limit),
      };const tx=new TargetedTransaction(scope,driver);try{return await executeTransaction(tx,fn);}finally{tx.end();}
    }));}catch(e){throw transactionFailure(e);}
  }
  async close(){this.closed=true;}
}
