import type {PrivateRoomInit} from './private-contracts';
/** New-room policy. Absence means an existing, finite snapshot; never infer it from mode alone. */
export const DEMO_PRIVATE_TTL_SECONDS=86400;
export const PRIVATE_LIFETIME_POLICY='member-permanent-v1' as const;
export function memberPrivate(snapshot:PrivateRoomInit):boolean {
 return snapshot.lifetime==='member_permanent'&&snapshot.expires_at===null&&snapshot.creator_ack.kind!=='anonymous_declaration'&&typeof snapshot.creator_ack.owner_account_id==='string';
}
export function privateExpired(snapshot:PrivateRoomInit,now:number):boolean {return snapshot.expires_at!==null&&now>=snapshot.expires_at;}
export function privateDeadline(snapshot:PrivateRoomInit):number {return snapshot.expires_at??Infinity;}
