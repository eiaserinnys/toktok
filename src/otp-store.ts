import {HttpError,fail} from './http';
import {admission} from './admission';
import type {EmailLimits} from './email';
import type {FlowRow,RegistryInput} from './identity-types';
type Storage=DurableObjectStorage;
export interface SendReceipt {receipt:string;state:string;retry_after:number;expires_at:number;}
export interface Reservation {receipt:SendReceipt;dispatch?:{to:string;code:string;expires_at:number};}
/** All authentication sends share this DO's SQL reservation and private HMAC key. */
export class OtpStore{
 constructor(private storage:Storage){}
 private get sql(){return this.storage.sql;}
 init(){this.sql.exec(`CREATE TABLE IF NOT EXISTS otp_key(id INTEGER PRIMARY KEY,key BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS otp_codes(flow_hash TEXT PRIMARY KEY,email TEXT NOT NULL,digest TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS email_requests(flow_hash TEXT NOT NULL,request_id TEXT NOT NULL,email_key TEXT NOT NULL,receipt TEXT NOT NULL,state TEXT NOT NULL,dispatch_attempted INTEGER NOT NULL,created_at INTEGER NOT NULL,reservation_month TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(flow_hash,request_id));
 CREATE TABLE IF NOT EXISTS email_counters(scope TEXT NOT NULL,window TEXT NOT NULL,n INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(scope,window));
 CREATE TABLE IF NOT EXISTS email_cooldowns(email_key TEXT PRIMARY KEY,last_at INTEGER NOT NULL);`);
  if(!this.sql.exec('SELECT id FROM otp_key WHERE id=1').toArray().length)this.sql.exec('INSERT INTO otp_key VALUES(1,?)',crypto.getRandomValues(new Uint8Array(32)));
 }
 cleanup(now:number){
  this.sql.exec('DELETE FROM otp_codes WHERE expires_at<=?',now);
  this.sql.exec('DELETE FROM email_requests WHERE created_at<=?',now-172800000);
  this.sql.exec("DELETE FROM email_counters WHERE expires_at<=? AND scope!='month'",now);
  this.sql.exec('DELETE FROM email_cooldowns WHERE last_at<=?',now-172800000);
 }
 async digest(...values:string[]){
  const raw=this.sql.exec('SELECT key FROM otp_key WHERE id=1').one().key as ArrayBuffer;
  const key=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(values))));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 private code(){let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);return String(n%1000000).padStart(6,'0');}
 private row(input:RegistryInput,now:number){
  const f=this.sql.exec('SELECT * FROM auth_transactions WHERE flow_hash=?',input.flow_hash!).toArray()[0] as unknown as FlowRow|undefined;
  if(!f||f.consumed||f.expires_at<=now||f.browser_hash!==input.browser_hash)fail(403,'AUTH_FLOW_DENIED','인증 흐름이 없거나 사용할 수 없습니다.');return f;
 }
 async reserve(input:RegistryInput,limits:EmailLimits,now:number,validate:(f:FlowRow)=>void):Promise<Reservation>{
  const email=input.email!,policy=admission({email,email_verified:true},input.policy!);
  if(policy.mode==='closed')fail(503,'AUTH_PROVIDER_UNCONFIGURED','현재 사람 확인과 가입을 받지 않습니다.');
  const emailKey=await this.digest('email',email),ipKey=await this.digest('ip',input.ip!),initial=this.row(input,now);
  const previous=this.sql.exec('SELECT request_id FROM email_requests WHERE flow_hash=? AND request_id=?',input.flow_hash!,input.request_id!).toArray()[0];
  const code=policy.allowed&&!previous?this.code():'';
  const digest=code?await this.digest('otp',input.flow_hash!,email,initial.nonce_hash,code):'';
  return this.storage.transactionSync(()=>{
   const f=this.row(input,now);validate(f);
   const previous=this.sql.exec('SELECT * FROM email_requests WHERE flow_hash=? AND request_id=?',input.flow_hash!,input.request_id!).toArray()[0];
   if(previous){if(previous.email_key!==emailKey)fail(409,'IDEMPOTENCY_CONFLICT','같은 요청 식별자의 내용이 다릅니다.');return {receipt:{receipt:String(previous.receipt),state:'attempted',retry_after:limits.cooldown_seconds,expires_at:Number(previous.expires_at)}};}
   const date=new Date(now),hour=date.toISOString().slice(0,13),day=date.toISOString().slice(0,10),month=date.toISOString().slice(0,7);
   const hourEnd=(Math.floor(now/3600000)+1)*3600000,dayEnd=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1),monthEnd=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1);
   const windows=[{scope:emailKey,window:'h:'+hour,cap:limits.email_hour,end:hourEnd},{scope:emailKey,window:'d:'+day,cap:limits.email_day,end:dayEnd},{scope:ipKey,window:'h:'+hour,cap:limits.ip_hour,end:hourEnd},{scope:ipKey,window:'d:'+day,cap:limits.ip_day,end:dayEnd},{scope:'month',window:month,cap:limits.month,end:monthEnd}];
   const last=this.sql.exec('SELECT last_at FROM email_cooldowns WHERE email_key=?',emailKey).toArray()[0];
   let retry=last?Math.max(0,Number(last.last_at)+limits.cooldown_seconds*1000-now):0;
   for(const w of windows){const n=Number(this.sql.exec('SELECT n FROM email_counters WHERE scope=? AND window=?',w.scope,w.window).toArray()[0]?.n??0);if(n>=w.cap)retry=Math.max(retry,w.end-now);}
   if(retry>0)throw new HttpError(429,'EMAIL_RATE_LIMITED','이메일 발송 한도를 초과했습니다.',Math.ceil(retry/1000));
   for(const w of windows.filter(w=>w.scope!=='month'||policy.allowed))this.sql.exec('INSERT INTO email_counters VALUES(?,?,1,?) ON CONFLICT(scope,window) DO UPDATE SET n=n+1',w.scope,w.window,w.end);
   this.sql.exec('INSERT INTO email_cooldowns VALUES(?,?) ON CONFLICT(email_key) DO UPDATE SET last_at=excluded.last_at',emailKey,now);
   const receipt=crypto.randomUUID(),expires=Math.min(f.expires_at,now+600000);
   this.sql.exec('INSERT INTO email_requests VALUES(?,?,?,?,?,?,?,?,?)',input.flow_hash!,input.request_id!,emailKey,receipt,policy.allowed?'uncertain':'suppressed',policy.allowed?1:0,now,month,expires);
   // Every accepted resend invalidates the old flow code, including a changed address.
   this.sql.exec('DELETE FROM otp_codes WHERE flow_hash=?',input.flow_hash!);
   if(policy.allowed)this.sql.exec('INSERT INTO otp_codes VALUES(?,?,?,?,0)',input.flow_hash!,email,digest,expires);
   return {receipt:{receipt,state:'attempted',retry_after:limits.cooldown_seconds,expires_at:expires},...(policy.allowed?{dispatch:{to:email,code,expires_at:expires}}:{})};
  });
 }
 result(input:RegistryInput){
  this.sql.exec('UPDATE email_requests SET state=? WHERE flow_hash=? AND request_id=?',input.delivery_state!,input.flow_hash!,input.request_id!);
  return this.sql.exec('SELECT receipt,state FROM email_requests WHERE flow_hash=? AND request_id=?',input.flow_hash!,input.request_id!).one();
 }
 async verify(input:RegistryInput,now:number,validate:()=>void,success:(email:string)=>void){
  const stored=this.sql.exec('SELECT email FROM otp_codes WHERE flow_hash=?',input.flow_hash!).toArray()[0];
  const digest=stored?await this.digest('otp',input.flow_hash!,String(stored.email),input.nonce_hash!,input.otp!):'';
  const result=this.storage.transactionSync(()=>{
   validate();const code=this.sql.exec('SELECT * FROM otp_codes WHERE flow_hash=?',input.flow_hash!).toArray()[0];
   if(!code||Number(code.expires_at)<=now)return false;
   if(!admission({email:String(code.email),email_verified:true},input.policy!).allowed)fail(403,'ADMISSION_DENIED','현재 정책에 따른 가입 승인이 필요합니다.');
   if(code.digest!==digest){const attempts=Number(code.attempts)+1;if(attempts>=5)this.sql.exec('DELETE FROM otp_codes WHERE flow_hash=?',input.flow_hash!);else this.sql.exec('UPDATE otp_codes SET attempts=? WHERE flow_hash=?',attempts,input.flow_hash!);return false;}
   success(String(code.email));this.sql.exec('DELETE FROM otp_codes WHERE flow_hash=?',input.flow_hash!);return true;
  });
  if(!result)fail(401,'OTP_INVALID','코드가 올바르지 않거나 만료·폐기되었습니다.');
 }
}
