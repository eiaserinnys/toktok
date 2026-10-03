import type {RepositoryPort} from './storage/repository';
import {C,type Tx,save,read,required,digest,expire,cleanExpired,nextExpiry} from './control-records';
import {SettingsStore} from './settings-store';
import {Invitations} from './invitations';
import {OtpStore} from './otp-store';
import {SETTINGS_SCHEMA} from './settings-schema';
import {entitlements,signupEligible,type Account} from './control-policy';
import {normalizeEmail} from './email';
import {fail,limited,bad} from './http';
import {type RegistryInput,type AgentRow,type FlowRow,type SessionRow,agentView} from './identity-types';
import {CreationAdmissions} from './create-admission';
import {AdminRecovery} from './admin-recovery';
import {requireEnforcement,type TrustedEnforcement,type InstallationSeed} from './control-installation';
export interface ControlOptions {bootstrapEmail?:string;installation?:InstallationSeed;enforcement?:TrustedEnforcement;}
/** One domain, injected into CF and Node. No mail/HTTP/longpoll IO in a transaction. */
export class ControlCore {
 constructor(readonly repository:RepositoryPort,readonly options:ControlOptions={}){}
 async execute(action:string,input:RegistryInput):Promise<unknown>{
  const now=input.now??Date.now();const result=await this.repository.transaction('control',async tx=>{
   const domain=new ControlDomain(tx,this.options,now,this.repository.ready());await domain.init();return domain.execute(action,input);
  });
  // A failed OTP comparison is a committed counter change, not a transaction rollback.
  if(action==='complete'&&(result as {otp_valid?:boolean}).otp_valid===false)fail(401,'OTP_INVALID','코드가 올바르지 않거나 만료·폐기되었습니다.');return result;
 }
 async maintain(now=Date.now()){return this.repository.transaction('control',async tx=>{const d=new ControlDomain(tx,this.options,now,this.repository.ready());await d.init();return nextExpiry(tx);});}
 async connect(enforcement:TrustedEnforcement){requireEnforcement(enforcement,this.repository.ready());this.options.enforcement=enforcement;return this.repository.transaction('control',async tx=>{const store=new SettingsStore(tx);await store.init(Date.now(),this.options.installation,enforcement,this.repository.ready());const s=await store.state();await store.stateSave({...s,budget_ready:true,lifecycle_ready:true});});}
}
export class ControlDomain {
 readonly settings:SettingsStore;readonly invitations:Invitations;readonly otp:OtpStore;
 constructor(readonly tx:Tx,readonly options:ControlOptions,readonly now:number,readonly repositoryReady:boolean){this.settings=new SettingsStore(tx);this.invitations=new Invitations(tx);this.otp=new OtpStore(tx);}
 async init(){await this.settings.init(this.now,this.options.installation,this.options.enforcement,this.repositoryReady);await cleanExpired(this.tx,this.now,async()=>{const s=await this.settings.state();await this.settings.stateSave({...s,pending_agents:Math.max(0,s.pending_agents-1)});},id=>new CreationAdmissions(this).expireRoom(id));}
 async account(email:string){const index=await this.tx.get(C.accounts,'email:'+await digest(this.tx,'account-email',email));return index?read<Account>(this.tx,C.accounts,'a:'+String(index.id)):undefined;}
 async accountById(id:string){return read<Account>(this.tx,C.accounts,'a:'+id);}
 private bootstrapAddress(){try{return this.options.bootstrapEmail?normalizeEmail(this.options.bootstrapEmail):null;}catch{return null;}}
 async bootstrapEligible(email:string){return email===this.bootstrapAddress()&&!(await this.settings.state()).bootstrap_consumed&&!await this.tx.get(C.accounts,'admin');}
 async canBootstrap(account:Account){return account.role==='member'&&account.email_verified===1&&await this.bootstrapEligible(account.email);}
 async emailEligible(email:string,flow:FlowRow){return signupEligible((await this.settings.read()).settings,flow.purpose,Boolean(await this.account(email)),Boolean(flow.invitation_id&&await this.invitations.valid(flow.invitation_id,this.now)),await this.bootstrapEligible(email));}
 async agent(id:string){const a=await read<AgentRow>(this.tx,C.agents,'a:'+id);if(!a||a.status==='pending'&&a.pending_expiry<=this.now)fail(410,'CLAIM_GONE','등록이 만료되었거나 없습니다.');return a;}
 async claim(id:string,cap:string,pending=false){const a=await this.agent(id);if(a.claim_hash!==cap)fail(403,'CLAIM_DENIED','claim 권한이 올바르지 않습니다.');if(pending&&a.status!=='pending')fail(409,'CLAIM_PROCESSED','이미 처리한 등록입니다.');return a;}
 async session(input:RegistryInput,mutation=false){
  const s=await read<SessionRow>(this.tx,C.sessions,input.session_hash??'missing');if(!s||s.expires_at<=this.now)fail(401,'SESSION_REQUIRED','사람 확인 세션이 필요합니다.');
  if(mutation&&(!input.csrf||input.csrf!==s.csrf))fail(403,'CSRF_DENIED','세션의 CSRF 확인값이 필요합니다.');const account=await this.accountById(s.owner_id);if(!account)fail(401,'SESSION_REQUIRED','유효한 계정이 필요합니다.');return {s,account};
 }
 async admin(input:RegistryInput,mutation=false){const {account}=await this.session(input,mutation);if(account.role!=='admin')fail(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');return account;}
 async admit(account:Account){if(!entitlements((await this.settings.read()).settings,account).can_create_private)fail(403,'ADMISSION_DENIED','현재 계정의 생성 권한이 필요합니다.');}
 async flow(input:RegistryInput){
  const f=await read<FlowRow>(this.tx,C.flows,'f:'+input.flow_hash!);if(!f||f.expires_at<=this.now)fail(403,'AUTH_FLOW_DENIED','인증 흐름이 없거나 만료되었습니다.');if(f.consumed)fail(409,'AUTH_FLOW_USED','이미 사용한 인증 흐름입니다.');
  if(f.nonce_hash!==input.nonce_hash||f.browser_hash!==input.browser_hash||f.claim_id!==(input.claim?.agent_id??null)||f.claim_hash!==(input.claim?.claim_hash??null))fail(403,'AUTH_FLOW_DENIED','인증 흐름의 결합이 일치하지 않습니다.');if(f.claim_id)await this.claim(f.claim_id,f.claim_hash!,true);return f;
 }
 async ack(owner:string){return await read<{version:string;confirmed_at:number}>(this.tx,C.accounts,'ack:'+owner)??null;}
 async creator(input:RegistryInput){
  let a:AgentRow;if(input.token_hash){const index=await this.tx.get(C.agents,'t:'+input.token_hash);if(!index)fail(401,'AGENT_REQUIRED','승인된 에이전트 인증정보가 필요합니다.');a=await this.agent(String(index.id));}
  else {const {s,account}=await this.session(input,true);await this.admit(account);a=await this.agent(input.id!);if(a.owner_id!==s.owner_id)fail(403,'OWNER_DENIED','본인 소유 에이전트만 선택할 수 있습니다.');}
  if(a.status!=='approved'||this.now>=a.credential_expiry!)fail(403,'AGENT_NOT_APPROVED','승인된 유효 에이전트만 방을 만들 수 있습니다.');const account=required(await this.accountById(a.owner_id!));await this.admit(account);
  const ack=await this.ack(account.id);if(ack?.version!=='toktok-risk-v2')fail(403,'RISK_ACK_REQUIRED','소유자의 안내 확인이 필요합니다.');return {creator_id:a.id,owner_account_id:account.id,principal:{authenticated:true,creator_authorized:true,entitlements:entitlements((await this.settings.read()).settings,account),owner_ack:ack}};
 }
 async execute(action:string,input:RegistryInput):Promise<unknown>{
  const settings=(await this.settings.read()).settings,now=this.now;
  if(action==='config')return this.settings.projection();
  // Trusted host transport only. Never dispatch this action from a public route.
  if(action==='get-runtime-config'){const row=await this.settings.read();return {settings:row.settings,revision:row.revision,readiness:await this.settings.state(),public_generations:await this.settings.publicGenerations()};}
  if(action==='invitation-validate')return this.invitations.validate(input.token_hash!,input.invitation_validation_hash!,input.browser_hash!,now);
  if(action==='admin-recovery-reserve'){
   if(typeof input.mutation!=='boolean')bad();await this.admin(input,input.mutation);
   return new AdminRecovery(this.tx).reserve({session_hash:input.session_hash!,csrf:input.csrf,mutation:input.mutation,operation_id:input.operation_id!},now);
  }
  if(action==='admin-bootstrap'){
   const {account}=await this.session(input,true);if(input.confirm!==true||!await this.canBootstrap(account))fail(403,'BOOTSTRAP_DENIED','최초 관리자 확인을 진행할 수 없습니다.');
   await save(this.tx,C.accounts,'a:'+account.id,{...account,role:'admin'});await save(this.tx,C.accounts,'admin',{id:account.id});await this.settings.stateSave({...await this.settings.state(),bootstrap_consumed:true});await this.settings.audit(account.id,now,'admin.bootstrap',null,{});return {bootstrapped:true};
  }
  if(action.startsWith('admin-')){
   const mutation=['admin-settings-update','admin-invitation-create','admin-invitation-revoke'].includes(action),account=await this.admin(input,mutation);
   if(action==='admin-settings')return this.settings.read();if(action==='admin-schema')return {schema_version:1,schema:SETTINGS_SCHEMA};if(action==='admin-budget')return this.settings.budget(now);
   if(action==='admin-settings-update')return this.settings.update(input.expected_revision,input.settings,account.id,now);
   if(action==='admin-audit')return {audit:await this.settings.listAudit(input.limit!)};
   if(action==='admin-invitations')return {invitations:await this.invitations.list(input.limit!,now)};
   if(action==='admin-invitation-create'){const ttl=input.ttl_seconds??settings.identity.invitationTtlSeconds;if(!Number.isSafeInteger(ttl)||ttl<1||ttl>2592000)bad();const invite=await this.invitations.create(input.id!,input.token_hash!,now+ttl*1000,now);await this.settings.audit(account.id,now,'invitation.create',null,{id:invite.id,status:invite.status});return invite;}
   if(action==='admin-invitation-revoke'){const result=await this.invitations.revoke(input.id!);await this.settings.audit(account.id,now,'invitation.revoke',null,result);return result;}
  }
  if(action==='register'){
   const key='register:'+await digest(this.tx,'registration-ip',input.ip!)+':'+Math.floor(now/60000),row=await this.tx.get(C.otp,key),state=await this.settings.state();
   if(Number(row?.n??0)>=5||state.pending_agents>=1000)limited();await save(this.tx,C.otp,key,{n:Number(row?.n??0)+1,expires_at:(Math.floor(now/60000)+1)*60000});await expire(this.tx,C.otp,key,(Math.floor(now/60000)+1)*60000);
   const a={id:input.id!,name:input.name!,token_hash:input.token_hash!,claim_hash:input.claim_hash!,status:'pending',pending_expiry:now+86400000,credential_expiry:null,owner_id:null,expires_at:now+86400000};
   await save(this.tx,C.agents,'a:'+a.id,a);await save(this.tx,C.agents,'t:'+a.token_hash,{id:a.id});await this.settings.stateSave({...state,pending_agents:state.pending_agents+1});await expire(this.tx,C.agents,'a:'+a.id,a.expires_at);return {agent:agentView(a)};
  }
  if(action==='claim')return {agent:agentView(await this.claim(input.id!,input.claim_hash!))};
  if(action==='agent'){const index=await this.tx.get(C.agents,'t:'+input.token_hash!);if(!index)fail(401,'AGENT_REQUIRED','에이전트 인증정보가 없거나 만료되었습니다.');return {agent:agentView(await this.agent(String(index.id)))};}
  if(action==='start'){
   if(!['login','signup','claim'].includes(input.purpose!))bad();if(input.purpose==='claim'&&!input.claim)bad();if(input.claim)await this.claim(input.claim.agent_id,input.claim.claim_hash,true);
   const invitation=input.invitation_validation_hash?await this.invitations.bind(input.invitation_validation_hash,input.browser_hash!,now):null;
   if(input.purpose==='signup'&&(settings.deployment.mode==='demo'||settings.signup.policy==='invite')&&!invitation)fail(400,'INVALID_INVITATION','초대 코드 확인이 필요합니다.');if(input.purpose==='signup'&&settings.signup.policy==='closed')fail(403,'SIGNUP_CLOSED','현재 가입을 받지 않습니다.');
   const expires_at=now+settings.identity.flowTtlSeconds*1000,key='f:'+input.flow_hash!;await save(this.tx,C.flows,key,{flow_hash:input.flow_hash!,nonce_hash:input.nonce_hash!,browser_hash:input.browser_hash!,claim_id:input.claim?.agent_id??null,claim_hash:input.claim?.claim_hash??null,expires_at,consumed:0,purpose:input.purpose!,invitation_id:invitation,email_key:null});await expire(this.tx,C.flows,key,expires_at);return {expires_at};
  }
  if(action==='validate'){await this.flow(input);return {};}
  if(action==='session'){
   const {s,account}=await this.session(input);const agents=(await this.tx.list(C.agents,{prefix:'o:'+s.owner_id+':',limit:50})).map(r=>agentView(r.value as unknown as AgentRow));return {authenticated:true,role:account.role,can_bootstrap_admin:await this.canBootstrap(account),entitlements:entitlements(settings,account),csrf_token:s.csrf,owner_ack:await this.ack(account.id),agents};
  }
  if(action==='logout'){await this.session(input,true);await this.tx.delete(C.sessions,input.session_hash!);return {};}
  if(action==='approve'){
   const {s,account}=await this.session(input,true);await this.admit(account);const a=await this.claim(input.id!,input.claim_hash!,true);if(input.risk_ack_version!=='toktok-risk-v2')fail(400,'RISK_ACK_REQUIRED','에이전트 권한과 실행에 대한 안내 확인이 필요합니다.');
   await save(this.tx,C.accounts,'ack:'+s.owner_id,{version:input.risk_ack_version,confirmed_at:now});const approved={...a,status:'approved',owner_id:s.owner_id,credential_expiry:now+2592000000,expires_at:now+2592000000};
   await save(this.tx,C.agents,'a:'+a.id,approved);await save(this.tx,C.agents,'o:'+s.owner_id+':'+a.id,approved);await this.settings.stateSave({...await this.settings.state(),pending_agents:(await this.settings.state()).pending_agents-1});await expire(this.tx,C.agents,'a:'+a.id,approved.expires_at);return {agent:agentView(approved)};
  }
  if(action==='revoke'){const {s}=await this.session(input,true),a=await this.agent(input.id!);if(a.owner_id!==s.owner_id)fail(403,'OWNER_DENIED','본인 소유 에이전트만 폐기할 수 있습니다.');const revoked={...a,status:'revoked'};await save(this.tx,C.agents,'a:'+a.id,revoked);await save(this.tx,C.agents,'o:'+s.owner_id+':'+a.id,revoked);return {agent:agentView(revoked)};}
  if(action==='creator')return this.creator(input);
  if(action==='email-reserve')return this.otp.reserve(input,settings.identity.emailLimits,now,async f=>{if(f.claim_id)await this.claim(f.claim_id,f.claim_hash!,true);},(email,f)=>this.emailEligible(email,f),settings.identity.otpLifetimeSeconds);
  if(action==='email-result')return this.otp.result(input);
  if(action==='budget-reserve')return this.settings.reserveBudget(input.operation_id!,input.kind!,input.amount!,now);
  if(action==='complete'){
   const valid=await this.otp.verify(input,now,async()=>{await this.flow(input);},async email=>{
    const flow=await this.flow(input);let account=await this.account(email);if(!await this.emailEligible(email,flow))fail(403,'ADMISSION_DENIED','가입 자격을 확인하지 못했습니다.');
    if(!account){const bootstrap=await this.bootstrapEligible(email),invited=Boolean(flow.invitation_id);if(invited)await this.invitations.consume(flow.invitation_id!,now);
     account={id:crypto.randomUUID(),provider:'email-otp',subject:email,email,email_verified:1,role:'member',admission_kind:bootstrap?'bootstrap':invited?'invited':'hosted',can_create_private:1,can_persist_private:1};await save(this.tx,C.accounts,'a:'+account.id,account);await save(this.tx,C.accounts,'email:'+await digest(this.tx,'account-email',email),{id:account.id});
    }
    await save(this.tx,C.flows,'f:'+input.flow_hash!,{...flow,consumed:1});const expires_at=now+settings.identity.sessionTtlSeconds*1000;await save(this.tx,C.sessions,input.session_hash!,{owner_id:account.id,csrf:input.csrf!,expires_at});await expire(this.tx,C.sessions,input.session_hash!,expires_at);
   },settings.identity.otpAttempts);return valid?{session_ttl_seconds:settings.identity.sessionTtlSeconds}:{otp_valid:false};
  }
  const creation=new CreationAdmissions(this);
  if(action==='create-context')return creation.context(input);
  if(action==='create-grant')return creation.grant(input);
  if(action==='create-reserve')return creation.reserve(input);
  if(action==='create-commit')return creation.commit(input);
  if(action==='create-options')return creation.options(input);
  if(action==='create-pending')return creation.pending();
  fail(404,'NOT_FOUND','경로가 없습니다.');
 }
}
