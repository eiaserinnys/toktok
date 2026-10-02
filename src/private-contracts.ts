import type {RepositoryPort} from './storage/repository';
export const PRIVATE_NOTICE='toktok-risk-v1' as const;
export interface PrivatePolicy {
 memoryMessages:number;memoryRetentionMs:number;textBytes:number;jsonBytes:number;participants:number;
 senderPerMinute:number;roomPerMinute:number;persistedMessages:number;pageSize:number;responseBytes:number;
 handlers:number;bodyInflight:number;waits:number;waitMs:number;readCadenceMs:number;firstWindowMs:number;firstWindowMessages:number;
}
export const PRIVATE_POLICY:Readonly<PrivatePolicy>=Object.freeze({memoryMessages:100,memoryRetentionMs:3600000,textBytes:16384,jsonBytes:65536,participants:64,senderPerMinute:30,roomPerMinute:120,persistedMessages:10000,pageSize:20,responseBytes:65536,handlers:64,bodyInflight:8,waits:32,waitMs:25000,readCadenceMs:2000,firstWindowMs:300000,firstWindowMessages:20});
export interface PrivateCreatorAck {kind:'anonymous_declaration'|'account_confirmation'|'agent_owner_confirmation';version:typeof PRIVATE_NOTICE;confirmed_at:number;owner_account_id:string|null;}
/** Trusted server-only initializer. A validates DB account entitlement and current creator authority. */
export interface PrivateRoomInit {
 id:string;creator_id:string;created_at:number;expires_at:number;purpose:string;invite_hash:string;read_hash:string;owner_hash:string;
 settings_revision:number;mode:'DEMO'|'HOSTED';visibility:'private';persist:boolean;retention_seconds:number|null;
 notice_version:typeof PRIVATE_NOTICE;creator_ack:PrivateCreatorAck;policy:PrivatePolicy;
}
export interface PrivateParticipant {id:string;nickname:string;token_hash:string;client_request_id_hash:string;}
export interface PrivateMessage {sequence:number;cursor:string;sender:{id:string;nickname:string};text:string;client_message_id:string;reply_to:number|null;created_at:string;}
export type PrivateBudgetKind='admission_requests'|'response_bytes'|'persistent_write_bytes'|'active_room_seconds';
export interface PrivateBudgetPort {reserve(operation_id:string,kind:PrivateBudgetKind,amount:number):Promise<void>;newOperationId():string;}
export interface PrivateCoreOptions {origin:string;repo:RepositoryPort;budget?:PrivateBudgetPort;clock?:()=>number;}
export interface PrivateRoomEndpoint {initialize(input:PrivateRoomInit):Promise<object>;fetch(request:Request):Promise<Response>;maintenance():Promise<object>;shutdown():void|Promise<void>;}
export interface PrivateEnv {PUBLIC_ORIGIN:string;}
/** Host code creates an HTTP JSON-safe CONTROL adapter; function objects are never Wrangler bindings. */
export interface PrivateRoomDependencies {budgetFactory:(env:PrivateEnv)=>PrivateBudgetPort;}
export function validatePrivatePolicy(policy:PrivatePolicy):PrivatePolicy {
 if(Object.keys(policy).some(key=>!(key in PRIVATE_POLICY)))throw new Error('POLICY_BOUNDS');
 for(const key of Object.keys(PRIVATE_POLICY) as (keyof PrivatePolicy)[]){const n=policy[key];if(!Number.isSafeInteger(n)||n<1||(key==='readCadenceMs'?n<2000||n>10000:n>(key==='handlers'?160:key==='bodyInflight'?16:PRIVATE_POLICY[key])))throw new Error('POLICY_BOUNDS');}
 if(policy.waits>policy.handlers||policy.bodyInflight>policy.handlers||policy.responseBytes!==65536||policy.readCadenceMs>policy.waitMs)throw new Error('POLICY_BOUNDS');return {...policy};
}
