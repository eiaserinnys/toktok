import {RecordCollection as C,RepositoryError,TRANSACTION_LIMITS as LIMIT,type RecordEntry,type RecordValue,type RecordTransaction,type RecordPageOptions} from './repository';
export interface RecordDriver {
  get(collection:C,key:string):Promise<string|undefined>;
  put(collection:C,key:string,json:string):Promise<void>;
  delete(collection:C,key:string):Promise<void>;
  list(collection:C,options:RecordPageOptions):Promise<{key:string;value_json:string}[]>;
}
export function validateScope(scope:string):void {if(scope!=='control'&&!/^room:[a-zA-Z0-9_-]{1,128}$/.test(scope)&&!/^public:[a-z0-9-]{1,64}$/.test(scope))throw new RepositoryError('SCOPE_DENIED');}
function json(value:unknown):string {
  function validate(v:unknown,seen:Set<object>):void {
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'&&Number.isFinite(v))return;
    if(typeof v!=='object'||seen.has(v)||(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null))throw new RepositoryError('INVALID_JSON');
    seen.add(v);for(const d of Object.values(Object.getOwnPropertyDescriptors(v))) {if(d.get||d.set)throw new RepositoryError('INVALID_JSON');validate(d.value,seen);}seen.delete(v);
  }
  validate(value,new Set());return JSON.stringify(value);
}
export function cloneResult<T>(value:T):T {return value===undefined?value:JSON.parse(json(value)) as T;}
export class CallbackFailure { constructor(readonly error:unknown){} }
export function transactionFailure(error:unknown):unknown {return error instanceof CallbackFailure?error.error:error instanceof RepositoryError?error:new RepositoryError('TRANSACTION_FAILED');}
export class TargetedTransaction implements RecordTransaction {
  private active=true;private records=0;private bytes=0;
  private readonly driver:RecordDriver;
  constructor(private readonly scope:string,driver:RecordDriver){validateScope(scope);const safe=async<T>(fn:()=>Promise<T>):Promise<T>=>{try{return await fn();}catch(error){throw error instanceof RepositoryError?error:new RepositoryError('DRIVER_FAILED');}};this.driver={get:(c,k)=>safe(()=>driver.get(c,k)),put:(c,k,v)=>safe(()=>driver.put(c,k,v)),delete:(c,k)=>safe(()=>driver.delete(c,k)),list:(c,o)=>safe(()=>driver.list(c,o))};}
  end():void{this.active=false;}
  private check(collection:C,key?:string):void {
    if(!this.active)throw new RepositoryError('TRANSACTION_CLOSED');
    if(!Object.values(C).includes(collection)|| (key!==undefined&&(typeof key!=='string'||key.length<1||key.length>256||key.includes('\0'))))throw new RepositoryError('INVALID_RECORD');
    const privateCollection=collection===C.private_rooms||collection===C.private_messages,recentCollection=collection===C.recent_buffers||collection===C.recent_messages;
    if(this.scope==='control'?(privateCollection||recentCollection):this.scope.startsWith('public:')?!recentCollection:!(privateCollection||recentCollection))throw new RepositoryError('SCOPE_DENIED');
    if(collection===C.private_rooms&&key!==undefined&&key!==this.scope.slice(5))throw new RepositoryError('SCOPE_DENIED');
    if(collection===C.recent_buffers&&key!==undefined&&key!=='buffer')throw new RepositoryError('SCOPE_DENIED');
  }
  private account(raw:string,count=1):void {
    const size=new TextEncoder().encode(raw).byteLength;
    if(size>LIMIT.valueBytes)throw new RepositoryError('TRANSACTION_LIMIT');
    this.records+=count;this.bytes+=size;
    if(this.records>LIMIT.records||this.bytes>LIMIT.bytes)throw new RepositoryError('TRANSACTION_LIMIT');
  }
  private value(raw:string):RecordValue {
    let value:unknown;try{value=JSON.parse(raw);}catch{throw new RepositoryError('INVALID_JSON');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new RepositoryError('INVALID_JSON');return JSON.parse(json(value)) as RecordValue;
  }
  async get(collection:C,key:string):Promise<RecordValue|undefined> {
    this.check(collection,key);const raw=await this.driver.get(collection,key);this.check(collection,key);this.account(raw??'');return raw===undefined?undefined:this.value(raw);
  }
  async put(collection:C,key:string,value:RecordValue):Promise<void> {
    this.check(collection,key);if(!value||typeof value!=='object'||Array.isArray(value))throw new RepositoryError('INVALID_JSON');
    const raw=json(value);this.account(raw);
    if(collection===C.private_messages){const room=await this.get(C.private_rooms,this.scope.slice(5));if(room?.persist_authorized!==true||room.retention_mode!=='persist')throw new RepositoryError('PERSIST_DENIED');}
    if(collection===C.recent_buffers||collection===C.recent_messages){
      if(this.scope.startsWith('room:')){const room=await this.get(C.private_rooms,this.scope.slice(5));if(room?.recent_authorized!==true||room.retention_mode!=='recent_buffer')throw new RepositoryError('PERSIST_DENIED');}
      if(collection===C.recent_messages){const buffer=await this.get(C.recent_buffers,'buffer');if(buffer?.notice_version!=='toktok-risk-v2')throw new RepositoryError('PERSIST_DENIED');}
    }
    this.check(collection,key);await this.driver.put(collection,key,raw);this.check(collection,key);
  }
  async delete(collection:C,key:string):Promise<void>{this.check(collection,key);this.account(key);await this.driver.delete(collection,key);this.check(collection,key);}
  async list(collection:C,options:RecordPageOptions):Promise<RecordEntry[]> {
    this.check(collection);if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>LIMIT.list||(options.prefix!==undefined&&options.prefix.length>256)||(options.after!==undefined&&options.after.length>256))throw new RepositoryError('INVALID_RECORD');
    const rows=await this.driver.list(collection,options);this.check(collection);return rows.map(row=>{this.account(row.value_json);return {key:row.key,value:this.value(row.value_json)};});
  }
}
export async function executeTransaction<T>(tx:TargetedTransaction,fn:(tx:RecordTransaction)=>Promise<T>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return cloneResult(await Promise.race([Promise.resolve().then(()=>fn(tx)).catch(error=>{throw new CallbackFailure(error);}),new Promise<never>((_r,reject)=>{timer=setTimeout(()=>{tx.end();reject(new RepositoryError('TRANSACTION_TIMEOUT'));},LIMIT.timeoutMs);})]));}
  finally{clearTimeout(timer);tx.end();}
}
