import {DurableObject} from 'cloudflare:workers';
import {OtpStore} from './otp-store';
import {SettingsStore} from './settings-store';
import {SETTINGS_SCHEMA} from './settings-schema';
import {Invitations} from './invitations';
import {admission} from './admission';
import {entitlements,signupEligible,type Account} from './control-policy';
import {normalizeEmail} from './email';
import {fail,limited,json,errorResponse,bad} from './http';
import {type IdentityEnv,type RegistryInput,type AgentRow,type FlowRow,type SessionRow,agentView} from './identity-types';
export class IdentityRegistry extends DurableObject<IdentityEnv>{
 private otp=new OtpStore(this.ctx.storage);
 private settings=new SettingsStore(this.ctx.storage);
 private invitations=new Invitations(this.ctx.storage);
 private get sql(){return this.ctx.storage.sql;}
 private init(){
  this.sql.exec(`CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,claim_hash TEXT NOT NULL,status TEXT NOT NULL,pending_expiry INTEGER NOT NULL,credential_expiry INTEGER,owner_id TEXT);
   CREATE TABLE IF NOT EXISTS humans(id TEXT PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,email TEXT NOT NULL,email_verified INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,email TEXT UNIQUE NOT NULL,email_verified INTEGER NOT NULL,role TEXT NOT NULL,admission_kind TEXT NOT NULL,can_create_private INTEGER NOT NULL,can_persist_private INTEGER NOT NULL,UNIQUE(provider,subject));
   CREATE TABLE IF NOT EXISTS auth_transactions(flow_hash TEXT PRIMARY KEY,nonce_hash TEXT NOT NULL,browser_hash TEXT NOT NULL,claim_id TEXT,claim_hash TEXT,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,purpose TEXT NOT NULL,invitation_id TEXT,email_key TEXT);
   CREATE TABLE IF NOT EXISTS sessions(session_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS risk_ack(owner_id TEXT PRIMARY KEY,version TEXT NOT NULL,confirmed_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS registration_limits(ip_hash TEXT NOT NULL,minute INTEGER NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(ip_hash,minute));`);
  // Existing unpublished WIP flows keep expiry/binding; no legacy env admission is migrated.
  const columns=this.sql.exec('PRAGMA table_info(auth_transactions)').toArray().map(r=>r.name);
  if(!columns.includes('purpose'))this.sql.exec("ALTER TABLE auth_transactions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login'");
  if(!columns.includes('invitation_id'))this.sql.exec('ALTER TABLE auth_transactions ADD COLUMN invitation_id TEXT');
  if(!columns.includes('email_key'))this.sql.exec('ALTER TABLE auth_transactions ADD COLUMN email_key TEXT');
  this.otp.init();this.invitations.init();this.settings.init();
 }
 private cleanup(now:number){
  this.sql.exec("DELETE FROM agents WHERE status='pending' AND pending_expiry<=?",now);
  for(const table of ['auth_transactions','sessions'])this.sql.exec(`DELETE FROM ${table} WHERE expires_at<=?`,now);
  this.sql.exec('DELETE FROM registration_limits WHERE minute<?',Math.floor(now/60000));
  this.otp.cleanup(now);this.invitations.cleanup(now);this.settings.cleanup(now);
 }
 private async schedule(){
  const queries=["SELECT MIN(pending_expiry) AS n FROM agents WHERE status='pending'",'SELECT MIN(expires_at) AS n FROM auth_transactions','SELECT MIN(expires_at) AS n FROM sessions','SELECT MIN(expires_at) AS n FROM otp_codes','SELECT MIN(created_at+172800000) AS n FROM email_requests',"SELECT MIN(expires_at) AS n FROM email_counters WHERE scope!='month'",'SELECT MIN(last_at+172800000) AS n FROM email_cooldowns','SELECT MIN((minute+1)*60000) AS n FROM registration_limits','SELECT MIN(expires_at) AS n FROM invitation_validations','SELECT MIN(expires_at) AS n FROM budget_operations'];
  const times=queries.map(query=>this.sql.exec(query).one().n).filter(n=>n!==null).map(Number);
  if(times.length)await this.ctx.storage.setAlarm(Math.min(...times));else await this.ctx.storage.deleteAlarm();
 }
 async alarm(){this.init();this.ctx.storage.transactionSync(()=>this.cleanup(Date.now()));await this.schedule();}
 private account(email:string){return this.sql.exec('SELECT * FROM accounts WHERE email=?',email).toArray()[0] as unknown as Account|undefined;}
 private bootstrapEmail(){try{return this.env.ADMIN_BOOTSTRAP_EMAIL?normalizeEmail(this.env.ADMIN_BOOTSTRAP_EMAIL):null;}catch{return null;}}
 private bootstrapEligible(email:string){return email===this.bootstrapEmail()&&!this.sql.exec('SELECT bootstrap_consumed FROM control_state WHERE id=1').one().bootstrap_consumed&&Number(this.sql.exec("SELECT COUNT(*) AS n FROM accounts WHERE role='admin'").one().n)===0;}
 private emailEligible(email:string,flow:FlowRow,now:number){return signupEligible(this.settings.read().settings,flow.purpose,Boolean(this.account(email)),Boolean(flow.invitation_id&&this.invitations.valid(flow.invitation_id,now)),this.bootstrapEligible(email));}
 private agent(id:string){const a=this.sql.exec('SELECT * FROM agents WHERE id=?',id).toArray()[0] as unknown as AgentRow|undefined;if(!a)fail(410,'CLAIM_GONE','등록이 만료되었거나 없습니다.');return a;}
 private claim(id:string,cap:string,pending=false){const a=this.agent(id);if(a.claim_hash!==cap)fail(403,'CLAIM_DENIED','claim 권한이 올바르지 않습니다.');if(pending&&a.status!=='pending')fail(409,'CLAIM_PROCESSED','이미 처리한 등록입니다.');return a;}
 private session(input:RegistryInput,now:number,mutation=false){
  const s=this.sql.exec('SELECT * FROM sessions WHERE session_hash=?',input.session_hash!).toArray()[0] as unknown as SessionRow|undefined;
  if(!s||s.expires_at<=now)fail(401,'SESSION_REQUIRED','사람 확인 세션이 필요합니다.');
  if(mutation&&(!input.csrf||input.csrf!==s.csrf))fail(403,'CSRF_DENIED','세션의 CSRF 확인값이 필요합니다.');
  const account=this.sql.exec('SELECT * FROM accounts WHERE id=?',s.owner_id).toArray()[0] as unknown as Account|undefined;
  if(!account)fail(401,'SESSION_REQUIRED','유효한 계정이 필요합니다.');return {s,account};
 }
 private admin(input:RegistryInput,now:number,mutation=false){const {account}=this.session(input,now,mutation);if(account.role!=='admin')fail(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');return account;}
 private admit(account:Account){if(!admission(this.settings.read().settings,account).can_create_private)fail(403,'ADMISSION_DENIED','현재 계정의 생성 권한이 필요합니다.');}
 private flow(input:RegistryInput,now:number){
  const f=this.sql.exec('SELECT * FROM auth_transactions WHERE flow_hash=?',input.flow_hash!).toArray()[0] as unknown as FlowRow|undefined;
  if(!f||f.expires_at<=now)fail(403,'AUTH_FLOW_DENIED','인증 흐름이 없거나 만료되었습니다.');
  if(f.consumed)fail(409,'AUTH_FLOW_USED','이미 사용한 인증 흐름입니다.');
  if(f.nonce_hash!==input.nonce_hash||f.browser_hash!==input.browser_hash||f.claim_id!==(input.claim?.agent_id??null)||f.claim_hash!==(input.claim?.claim_hash??null))fail(403,'AUTH_FLOW_DENIED','인증 흐름의 결합이 일치하지 않습니다.');
  if(f.claim_id)this.claim(f.claim_id,f.claim_hash!,true);return f;
 }
 private ack(owner:string){return this.sql.exec('SELECT version,confirmed_at FROM risk_ack WHERE owner_id=?',owner).toArray()[0]??null;}
 private action(action:string,input:RegistryInput,now:number):unknown{
  const settings=this.settings.read().settings;
  if(action==='config')return this.settings.projection();
  if(action==='invitation-validate')return this.invitations.validate(input.token_hash!,input.invitation_validation_hash!,input.browser_hash!,now);
  if(action==='admin-bootstrap'){
   const {account}=this.session(input,now,true);
   if(input.confirm!==true||!this.bootstrapEligible(account.email))fail(403,'BOOTSTRAP_DENIED','최초 관리자 확인을 진행할 수 없습니다.');
   this.sql.exec("UPDATE accounts SET role='admin' WHERE id=?",account.id);this.sql.exec('UPDATE control_state SET bootstrap_consumed=1 WHERE id=1');this.settings.audit(account.id,now,'admin.bootstrap',null,{});return {bootstrapped:true};
  }
  if(action.startsWith('admin-')){
   const mutation=['admin-settings-update','admin-invitation-create','admin-invitation-revoke'].includes(action),account=this.admin(input,now,mutation);
   if(action==='admin-settings')return this.settings.read();if(action==='admin-schema')return {schema_version:1,schema:SETTINGS_SCHEMA};
   if(action==='admin-settings-update')return this.settings.update(input.expected_revision,input.settings,account.id,now);
   if(action==='admin-audit')return {audit:this.settings.listAudit(input.limit!)};
   if(action==='admin-invitations')return {invitations:this.invitations.list(input.limit!,now)};
   if(action==='admin-invitation-create'){
    const ttl=input.ttl_seconds??settings.identity.invitationTtlSeconds;if(!Number.isSafeInteger(ttl)||ttl<1||ttl>2592000)bad();
    const invite=this.invitations.create(input.id!,input.token_hash!,now+ttl*1000,now);this.settings.audit(account.id,now,'invitation.create',null,{id:invite.id,status:invite.status});return invite;
   }
   if(action==='admin-invitation-revoke'){const result=this.invitations.revoke(input.id!);this.settings.audit(account.id,now,'invitation.revoke',null,result);return result;}
  }
  if(action==='register'){
   const minute=Math.floor(now/60000),limit=this.sql.exec('SELECT n FROM registration_limits WHERE ip_hash=? AND minute=?',input.ip_hash!,minute).toArray()[0];
   if(Number(limit?.n??0)>=5||Number(this.sql.exec("SELECT COUNT(*) AS n FROM agents WHERE status='pending'").one().n)>=1000)limited();
   this.sql.exec('INSERT INTO registration_limits VALUES(?,?,1) ON CONFLICT(ip_hash,minute) DO UPDATE SET n=n+1',input.ip_hash!,minute);
   this.sql.exec("INSERT INTO agents(id,name,token_hash,claim_hash,status,pending_expiry) VALUES(?,?,?,?,'pending',?)",input.id!,input.name!,input.token_hash!,input.claim_hash!,now+86400000);return {agent:agentView(this.agent(input.id!))};
  }
  if(action==='claim')return {agent:agentView(this.claim(input.id!,input.claim_hash!))};
  if(action==='agent'){const a=this.sql.exec('SELECT * FROM agents WHERE token_hash=?',input.token_hash!).toArray()[0] as unknown as AgentRow|undefined;if(!a)fail(401,'AGENT_REQUIRED','에이전트 인증정보가 없거나 만료되었습니다.');return {agent:agentView(a)};}
  if(action==='start'){
   if(!['login','signup','claim'].includes(input.purpose!))bad();if(input.purpose==='claim'&&!input.claim)bad();if(input.claim)this.claim(input.claim.agent_id,input.claim.claim_hash,true);
   const invitation=input.invitation_validation_hash?this.invitations.bind(input.invitation_validation_hash,input.browser_hash!,now):null;
   if(input.purpose==='signup'&&(settings.deployment.mode==='demo'||settings.signup.policy==='invite')&&!invitation)fail(400,'INVALID_INVITATION','초대 코드 확인이 필요합니다.');
   if(input.purpose==='signup'&&settings.signup.policy==='closed')fail(403,'SIGNUP_CLOSED','현재 가입을 받지 않습니다.');
   const expires=now+settings.identity.flowTtlSeconds*1000;
   this.sql.exec('INSERT INTO auth_transactions(flow_hash,nonce_hash,browser_hash,claim_id,claim_hash,expires_at,purpose,invitation_id) VALUES(?,?,?,?,?,?,?,?)',input.flow_hash!,input.nonce_hash!,input.browser_hash!,input.claim?.agent_id??null,input.claim?.claim_hash??null,expires,input.purpose!,invitation);return {expires_at:expires};
  }
  if(action==='validate'){this.flow(input,now);return {};}
  if(action==='session'){
   const {s,account}=this.session(input,now);return {authenticated:true,role:account.role,entitlements:entitlements(settings,account),csrf_token:s.csrf,owner_ack:this.ack(account.id),agents:this.sql.exec('SELECT * FROM agents WHERE owner_id=?',s.owner_id).toArray().map(a=>agentView(a as unknown as AgentRow))};
  }
  if(action==='logout'){this.session(input,now,true);this.sql.exec('DELETE FROM sessions WHERE session_hash=?',input.session_hash!);return {};}
  if(action==='approve'){
   const {s,account}=this.session(input,now,true);this.admit(account);const a=this.claim(input.id!,input.claim_hash!,true);
   if(input.risk_ack_version!=='toktok-risk-v1')fail(400,'RISK_ACK_REQUIRED','에이전트 권한과 실행에 대한 안내 확인이 필요합니다.');
   this.sql.exec('INSERT INTO risk_ack VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET version=excluded.version,confirmed_at=excluded.confirmed_at',s.owner_id,input.risk_ack_version,now);
   this.sql.exec("UPDATE agents SET status='approved',owner_id=?,credential_expiry=? WHERE id=? AND status='pending'",s.owner_id,now+2592000000,a.id);return {agent:agentView(this.agent(a.id))};
  }
  if(action==='revoke'){const {s}=this.session(input,now,true);const a=this.agent(input.id!);if(a.owner_id!==s.owner_id)fail(403,'OWNER_DENIED','본인 소유 에이전트만 폐기할 수 있습니다.');this.sql.exec("UPDATE agents SET status='revoked' WHERE id=?",a.id);return {agent:agentView(this.agent(a.id))};}
  if(action==='creator'){
   let a:AgentRow;
   if(input.token_hash){const row=this.sql.exec('SELECT * FROM agents WHERE token_hash=?',input.token_hash).toArray()[0] as unknown as AgentRow|undefined;if(!row)fail(401,'AGENT_REQUIRED','승인된 에이전트 인증정보가 필요합니다.');a=row;}
   else {const {s,account}=this.session(input,now,true);this.admit(account);a=this.agent(input.id!);if(a.owner_id!==s.owner_id)fail(403,'OWNER_DENIED','본인 소유 에이전트만 선택할 수 있습니다.');}
   if(a.status!=='approved'||now>=a.credential_expiry!)fail(403,'AGENT_NOT_APPROVED','승인된 유효 에이전트만 방을 만들 수 있습니다.');
   const account=this.sql.exec('SELECT * FROM accounts WHERE id=?',a.owner_id!).one() as unknown as Account;this.admit(account);
   const ack=this.ack(account.id);if(ack?.version!=='toktok-risk-v1')fail(403,'RISK_ACK_REQUIRED','소유자의 안내 확인이 필요합니다.');return {creator_id:a.id,principal:{authenticated:true,creator_authorized:true,entitlements:entitlements(settings,account),owner_ack:ack}};
  }
  fail(404,'NOT_FOUND','경로가 없습니다.');
 }
 async fetch(request:Request){
  try{
   const input=await request.json() as RegistryInput;this.init();let result:unknown;const action=new URL(request.url).pathname.slice(1),now=input.now??Date.now();
   this.ctx.storage.transactionSync(()=>this.cleanup(now));
   if(action==='register')input.ip_hash=await this.otp.digest('registration-ip',input.ip!);
   if(action==='email-reserve'){
    const settings=this.settings.read().settings;
    result=await this.otp.reserve(input,settings.identity.emailLimits,now,f=>{if(f.claim_id)this.claim(f.claim_id,f.claim_hash!,true);},(email,f)=>this.emailEligible(email,f,now),settings.identity.otpLifetimeSeconds);
   }else if(action==='email-result')result=this.ctx.storage.transactionSync(()=>this.otp.result(input));
   else if(action==='budget-reserve')result=this.settings.reserveBudget(input.operation_id!,input.kind!,input.amount!,now);
   else if(action==='complete'){
    const settings=this.settings.read().settings;
    await this.otp.verify(input,now,()=>{this.flow(input,now);},(email)=>{
     const flow=this.flow(input,now);let account=this.account(email);
     if(!this.emailEligible(email,flow,now))fail(403,'ADMISSION_DENIED','가입 자격을 확인하지 못했습니다.');
     if(!account){const bootstrap=this.bootstrapEligible(email),invited=Boolean(flow.invitation_id);
      if(invited)this.invitations.consume(flow.invitation_id!,now);
      const id=crypto.randomUUID(),kind=bootstrap?'bootstrap':invited?'invited':'hosted';
      this.sql.exec("INSERT INTO accounts VALUES(?,?,?,?,1,'member',?,1,1)",id,'email-otp',email,email,kind);account=this.account(email)!;
     }
     this.sql.exec('UPDATE auth_transactions SET consumed=1 WHERE flow_hash=?',input.flow_hash!);
     this.sql.exec('INSERT INTO sessions VALUES(?,?,?,?)',input.session_hash!,account.id,input.csrf!,now+settings.identity.sessionTtlSeconds*1000);
    },settings.identity.otpAttempts);result={session_ttl_seconds:settings.identity.sessionTtlSeconds};
   }else this.ctx.storage.transactionSync(()=>{result=this.action(action,input,now);});
   await this.schedule();return json(result);
  }catch(error){return errorResponse(error);}
 }
}
