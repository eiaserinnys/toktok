import {DEMO_PRIVATE_TTL_SECONDS} from './private-lifetime';
import {bad,fail} from './http';
import type {Settings,BudgetKind} from './settings-schema';
export interface Account {id:string;provider:string;subject:string;email:string;email_verified:number;role:'member'|'admin';admission_kind:'invited'|'hosted'|'bootstrap';can_create_private:number;can_persist_private:number;}
export interface Entitlements {can_create_private:boolean;can_persist_private:boolean;}
export function entitlements(settings:Settings,account?:Account):Entitlements{
 const admitted=Boolean(account?.email_verified&&account.can_create_private);
 const kindAllowed=settings.deployment.mode==='hosted'||account?.admission_kind==='invited'||account?.admission_kind==='bootstrap';
 return {can_create_private:admitted&&kindAllowed,can_persist_private:Boolean(admitted&&account?.can_persist_private&&kindAllowed)};
}
export function signupEligible(settings:Settings,purpose:string,existing:boolean,validInvite:boolean,bootstrap:boolean):boolean{
 if(existing||bootstrap)return true;
 return purpose==='signup'&&settings.signup.policy!=='closed'&&(validInvite||settings.deployment.mode==='hosted'&&settings.signup.policy==='open');
}
export interface OwnerAck {version:string;confirmed_at:number;}
export interface CreatorPrincipal {authenticated:boolean;entitlements:Entitlements;creator_authorized:boolean;owner_ack:OwnerAck|null;}
/** Trusted principal only: never take entitlement or owner ack from a request body. */
export function authorizePrivatePersistence(settings:Settings,principal:CreatorPrincipal,input:{visibility:unknown;persist?:unknown;retention_seconds?:unknown;ttl_seconds?:unknown}){
 if(input.visibility!=='private')bad();
 if(input.persist!==undefined&&typeof input.persist!=='boolean')bad();const persist=input.persist===true;
 if(principal.authenticated){if(!principal.creator_authorized||!principal.entitlements.can_create_private||principal.owner_ack?.version!=='toktok-risk-v2'||!Number.isSafeInteger(principal.owner_ack.confirmed_at))fail(403,'CREATOR_DENIED','방 생성 권한과 위험 확인이 필요합니다.');}
 else if(settings.deployment.mode!=='demo'||!settings.private.anonymousEnabled)fail(403,'CREATOR_DENIED','익명 방 생성을 받지 않습니다.');
 if(persist&&(!principal.authenticated||!principal.entitlements.can_persist_private||!settings.private.persistenceAllowed))fail(403,'PERSISTENCE_DENIED','이 계정의 새 비공개방 저장 권한이 필요합니다.');
 // Lifetime is decided by a verified principal, not a body field or mutable legacy TTL setting.
 const ttl=principal.authenticated?null:DEMO_PRIVATE_TTL_SECONDS;
 if(input.ttl_seconds!==undefined&&(ttl===null||input.ttl_seconds!==ttl))fail(422,'ROOM_LIFETIME_FIXED','회원 방은 소유자 종료까지, 비회원 데모 방은 24시간입니다.');
 const retention=persist?(input.retention_seconds??settings.private.defaultRetentionSeconds):null;
 if(retention!==null&&(typeof retention!=='number'||!Number.isSafeInteger(retention)||retention<1||retention>settings.private.maxRetentionSeconds))bad();
 if(typeof retention==='number'&&ttl!==null&&retention>ttl)fail(422,'RETENTION_EXCEEDS_TTL','보관 기간은 방 수명을 넘을 수 없습니다.');
 if(!persist&&input.retention_seconds!==undefined)bad();
 return {mode:settings.deployment.mode,visibility:'private' as const,persist,ttl_seconds:ttl,lifetime:principal.authenticated?'member_permanent' as const:'demo_24h' as const,retention_seconds:retention,notice_version:'toktok-risk-v2'};
}
export interface BudgetWindows {day:string;month:string;dayEnd:number;monthEnd:number;}
export function budgetWindows(now:number):BudgetWindows{const date=new Date(now);return {day:date.toISOString().slice(0,10),month:date.toISOString().slice(0,7),dayEnd:Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1),monthEnd:Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)};}
/** Deadline is issued by the trusted server operation, never refreshed on retry. */
export function newBudgetOperation(now:number,expires_at:number){return `${now}:${expires_at}:${crypto.randomUUID()}`;}
export function validateBudgetOperation(id:string,kind:BudgetKind,now:number){
 const match=/^(\d+):(\d+):[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(id);
 if(!match)bad();const issued=Number(match[1]),expires=Number(match[2]);
 const maxTtl=kind==='email_attempts'?600000:60000;
 if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||issued>now||expires<=issued||expires-issued>maxTtl)bad();
 if(now>=expires)fail(410,'OPERATION_EXPIRED','작업 식별자의 유효 기간이 끝났습니다.');return expires;
}
export function budgetDecision(settings:Settings,kind:BudgetKind,amount:number,dayUsed:number,monthUsed:number){
 if(!Number.isSafeInteger(amount)||amount<=0)bad();const cap=settings.budget.workloadCaps.find(c=>c.kind===kind);if(!cap)fail(503,'BUDGET_NOT_READY','작업량 설정이 필요합니다.');
 return {allowed:dayUsed+amount<=cap.day&&monthUsed+amount<=cap.month,dayExceeded:dayUsed+amount>cap.day,monthExceeded:monthUsed+amount>cap.month};
}
