import type {Settings,SchemaNode,publicConfig} from './settings-schema';
import type {Entitlements,OwnerAck} from './control-policy';
import type {agentView} from './identity-types';
import type {ControlState} from './settings-store';
import type {SettingsStore} from './settings-store';
export type PublicConfig=ReturnType<typeof publicConfig>;
export interface SessionProjection {authenticated:boolean;role:'anonymous'|'member'|'admin';can_bootstrap_admin:boolean;entitlements:Entitlements;csrf_token:string|null;owner_ack:OwnerAck|null;agents?:ReturnType<typeof agentView>[];}
export interface AuthStartRequest {purpose:'login'|'signup'|'claim';invitation_validation_id?:string;claim_id?:string;claim_token?:string;}
export interface AuthStartResponse {flow:string;nonce:string;provider_configured:boolean;expires_at:string;}
export interface InvitationValidation {valid:true;invite_validation_id:string;expires_at:string;}
export interface EmailSendResponse {receipt:string;state:'attempted';retry_after:number;expires_at:string;message:string;}
export interface SettingsEnvelope {schema_version:number;revision:number;settings:Settings;updated_at:number;updated_by:string|null;}
export interface SettingsSchemaResponse {schema_version:number;schema:SchemaNode;}
/** Trusted transport only; authorization is checked again by ControlCore. */
export interface AdminRecoveryReservation {response_bytes_limit:65536;}
export type AdminBudgetResponse=Awaited<ReturnType<SettingsStore['budget']>>;
/** Trusted host projection. Never publish as GET /api/config. */
export interface RuntimeConfig {public_generations?:Record<string,string>;settings:Settings;revision:number;readiness:ControlState;}
export interface InvitationView {id:string;expires_at:string;status:'active'|'used'|'revoked'|'expired';}
export interface InvitationCreated extends InvitationView {code:string;}
export interface CreationContextResponse {nonce:string;expires_at:string;notice_version:'toktok-risk-v2';authenticated:boolean;can_persist_private:boolean;}
export interface CreationGrantRequest {nonce:string;risk_ack:true;risk_ack_version:'toktok-risk-v2';}
export interface CreationGrantResponse {creation_grant:string;expires_at:string;notice_version:'toktok-risk-v2';}
export interface PrivateCreationRequest {purpose:string;ttl_seconds?:number;persist?:boolean;retention_seconds?:number;client_request_id:string;creation_grant?:string;}
export interface ErrorResponse {error:{code:string;message:string};room_id?:string;}
// This file exports DTOs only. role/query/fixture state never grants server authority.
