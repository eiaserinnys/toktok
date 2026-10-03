import {readFileSync,statSync} from 'node:fs';
import {RepositoryError} from '../storage/repository';
import type {NodeRepositoryPort} from '../storage/node-maintenance';
export interface BackendOptions {backend:'sqlite'|'postgres';sqliteFile?:string;dsnFile?:string;dsn?:string;schema?:string;}
export function secretFile(path:string):string{if((statSync(path).mode&0o077)!==0)throw new RepositoryError('SECRET_FILE_PERMISSIONS');return readFileSync(path,'utf8').trim();}
export async function openBackend(options:BackendOptions,command:'start'|'check'|'apply'|'migrate'|'backup',backupFile?:string):Promise<{repo?:NodeRepositoryPort;state?:'blank'|'ready'}>{
  if(options.backend==='sqlite'){
    if(!options.sqliteFile)throw new RepositoryError('CONFIGURATION_REQUIRED');const {SQLiteRepository,checkSQLite,applySQLite,migrateSQLite}=await import('../storage/sqlite');
    if(command==='check')return {state:checkSQLite(options.sqliteFile)};
    if(command==='apply'){applySQLite(options.sqliteFile);return {state:'ready'};}
    if(command==='migrate'){migrateSQLite(options.sqliteFile);return {state:'ready'};}
    const repo=new SQLiteRepository(options.sqliteFile);if(command==='backup'){try{if(!backupFile)throw new RepositoryError('CONFIGURATION_REQUIRED');await repo.backupTo(backupFile);}finally{await repo.close();}return {state:'ready'};}
    return {repo};
  }
  if(options.backend!=='postgres'||!options.schema||(!options.dsnFile&&!options.dsn))throw new RepositoryError('CONFIGURATION_REQUIRED');
  const dsn=options.dsnFile?secretFile(options.dsnFile):options.dsn!;
  // Optional driver is reached only for the explicitly selected PG backend.
  let driver:typeof import('pg');try{driver=await import('pg');}catch{throw new RepositoryError('POSTGRES_DRIVER_REQUIRED');}
  const {PostgresRepository}=await import('../storage/postgres');
  const pool=new driver.Pool({connectionString:dsn,max:4,connectionTimeoutMillis:10000,application_name:'toktok-selfhost'});pool.on('error',()=>{});
  const repo=new PostgresRepository(pool,options.schema,'toktok');
  if(command==='start'){try{await repo.acquire();return {repo};}catch(error){await repo.close();throw error;}}
  try{if(command==='check')return {state:await repo.check()};if(command==='apply'){await repo.apply();return {state:'ready'};}if(command==='migrate'){await repo.migrate();return {state:'ready'};}throw new RepositoryError('POSTGRES_BACKUP_EXTERNAL');}finally{await repo.close();}
}
