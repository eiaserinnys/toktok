import type {Env} from './contracts';
import type {BudgetKind} from './settings-schema';
import type {CreationContextInput,CreationGrantInput,CreationReserveInput,CreationCommitInput} from './create-admission';
export interface IdentityEnv extends Env {ADMIN_BOOTSTRAP_EMAIL?:string;}
export interface VerifiedHuman {provider:string;subject:string;email:string;email_verified:true;}
export interface AuthContext {flow:string;nonce:string;}
export type HumanIdentityVerifier=(proof:string,context:AuthContext)=>Promise<VerifiedHuman>;
export interface ClaimBinding {agent_id:string;claim_hash:string;}
export interface RegistryInput {
 id?:string;name?:string;token_hash?:string;claim_hash?:string;ip_hash?:string;
 flow_hash?:string;nonce_hash?:string;browser_hash?:string;claim?:ClaimBinding|null;
 proof_hash?:string;human?:VerifiedHuman;human_id?:string;
 session_hash?:string;csrf?:string;policy?:string;
 email?:string;ip?:string;request_id?:string;otp?:string;limits?:string;delivery_state?:'sent'|'uncertain';now?:number;
 risk_ack_version?:string;purpose?:'login'|'signup'|'claim';invitation_validation_hash?:string;
 confirm?:boolean;expected_revision?:unknown;settings?:unknown;limit?:number;ttl_seconds?:number;
 operation_id?:string;kind?:BudgetKind;amount?:number;
 creation_context?:CreationContextInput;creation_grant?:CreationGrantInput;creation?:CreationReserveInput;creation_commit?:CreationCommitInput;
}
export interface AgentRow {id:string;name:string;token_hash:string;claim_hash:string;status:string;pending_expiry:number;credential_expiry:number|null;owner_id:string|null;}
export interface FlowRow {flow_hash:string;nonce_hash:string;browser_hash:string;claim_id:string|null;claim_hash:string|null;expires_at:number;consumed:number;purpose:string;invitation_id:string|null;email_key:string|null;}
export interface HumanRow extends VerifiedHuman {id:string;}
export interface SessionRow {session_hash:string;owner_id:string;csrf:string;expires_at:number;}
export const agentView=(a:AgentRow)=>({id:a.id,name:a.name,status:a.status==='approved'&&Date.now()>=a.credential_expiry!?'expired':a.status,pending_expires_at:new Date(a.pending_expiry).toISOString(),credential_expires_at:a.credential_expiry?new Date(a.credential_expiry).toISOString():null});
