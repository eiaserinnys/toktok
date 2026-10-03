import type {Pool,PoolClient} from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import {RepositoryError,type RepositoryPort,type RecordTransaction} from './repository';
import {TargetedTransaction,executeTransaction,transactionFailure,validateScope,type RecordDriver} from './record-transaction';
import {MIGRATION_VERSION as VERSION,MIGRATION_CHECKSUM as CHECKSUM,TABLES} from './schema';
const nesting=new AsyncLocalStorage<boolean>();
function identifier(schema:string):string{if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new RepositoryError('INVALID_SCHEMA');return '"'+schema+'"';}
async function state(client:PoolClient,schema:string):Promise<'blank'|'ready'> {
  const rows=(await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name',[schema])).rows;
  if(!rows.length)return 'blank';if(rows.length!==2||rows.some(r=>!TABLES.includes(r.table_name)))throw new RepositoryError('SCHEMA_CONFLICT');
  const marker=(await client.query(`SELECT version,checksum FROM ${identifier(schema)}.tok_migrations`)).rows;
  const columns=(await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,'tok_records'])).rows.map(r=>r.column_name).join(',');
  if(marker.length!==1||marker[0].version!==VERSION||marker[0].checksum!==CHECKSUM||columns!=='scope,collection,key,value_json')throw new RepositoryError('SCHEMA_CONFLICT');return 'ready';
}
/** Pool is constructed by the selected PG loader only. All errors crossing this boundary are sanitized. */
export class PostgresRepository implements RepositoryPort {
  private owner?:PoolClient;private available=false;private closed=false;
  constructor(private readonly pool:Pool,private readonly schema:string,private readonly deployment:string){identifier(schema);}
  private async connected<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{let client:PoolClient|undefined;try{client=await this.pool.connect();return await fn(client);}catch(e){throw transactionFailure(e);}finally{client?.release();}}
  async check(){return this.connected(c=>state(c,this.schema));}
  async apply():Promise<void>{await this.connected(async c=>{await c.query('BEGIN');try{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.schema+':migration']);
    if(await state(c,this.schema)==='blank'){const s=identifier(this.schema);await c.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);await c.query(`CREATE TABLE ${s}.tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE ${s}.tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)`);await c.query(`INSERT INTO ${s}.tok_migrations VALUES ($1,$2)`,[VERSION,CHECKSUM]);}
    await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}});}
  async acquire():Promise<void>{try{
    const owner=await this.pool.connect();this.owner=owner;
    owner.on('error',()=>{this.available=false;});owner.on('end',()=>{this.available=false;});
    const row=(await owner.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',['toktok-owner:'+this.schema])).rows[0];
    if(!row.acquired)throw new RepositoryError('OWNER_CONFLICT');if(await state(owner,this.schema)!=='ready')throw new RepositoryError('SCHEMA_NOT_READY');this.available=true;
  }catch(e){this.owner?.release(true);this.owner=undefined;throw e instanceof RepositoryError?e:new RepositoryError('REPOSITORY_UNAVAILABLE');}}
  ready(){return this.available&&!this.closed;}
  async transaction<T>(scope:string,fn:(tx:RecordTransaction)=>Promise<T>):Promise<T>{
    if(nesting.getStore())throw new RepositoryError('NESTED_TRANSACTION');validateScope(scope);if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');
    return this.connected(c=>nesting.run(true,async()=>{await c.query('BEGIN');const s=identifier(this.schema);let tx:TargetedTransaction|undefined;try{
      await c.query("SET LOCAL statement_timeout='10000ms'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.schema+':'+scope]);if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');
      const driver:RecordDriver={
        get:async(col,key)=>(await c.query(`SELECT value_json FROM ${s}.tok_records WHERE scope=$1 AND collection=$2 AND key=$3`,[scope,col,key])).rows[0]?.value_json,
        put:async(col,key,value)=>{await c.query(`INSERT INTO ${s}.tok_records VALUES($1,$2,$3,$4) ON CONFLICT(scope,collection,key) DO UPDATE SET value_json=EXCLUDED.value_json`,[scope,col,key,value]);},
        delete:async(col,key)=>{await c.query(`DELETE FROM ${s}.tok_records WHERE scope=$1 AND collection=$2 AND key=$3`,[scope,col,key]);},
        list:async(col,o)=>(await c.query(`SELECT key,value_json FROM ${s}.tok_records WHERE scope=$1 AND collection=$2 AND ($3::text IS NULL OR key LIKE $4 ESCAPE '\\') AND ($5::text IS NULL OR key COLLATE "C">$5) ORDER BY key COLLATE "C" LIMIT $6`,[scope,col,o.prefix??null,o.prefix===undefined?null:o.prefix.replace(/[\\%_]/g,'\\$&')+'%',o.after??null,o.limit])).rows,
      };
      tx=new TargetedTransaction(scope,driver);const result=await executeTransaction(tx,fn);if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');await c.query('COMMIT');return result;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{tx?.end();}}));
  }
  async close(){this.closed=true;this.available=false;if(this.owner){this.owner.release(true);this.owner=undefined;}await this.pool.end();}
}
