import {admission} from './admission';
import {OtpStore} from './otp-store';
import {emailLimits} from './email';
import {DurableObject} from 'cloudflare:workers';
import type {Env} from './contracts';
import {fail,limited,json,errorResponse} from './http';
import {type RegistryInput,type AgentRow,type FlowRow,type HumanRow,type SessionRow,agentView} from './identity-types';
export class IdentityRegistry extends DurableObject<Env>{
 private otp=new OtpStore(this.ctx.storage);
 private get sql(){return this.ctx.storage.sql;}
 private init(){
  this.sql.exec(`CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,claim_hash TEXT NOT NULL,status TEXT NOT NULL,pending_expiry INTEGER NOT NULL,credential_expiry INTEGER,owner_id TEXT);
   CREATE TABLE IF NOT EXISTS humans(id TEXT PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,email TEXT NOT NULL,email_verified INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS auth_transactions(flow_hash TEXT PRIMARY KEY,nonce_hash TEXT NOT NULL,browser_hash TEXT NOT NULL,claim_id TEXT,claim_hash TEXT,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sessions(session_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS risk_ack(owner_id TEXT PRIMARY KEY,version TEXT NOT NULL,confirmed_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS registration_limits(ip_hash TEXT NOT NULL,minute INTEGER NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(ip_hash,minute));`);
  this.otp.init();
 }
 private cleanup(now:number){
  this.sql.exec("DELETE FROM agents WHERE status='pending' AND pending_expiry<=?",now);
  for(const table of ['auth_transactions','sessions'])this.sql.exec(`DELETE FROM ${table} WHERE expires_at<=?`,now);
  this.sql.exec('DELETE FROM registration_limits WHERE minute<?',Math.floor(now/60000));
  this.otp.cleanup(now);
 }
 private async schedule(){
  const queries=["SELECT MIN(pending_expiry) AS n FROM agents WHERE status='pending'",'SELECT MIN(expires_at) AS n FROM auth_transactions','SELECT MIN(expires_at) AS n FROM sessions','SELECT MIN(expires_at) AS n FROM otp_codes','SELECT MIN(created_at+172800000) AS n FROM email_requests',"SELECT MIN(expires_at) AS n FROM email_counters WHERE scope!='month'",'SELECT MIN(last_at+172800000) AS n FROM email_cooldowns','SELECT MIN((minute+1)*60000) AS n FROM registration_limits'];
  const times=queries.map(query=>this.sql.exec(query).one().n).filter(n=>n!==null).map(Number);
  if(times.length)await this.ctx.storage.setAlarm(Math.min(...times));else await this.ctx.storage.deleteAlarm();
 }
 async alarm(){this.init();this.ctx.storage.transactionSync(()=>this.cleanup(Date.now()));await this.schedule();}
 private agent(id:string){const a=this.sql.exec('SELECT * FROM agents WHERE id=?',id).toArray()[0] as unknown as AgentRow|undefined;if(!a)fail(410,'CLAIM_GONE','등록이 만료되었거나 없습니다.');return a;}
 private claim(id:string,cap:string,pending=false){const a=this.agent(id);if(a.claim_hash!==cap)fail(403,'CLAIM_DENIED','claim 권한이 올바르지 않습니다.');if(pending&&a.status!=='pending')fail(409,'CLAIM_PROCESSED','이미 처리한 등록입니다.');return a;}
 private session(input:RegistryInput,mutation=false){
  const s=this.sql.exec('SELECT * FROM sessions WHERE session_hash=?',input.session_hash!).toArray()[0] as unknown as SessionRow|undefined;
  if(!s)fail(401,'SESSION_REQUIRED','사람 확인 세션이 필요합니다.');
  if(mutation&&(!input.csrf||input.csrf!==s.csrf))fail(403,'CSRF_DENIED','세션의 CSRF 확인값이 필요합니다.');
  const human=this.sql.exec('SELECT * FROM humans WHERE id=?',s.owner_id).one() as unknown as HumanRow;
  return {s,human};
 }
 private allowed(human:HumanRow,input:RegistryInput){return admission(human,input.policy!).allowed;}
 private admit(human:HumanRow,input:RegistryInput){if(!this.allowed(human,input))fail(403,'ADMISSION_DENIED','현재 정책에 따른 가입 승인이 필요합니다.');}
 private flow(input:RegistryInput){
  const f=this.sql.exec('SELECT * FROM auth_transactions WHERE flow_hash=?',input.flow_hash!).toArray()[0] as unknown as FlowRow|undefined;
  if(!f)fail(403,'AUTH_FLOW_DENIED','인증 흐름이 없거나 만료되었습니다.');
  if(f.consumed)fail(409,'AUTH_FLOW_USED','이미 사용한 인증 흐름입니다.');
  if(f.nonce_hash!==input.nonce_hash||f.browser_hash!==input.browser_hash||f.claim_id!==(input.claim?.agent_id??null)||f.claim_hash!==(input.claim?.claim_hash??null))fail(403,'AUTH_FLOW_DENIED','인증 흐름의 결합이 일치하지 않습니다.');
  if(f.claim_id)this.claim(f.claim_id,f.claim_hash!,true);
  return f;
 }
 private action(action:string,input:RegistryInput,now:number):unknown{
  if(action==='register'){
   const minute=Math.floor(now/60000),limit=this.sql.exec('SELECT n FROM registration_limits WHERE ip_hash=? AND minute=?',input.ip_hash!,minute).toArray()[0];
   if(Number(limit?.n??0)>=5||Number(this.sql.exec("SELECT COUNT(*) AS n FROM agents WHERE status='pending'").one().n)>=1000)limited();
   this.sql.exec('INSERT INTO registration_limits VALUES(?,?,1) ON CONFLICT(ip_hash,minute) DO UPDATE SET n=n+1',input.ip_hash!,minute);
   this.sql.exec("INSERT INTO agents(id,name,token_hash,claim_hash,status,pending_expiry) VALUES(?,?,?,?,'pending',?)",input.id!,input.name!,input.token_hash!,input.claim_hash!,now+86400000);
   return {agent:agentView(this.agent(input.id!))};
  }
  if(action==='claim')return {agent:agentView(this.claim(input.id!,input.claim_hash!))};
  if(action==='agent'){
   const a=this.sql.exec('SELECT * FROM agents WHERE token_hash=?',input.token_hash!).toArray()[0] as unknown as AgentRow|undefined;if(!a)fail(401,'AGENT_REQUIRED','에이전트 인증정보가 없거나 만료되었습니다.');return {agent:agentView(a)};
  }
  if(action==='start'){
   if(input.claim)this.claim(input.claim.agent_id,input.claim.claim_hash,true);
   this.sql.exec('INSERT INTO auth_transactions(flow_hash,nonce_hash,browser_hash,claim_id,claim_hash,expires_at) VALUES(?,?,?,?,?,?)',input.flow_hash!,input.nonce_hash!,input.browser_hash!,input.claim?.agent_id??null,input.claim?.claim_hash??null,now+600000);return {};
  }
  if(action==='validate') {this.flow(input);return {};}
  if(action==='session'){
   const {s,human}=this.session(input);return {human:{provider:human.provider,subject:human.subject,email:human.email,email_verified:true},admission_allowed:this.allowed(human,input),admission_policy:admission(human,input.policy!).mode,risk_ack:this.sql.exec('SELECT version,confirmed_at FROM risk_ack WHERE owner_id=?',s.owner_id).toArray()[0]??null,csrf:s.csrf,agents:this.sql.exec('SELECT * FROM agents WHERE owner_id=?',s.owner_id).toArray().map(a=>agentView(a as unknown as AgentRow))};
  }
  if(action==='logout'){this.session(input,true);this.sql.exec('DELETE FROM sessions WHERE session_hash=?',input.session_hash!);return {};}
  if(action==='approve'){
   const {s,human}=this.session(input,true);this.admit(human,input);const a=this.claim(input.id!,input.claim_hash!,true);
   if(input.risk_ack_version!=='toktok-risk-v1')fail(400,'RISK_ACK_REQUIRED','에이전트 권한과 실행에 대한 안내 확인이 필요합니다.');
   this.sql.exec('INSERT INTO risk_ack VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET version=excluded.version,confirmed_at=excluded.confirmed_at',s.owner_id,input.risk_ack_version,now);
   this.sql.exec("UPDATE agents SET status='approved',owner_id=?,credential_expiry=? WHERE id=? AND status='pending'",s.owner_id,now+2592000000,a.id);return {agent:agentView(this.agent(a.id))};
  }
  if(action==='revoke'){
   const {s,human}=this.session(input,true);this.admit(human,input);const a=this.agent(input.id!);if(a.owner_id!==s.owner_id)fail(403,'OWNER_DENIED','본인 소유 에이전트만 폐기할 수 있습니다.');
   this.sql.exec("UPDATE agents SET status='revoked' WHERE id=?",a.id);return {agent:agentView(this.agent(a.id))};
  }
  if(action==='creator'){
   let a:AgentRow;
   if(input.token_hash){const row=this.sql.exec('SELECT * FROM agents WHERE token_hash=?',input.token_hash).toArray()[0] as unknown as AgentRow|undefined;if(!row)fail(401,'AGENT_REQUIRED','승인된 에이전트 인증정보가 필요합니다.');a=row;}
   else {const {s,human}=this.session(input,true);this.admit(human,input);a=this.agent(input.id!);if(a.owner_id!==s.owner_id)fail(403,'OWNER_DENIED','본인 소유 에이전트만 선택할 수 있습니다.');}
   if(a.status!=='approved'||now>=a.credential_expiry!)fail(403,'AGENT_NOT_APPROVED','승인된 유효 에이전트만 방을 만들 수 있습니다.');
   const h=this.sql.exec('SELECT * FROM humans WHERE id=?',a.owner_id!).one() as unknown as HumanRow;this.admit(h,input);
   if(this.sql.exec('SELECT version FROM risk_ack WHERE owner_id=?',a.owner_id!).toArray()[0]?.version!=='toktok-risk-v1')fail(403,'RISK_ACK_REQUIRED','소유자의 안내 확인이 필요합니다.');return {creator_id:a.id};
  }
  fail(404,'NOT_FOUND','경로가 없습니다.');
 }
 async fetch(request:Request){
  try{
   const input=await request.json() as RegistryInput;this.init();let result:unknown;const action=new URL(request.url).pathname.slice(1),now=input.now??Date.now();
   this.ctx.storage.transactionSync(()=>{this.cleanup(now);});
   if(action==='register')input.ip_hash=await this.otp.digest('registration-ip',input.ip!);
   if(action==='email-reserve')result=await this.otp.reserve(input,emailLimits(input.limits!),now,f=>{if(f.claim_id)this.claim(f.claim_id,f.claim_hash!,true);});
   else if(action==='email-result')result=this.ctx.storage.transactionSync(()=>this.otp.result(input));
   else if(action==='complete'){
    await this.otp.verify(input,now,()=>{this.flow(input);},email=>{
     // OTP identity is supplied only by the successful server-side digest check.
     const owner=`email-otp:${email}`;
     this.sql.exec('UPDATE auth_transactions SET consumed=1 WHERE flow_hash=?',input.flow_hash!);
     this.sql.exec('INSERT INTO humans VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET email=excluded.email,email_verified=1',owner,'email-otp',email,email);
     this.sql.exec('INSERT INTO sessions VALUES(?,?,?,?)',input.session_hash!,owner,input.csrf!,now+43200000);
    });result={};
   }else this.ctx.storage.transactionSync(()=>{result=this.action(action,input,now);});
   await this.schedule();return json(result);
  }catch(error){await this.schedule();return errorResponse(error);}
 }
}
