import type {Pool,PoolClient} from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import {RepositoryError,type RepositoryPort,type RecordTransaction} from './repository';
import {TargetedTransaction,executeTransaction,transactionFailure,validateScope,type RecordDriver} from './record-transaction';
import {MIGRATION_VERSION as LEGACY_VERSION,MIGRATION_CHECKSUM as LEGACY_CHECKSUM,TABLES} from './schema';
import {NODE_MIGRATION_VERSION as VERSION,NODE_MIGRATION_CHECKSUM as CHECKSUM,PRIVATE_ROOM_INDEX,validateRoomIdPage,roomIdPage,type PrivateRoomIdOptions,type NodePrivateMaintenance} from './node-maintenance';
const nesting=new AsyncLocalStorage<boolean>();
function identifier(schema:string):string{if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new RepositoryError('INVALID_SCHEMA');return '"'+schema+'"';}
async function state(client:PoolClient,schema:string):Promise<'blank'|'legacy'|'ready'> {
 const rows=(await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name',[schema])).rows;
 if(!rows.length)return 'blank';if(rows.length!==2||rows.some(r=>!TABLES.includes(r.table_name)))throw new RepositoryError('SCHEMA_CONFLICT');
 const columns=(await client.query('SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position',[schema])).rows.map(r=>[r.table_name,r.column_name,r.data_type,r.is_nullable]);
 const expected=[['tok_migrations','version','integer','NO'],['tok_migrations','checksum','text','NO'],['tok_records','scope','text','NO'],['tok_records','collection','text','NO'],['tok_records','key','text','NO'],['tok_records','value_json','text','NO']];
 if(JSON.stringify(columns)!==JSON.stringify(expected))throw new RepositoryError('SCHEMA_CONFLICT');
 const primary=(await client.query("SELECT t.relname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND c.contype='p' ORDER BY t.relname",[schema])).rows;
 if(primary.length!==2||primary[0].relname!=='tok_migrations'||primary[0].definition!=='PRIMARY KEY (version)'||primary[1].relname!=='tok_records'||primary[1].definition!=='PRIMARY KEY (scope, collection, key)')throw new RepositoryError('SCHEMA_CONFLICT');
 const marker=(await client.query(`SELECT version,checksum FROM ${identifier(schema)}.tok_migrations`)).rows;
 if(marker.length!==1)throw new RepositoryError('SCHEMA_CONFLICT');
 if(marker[0].version===LEGACY_VERSION&&marker[0].checksum===LEGACY_CHECKSUM)return 'legacy';
 if(marker[0].version!==VERSION||marker[0].checksum!==CHECKSUM)throw new RepositoryError('SCHEMA_CONFLICT');
 const index=(await client.query('SELECT i.indisunique,i.indisvalid,i.indpred IS NULL AS full_index,i.indexprs IS NULL AS plain_index,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class x ON x.oid=i.indexrelid WHERE n.nspname=$1 AND t.relname=$2 AND x.relname=$3',[schema,'tok_records',PRIVATE_ROOM_INDEX])).rows;
 if(index.length!==1||index[0].indisunique||!index[0].indisvalid||!index[0].full_index||!index[0].plain_index||!index[0].definition.endsWith('USING btree (collection, scope COLLATE "C", key COLLATE "C")'))throw new RepositoryError('SCHEMA_CONFLICT');
 return 'ready';
}
async function currentState(client:PoolClient,schema:string):Promise<'blank'|'ready'> {const value=await state(client,schema);if(value==='legacy')throw new RepositoryError('MIGRATION_REQUIRED');return value;}
/** Pool is constructed by the selected PG loader only. All errors crossing this boundary are sanitized. */
export class PostgresRepository implements RepositoryPort,NodePrivateMaintenance {
  private owner?:PoolClient;private available=false;private closed=false;
  constructor(private readonly pool:Pool,private readonly schema:string,private readonly deployment:string){identifier(schema);}
  private async connected<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{let client:PoolClient|undefined;try{client=await this.pool.connect();return await fn(client);}catch(e){throw transactionFailure(e);}finally{client?.release();}}
  async check(){return this.connected(c=>currentState(c,this.schema));}
  async apply():Promise<void>{await this.connected(async c=>{await c.query('BEGIN');try{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.schema+':migration']);
    if(await currentState(c,this.schema)==='blank'){const s=identifier(this.schema);await c.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);await c.query(`CREATE TABLE ${s}.tok_records(scope TEXT NOT NULL,collection TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(scope,collection,key));CREATE TABLE ${s}.tok_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)`);await c.query(`CREATE INDEX ${PRIVATE_ROOM_INDEX} ON ${s}.tok_records(collection,scope COLLATE "C",key COLLATE "C")`);await c.query(`INSERT INTO ${s}.tok_migrations VALUES ($1,$2)`,[VERSION,CHECKSUM]);}
    await currentState(c,this.schema);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}});}
  /** Explicit migration only. Owner lock prevents modifying a serving deployment. */
  async migrate():Promise<void>{await this.connected(async c=>{await c.query('BEGIN');try{
    await c.query("SET LOCAL statement_timeout='10000ms'");
    const owner=(await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',['toktok-owner:'+this.schema])).rows[0];
    if(!owner.acquired)throw new RepositoryError('OWNER_CONFLICT');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.schema+':migration']);
    const value=await state(c,this.schema);if(value==='blank')throw new RepositoryError('SCHEMA_NOT_READY');if(value==='legacy'){
      const s=identifier(this.schema);await c.query(`CREATE INDEX ${PRIVATE_ROOM_INDEX} ON ${s}.tok_records(collection,scope COLLATE "C",key COLLATE "C")`);
      await c.query(`UPDATE ${s}.tok_migrations SET version=$1,checksum=$2 WHERE version=$3 AND checksum=$4`,[VERSION,CHECKSUM,LEGACY_VERSION,LEGACY_CHECKSUM]);
    }await currentState(c,this.schema);await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error;}});}
  async acquire():Promise<void>{try{
    const owner=await this.pool.connect();this.owner=owner;
    owner.on('error',()=>{this.available=false;});owner.on('end',()=>{this.available=false;});
    const row=(await owner.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',['toktok-owner:'+this.schema])).rows[0];
    if(!row.acquired)throw new RepositoryError('OWNER_CONFLICT');if(await currentState(owner,this.schema)!=='ready')throw new RepositoryError('SCHEMA_NOT_READY');this.available=true;
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
  async listPrivateRoomIds(options:PrivateRoomIdOptions){
    if(nesting.getStore())throw new RepositoryError('NESTED_TRANSACTION');validateRoomIdPage(options);if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');
    return this.connected(async c=>{await c.query('BEGIN READ ONLY');try{
      await c.query("SET LOCAL statement_timeout='10000ms'");if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');
      const rows=(await c.query(`SELECT key FROM ${identifier(this.schema)}.tok_records WHERE collection='private_rooms' AND scope COLLATE "C">$1 AND scope COLLATE "C"<'room;' AND scope='room:'||key AND value_json::jsonb#>>'{snapshot,id}'=key AND (value_json::jsonb#>>'{snapshot,persist}'='true' OR value_json::jsonb->>'recent_authorized'='true') AND (value_json::jsonb->>'body_count')::bigint>0 ORDER BY scope COLLATE "C" LIMIT $2`,['room:'+(options.after??''),options.limit])).rows;
      if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');const page=roomIdPage(rows.map(r=>String(r.key)),options.limit);await c.query('COMMIT');return page;
    }catch(error){await c.query('ROLLBACK');throw error;}});
  }
  async listPublicRoomIds(options:PrivateRoomIdOptions){
    if(nesting.getStore())throw new RepositoryError('NESTED_TRANSACTION');validateRoomIdPage(options);if(!this.ready())throw new RepositoryError('REPOSITORY_UNAVAILABLE');
    return this.connected(async c=>{const rows=(await c.query(`SELECT DISTINCT substring(scope from 8) COLLATE "C" AS id FROM ${identifier(this.schema)}.tok_records WHERE ((collection='recent_buffers' AND key='buffer') OR (collection='public_entries' AND key='meta')) AND scope COLLATE "C">$1 AND scope COLLATE "C"<'public;' AND (value_json::jsonb->>'count')::bigint>0 ORDER BY id LIMIT $2`,['public:'+(options.after??''),options.limit])).rows;return roomIdPage(rows.map(r=>String(r.id)),options.limit);});
  }
  async close(){this.closed=true;this.available=false;if(this.owner){this.owner.release(true);this.owner=undefined;}await this.pool.end();}
}
