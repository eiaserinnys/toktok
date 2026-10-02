import type {Settings,SchemaNode,publicConfig} from './settings-schema';
import type {Entitlements,OwnerAck} from './control-policy';
import type {agentView} from './identity-types';
export type PublicConfig=ReturnType<typeof publicConfig>;
export interface SessionProjection {authenticated:boolean;role:'anonymous'|'member'|'admin';entitlements:Entitlements;csrf_token:string|null;owner_ack:OwnerAck|null;agents?:ReturnType<typeof agentView>[];}
export interface AuthStartRequest {purpose:'login'|'signup'|'claim';invitation_validation_id?:string;claim_id?:string;claim_token?:string;}
export interface AuthStartResponse {flow:string;nonce:string;provider_configured:boolean;expires_at:string;}
export interface InvitationValidation {valid:true;invite_validation_id:string;expires_at:string;}
export interface EmailSendResponse {receipt:string;state:'attempted';retry_after:number;expires_at:string;message:string;}
export interface SettingsEnvelope {schema_version:number;revision:number;settings:Settings;updated_at:number;updated_by:string|null;}
export interface SettingsSchemaResponse {schema_version:number;schema:SchemaNode;}
export interface InvitationView {id:string;expires_at:string;status:'active'|'used'|'revoked'|'expired';}
export interface InvitationCreated extends InvitationView {code:string;}
export interface ErrorResponse {error:{code:string;message:string};}
// This file exports DTOs only. role/query/fixture state never grants server authority.
