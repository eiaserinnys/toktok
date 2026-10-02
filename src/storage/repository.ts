/** Shared targeted record boundary. Transaction callbacks use only this port and pure calculations. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key:string]:JsonValue};
export type RecordValue = {[key:string]:JsonValue};
export enum RecordCollection {
  settings='settings', accounts='accounts', sessions='sessions', flows='flows',
  invitations='invitations', otp='otp', budgets='budgets', audit='audit', agents='agents',
  private_rooms='private_rooms', private_messages='private_messages',
}
export interface RecordPageOptions {prefix?:string;limit:number;after?:string;}
export interface RecordEntry {key:string;value:RecordValue;}
export interface RecordTransaction {
  get(collection:RecordCollection,key:string):Promise<RecordValue|undefined>;
  put(collection:RecordCollection,key:string,value:RecordValue):Promise<void>;
  delete(collection:RecordCollection,key:string):Promise<void>;
  list(collection:RecordCollection,options:RecordPageOptions):Promise<RecordEntry[]>;
}
export interface RepositoryPort {
  /** scope control or room:<id>; callback MUST do no external mail/HTTP/longpoll IO. */
  transaction<T>(scope:string,fn:(tx:RecordTransaction)=>Promise<T>):Promise<T>;
  ready():boolean;
  close():Promise<void>;
}
/** Cumulative accessed records/bytes per transaction, never a total database size cap. */
export const TRANSACTION_LIMITS = Object.freeze({records:4096,bytes:8*1024*1024,valueBytes:65536,list:1000,timeoutMs:10000});
export class RepositoryError extends Error {
  constructor(public readonly code:string){super(code);this.name='RepositoryError';}
}
