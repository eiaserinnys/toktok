import {memberPrivate,PRIVATE_LIFETIME_POLICY} from './private-lifetime';
import type {ControlDomain} from './control-core';
import type {RegistryInput} from './identity-types';
import {C,save,read,digest,expire,required} from './control-records';
import {authorizePrivatePersistence,entitlements,newBudgetOperation,type CreatorPrincipal} from './control-policy';
import {PRIVATE_NOTICE,MAX_PRIVATE_PURPOSE_CHARACTERS,type PrivateCreatorAck,type PrivateRoomInit} from './private-contracts';
import {requireEnforcement} from './control-installation';
import {HttpError,bad,fail,text,hash} from './http';
import {CreationResultError} from './control-errors';
export interface CreationBody {purpose:unknown;ttl_seconds?:unknown;persist?:unknown;retention_seconds?:unknown;client_request_id:unknown;}
export interface CreationContextInput {context_hash:string;nonce_hash:string;}
export interface CreationGrantInput {context_hash:string;nonce_hash:string;grant_hash:string;risk_ack:boolean;risk_ack_version:string;}
export interface CreationReserveInput {body:CreationBody;grant_hash?:string;invite_hash:string;read_hash:string;owner_hash:string;}
export interface CreationCommitInput {room_id:string;proof:'initialized'|'closed'|'uninitialized';}
interface Context {lifetime_policy?:string;nonce_hash:string;owner_id:string|null;expires_at:number;consumed:boolean;}
interface Grant {lifetime_policy?:string;context_hash:string;owner_id:string|null;issuer_ip:string;ack:PrivateCreatorAck;expires_at:number;valid_until:number;consumed:boolean;}
interface Slot {id:string;expires_at:number|null;status:'pending'|'active'|'closed'|'expired'|'failed';ips:string[];snapshot:PrivateRoomInit;request_key:string;request_digest:string;}
/** All helpers share the current control transaction: grant, quota, slot and budget commit together. */
export class CreationAdmissions {
 constructor(private d:ControlDomain){}
 private get tx(){return this.d.tx;}private get now(){return this.d.now;}
 private admissionBudget(){return this.d.settings.reserveBudget(newBudgetOperation(this.now,this.now+60000),'admission_requests',1,this.now);}
 private async ip(raw:string|undefined){if(!raw)fail(503,'TRUSTED_IP_REQUIRED','생성 요청 주소를 확인하지 못했습니다.');return digest(this.tx,'create-ip',raw);}
 /** Creation-screen projection only; it cannot log in, mutate settings, or list agents. */
 async options(input:RegistryInput){
  let session:object={authenticated:false,role:'anonymous',can_bootstrap_admin:false,entitlements:{can_create_private:false,can_persist_private:false},csrf_token:null,owner_ack:null};
  const member=Boolean(input.session_hash);
  if(member){const {s,account}=await this.d.session(input);await this.d.admit(account);session={authenticated:true,role:account.role,can_bootstrap_admin:false,entitlements:entitlements((await this.d.settings.read()).settings,account),csrf_token:s.csrf,owner_ack:await this.d.ack(account.id)};}
  else await this.admissionBudget();
  return {session,config:await this.d.settings.projection(),demo_budget_exempt:member};
 }
 async context(input:RegistryInput){
  const c=input.creation_context!;if(!c?.context_hash||!c.nonce_hash)bad();let owner_id:string|null=null,can_persist=false;
  if(input.session_hash){const {account}=await this.d.session(input,true);await this.d.admit(account);owner_id=account.id;const s=(await this.d.settings.read()).settings;can_persist=entitlements(s,account).can_persist_private&&s.private.persistenceAllowed;}
  if(owner_id===null)await this.admissionBudget();
  const expires_at=this.now+600000;await save(this.tx,C.flows,'ctx:'+c.context_hash,{nonce_hash:c.nonce_hash,owner_id,expires_at,consumed:false,lifetime_policy:PRIVATE_LIFETIME_POLICY});await expire(this.tx,C.flows,'ctx:'+c.context_hash,expires_at);
  return {expires_at,notice_version:PRIVATE_NOTICE,authenticated:owner_id!==null,can_persist_private:can_persist,demo_budget_exempt:owner_id!==null,lifetime_policy:PRIVATE_LIFETIME_POLICY};
 }
 async grant(input:RegistryInput){
  const g=input.creation_grant!;if(!g||g.risk_ack!==true||g.risk_ack_version!==PRIVATE_NOTICE)fail(400,'RISK_ACK_REQUIRED','안내를 직접 확인해야 합니다.');
  const c=await read<Context>(this.tx,C.flows,'ctx:'+g.context_hash);if(!c||c.lifetime_policy!==PRIVATE_LIFETIME_POLICY||c.consumed||c.expires_at<=this.now||c.nonce_hash!==g.nonce_hash)fail(403,'CREATE_CONTEXT_DENIED','생성 확인 흐름을 사용할 수 없습니다.');
  let owner_id:string|null=null;if(input.session_hash){const {account}=await this.d.session(input,true);await this.d.admit(account);owner_id=account.id;}if(owner_id!==c.owner_id)fail(403,'CREATE_CONTEXT_DENIED','생성 확인 계정이 바뀌었습니다.');
  if(owner_id===null)await this.admissionBudget();
  const ack:PrivateCreatorAck={kind:owner_id?'account_confirmation':'anonymous_declaration',version:PRIVATE_NOTICE,confirmed_at:this.now,owner_account_id:owner_id};
  if(owner_id)await save(this.tx,C.accounts,'ack:'+owner_id,{version:PRIVATE_NOTICE,confirmed_at:this.now});
  const expires_at=this.now+300000;await save(this.tx,C.flows,'ctx:'+g.context_hash,{...c,consumed:true});await save(this.tx,C.flows,'grant:'+g.grant_hash,{context_hash:g.context_hash,owner_id,issuer_ip:await this.ip(input.ip),ack,expires_at,valid_until:expires_at,consumed:false,lifetime_policy:PRIVATE_LIFETIME_POLICY});await expire(this.tx,C.flows,'grant:'+g.grant_hash,expires_at);return {expires_at,notice_version:PRIVATE_NOTICE,demo_budget_exempt:owner_id!==null};
 }
 private async principal(input:RegistryInput){
  const grantHash=input.creation?.grant_hash;
  if(grantHash){
   const grant=await read<Grant>(this.tx,C.flows,'grant:'+grantHash);if(!grant||grant.lifetime_policy!==PRIVATE_LIFETIME_POLICY||!grant.consumed&&grant.valid_until<=this.now)fail(403,'OPERATOR_ACK_REQUIRED','/api/private/create-context에서 생성 안내를 확인하세요.');
   if(input.session_hash){const {account}=await this.d.session(input,true);if(account.id!==grant.owner_id)fail(403,'CREATOR_DENIED','생성 확인 계정과 일치해야 합니다.');}
   let principal:CreatorPrincipal={authenticated:false,creator_authorized:false,entitlements:{can_create_private:false,can_persist_private:false},owner_ack:null};
   if(grant.owner_id){const account=required(await this.d.accountById(grant.owner_id));await this.d.admit(account);principal={authenticated:true,creator_authorized:true,entitlements:entitlements((await this.d.settings.read()).settings,account),owner_ack:grant.ack};}
   return {subject:grant.owner_id??'anonymous:'+grant.context_hash,creator_id:grant.owner_id??'anonymous:'+grant.context_hash,ack:grant.ack,principal,grant,grantHash};
  }
  if(!input.token_hash)fail(403,'OPERATOR_ACK_REQUIRED','/api/private/create-context에서 생성 안내를 확인하세요.');
  const creator=await this.d.creator(input),ack:PrivateCreatorAck={kind:'agent_owner_confirmation',version:PRIVATE_NOTICE,confirmed_at:creator.principal.owner_ack.confirmed_at,owner_account_id:creator.owner_account_id};
  return {subject:'agent:'+creator.creator_id,creator_id:creator.creator_id,principal:creator.principal,ack,grant:null,grantHash:null};
 }
 async reserve(input:RegistryInput){
  const creation=input.creation;if(!creation)bad();if([creation.invite_hash,creation.read_hash,creation.owner_hash].some(h=>!/^[a-f0-9]{64}$/.test(h)))bad();const b=creation.body,purpose=text(b.purpose,0,MAX_PRIVATE_PURPOSE_CHARACTERS),client=text(b.client_request_id,1,128);
  const owner=await this.principal(input),requestKey='create:'+await digest(this.tx,owner.subject,client),requestDigest=await hash(JSON.stringify({purpose,ttl_seconds:b.ttl_seconds??null,persist:b.persist??false,retention_seconds:b.retention_seconds??null}));
  const old=await this.tx.get(C.settings,requestKey);if(old&&Number(old.expires_at)>this.now){if(old.request_digest!==requestDigest)fail(409,'IDEMPOTENCY_CONFLICT','같은 생성 요청의 내용이 다릅니다.');const slot=required(await read<Slot>(this.tx,C.settings,'room:'+String(old.room_id)));if(slot.status==='pending')throw new CreationResultError('CREATE_PENDING','방 초기화를 확인하고 있습니다.',slot.id);throw new CreationResultError('CREATE_RESULT_NOT_RECOVERABLE','최초 생성 결과와 관리 키는 복구할 수 없습니다.',slot.id);}
  if(owner.grant&&(owner.grant.consumed||owner.grant.valid_until<=this.now))fail(403,'OPERATOR_ACK_REQUIRED','새 생성 확인이 필요합니다.');
  const stored=await this.d.settings.read(),settings=stored.settings,state=await this.d.settings.state();requireEnforcement(this.d.options.enforcement,this.d.repositoryReady);
  if(!settings.deployment.enabled||!state.budget_ready||!state.lifecycle_ready)fail(503,'DEPLOYMENT_DISABLED','방 생성을 준비하고 있습니다.');
  const checked=authorizePrivatePersistence(settings,owner.principal,{visibility:'private',persist:b.persist,ttl_seconds:b.ttl_seconds,retention_seconds:b.retention_seconds});
  const requestIp=await this.ip(input.ip),ips=[...new Set([requestIp,...(owner.grant?[owner.grant.issuer_ip]:[])])],hour=new Date(this.now).toISOString().slice(0,13),day=new Date(this.now).toISOString().slice(0,10),hourEnd=(Math.floor(this.now/3600000)+1)*3600000;
  const dayKey='private-day:'+day,daily=Number((await this.tx.get(C.settings,dayKey))?.n??0);const member=checked.lifetime==='member_permanent';let retry=!member&&(state.active_private-(state.member_private??0)>=settings.private.activeGlobal||daily>=settings.private.dailyCreates);
  const counts=[];for(const ip of ips){const hourKey=`private-hour:${ip}:${hour}`,activeKey='private-active:'+ip,h=Number((await this.tx.get(C.settings,hourKey))?.n??0),a=Number((await this.tx.get(C.settings,activeKey))?.n??0);if(h>=settings.private.createPerIpHour||!member&&a>=settings.private.activePerIp)retry=true;counts.push({hourKey,activeKey,h,a});}
  if(retry)throw new HttpError(429,'CREATE_RATE_LIMITED','방 생성 또는 활성 방 한도에 도달했습니다.',Math.max(1,Math.ceil((hourEnd-this.now)/1000)));
  if(!member){await this.admissionBudget();await this.d.settings.reserveBudget(newBudgetOperation(this.now,this.now+60000),'private_creates',1,this.now);}
  const id=crypto.randomUUID(),expires_at=checked.ttl_seconds===null?null:this.now+checked.ttl_seconds*1000,retryUntil=this.now+86400000;
  for(const c of counts){await save(this.tx,C.settings,c.hourKey,{n:c.h+1,expires_at:hourEnd});await expire(this.tx,C.settings,c.hourKey,hourEnd);if(!member)await save(this.tx,C.settings,c.activeKey,{n:c.a+1});}
  const dayEnd=(Math.floor(this.now/86400000)+1)*86400000;if(!member){await save(this.tx,C.settings,dayKey,{n:daily+1,expires_at:dayEnd});await expire(this.tx,C.settings,dayKey,dayEnd);}await this.d.settings.stateSave({...state,active_private:state.active_private+1,member_private:(state.member_private??0)+(member?1:0)});
  const snapshot:PrivateRoomInit={id,creator_id:owner.creator_id,created_at:this.now,expires_at,lifetime:checked.lifetime,purpose,invite_hash:creation.invite_hash,read_hash:creation.read_hash,owner_hash:creation.owner_hash,settings_revision:stored.revision,mode:checked.mode==='demo'?'DEMO':'HOSTED',visibility:'private',persist:checked.persist,retention_seconds:checked.retention_seconds,notice_version:PRIVATE_NOTICE,creator_ack:owner.ack,policy:settings.private.policy};
  // Lifecycle metadata survives until explicit closure; retry/confirmation state is bounded independently.
  await save(this.tx,C.settings,'pending:'+id,{id,expires_at:retryUntil});await expire(this.tx,C.settings,'pending:'+id,retryUntil);
  await save(this.tx,C.settings,'room:'+id,{id,expires_at,status:'pending',ips:member?[]:ips,snapshot,request_key:requestKey,request_digest:requestDigest});if(expires_at!==null)await expire(this.tx,C.settings,'room:'+id,expires_at);
  await save(this.tx,C.settings,requestKey,{room_id:id,expires_at:retryUntil,request_digest:requestDigest});await expire(this.tx,C.settings,requestKey,retryUntil);
  if(owner.grant){await save(this.tx,C.flows,'grant:'+owner.grantHash,{...owner.grant,consumed:true,expires_at:retryUntil});await expire(this.tx,C.flows,'grant:'+owner.grantHash,retryUntil);}
  return {room_id:id,snapshot,state:'pending'};
 }
 async pending(){const rows=await this.tx.list(C.settings,{prefix:'pending:',limit:50});const result=[];for(const row of rows){const slot=await read<Slot>(this.tx,C.settings,'room:'+String(row.value.id));if(slot&&slot.status==='pending'&&(slot.expires_at===null||slot.expires_at>this.now))result.push({room_id:slot.id,snapshot:slot.snapshot,state:slot.status});}return {pending:result};}
 private async release(slot:Slot,status:'closed'|'expired'|'failed'){
  if(['closed','expired','failed'].includes(slot.status))return;await this.tx.delete(C.settings,'pending:'+slot.id);
  for(const ip of slot.ips){const key='private-active:'+ip,n=Number((await this.tx.get(C.settings,key))?.n??0);await save(this.tx,C.settings,key,{n:Math.max(0,n-1)});}
  const state=await this.d.settings.state();await this.d.settings.stateSave({...state,active_private:Math.max(0,state.active_private-1),member_private:Math.max(0,(state.member_private??0)-(memberPrivate(slot.snapshot)?1:0))});await save(this.tx,C.settings,'room:'+slot.id,{...slot,status});
 }
 async expireRoom(id:string){const slot=await read<Slot>(this.tx,C.settings,'room:'+id);if(slot&&slot.expires_at!==null&&slot.expires_at<=this.now)await this.release(slot,'expired');}
 async commit(input:RegistryInput){
  const commit=input.creation_commit;if(!commit||!['initialized','closed','uninitialized'].includes(commit.proof))bad();const slot=await read<Slot>(this.tx,C.settings,'room:'+commit.room_id);if(!slot)fail(410,'ROOM_GONE','생성 예약이 만료되었습니다.');
  if(slot.expires_at!==null&&slot.expires_at<=this.now){await this.release(slot,'expired');return {room_id:slot.id,state:'expired'};}
  if(commit.proof==='initialized'){if(slot.status==='pending'){await save(this.tx,C.settings,'room:'+slot.id,{...slot,status:'active'});await this.tx.delete(C.settings,'pending:'+slot.id);}else if(slot.status!=='active')fail(409,'CREATE_STATE_CONFLICT','이미 종료한 생성 예약입니다.');return {room_id:slot.id,state:'active'};}
  if(commit.proof==='uninitialized'&&slot.status!=='pending')fail(409,'CREATE_STATE_CONFLICT','초기화된 방은 먼저 종료를 확인해야 합니다.');await this.release(slot,commit.proof==='closed'?'closed':'failed');return {room_id:slot.id,state:commit.proof==='closed'?'closed':'failed'};
 }
}
