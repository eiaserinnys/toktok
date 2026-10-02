import type { Room } from './room';
import type {PublicEnv} from './public-contracts';
export interface Env extends PublicEnv {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<Room>;
  CREATOR_CREDENTIALS_JSON: string;
  IP_RATE_LIMIT: RateLimit;
  CREATOR_RATE_LIMIT: RateLimit;
}
export type Status = 'open' | 'closed';
export interface RoomRow {
  id: string; purpose: string; creator_id: string; created_at: string; expires_at: number;
  status: Status; invite_hash: string; read_hash: string; owner_hash: string;
}
export interface Participant { id: string; nickname: string; token_hash: string; }
export interface MessageRow {
  sequence: number; sender_id: string; nickname: string; text: string;
  client_message_id: string; reply_to: number | null; created_at: string;
}
export interface Capability { role: 'invite' | 'read' | 'owner' | 'participant'; hash: string; sender?: Participant; }
export interface NewRoom { id: string; purpose: string; creator_id: string; ttl_seconds: number; invite_hash: string; read_hash: string; owner_hash: string; }
export const roomView = (r: RoomRow) => ({id:r.id,purpose:r.purpose,status:r.status,created_at:r.created_at,expires_at:new Date(r.expires_at).toISOString()});
export const messageView = (m: MessageRow) => ({sequence:m.sequence,sender:{id:m.sender_id,nickname:m.nickname},text:m.text,client_message_id:m.client_message_id,reply_to:m.reply_to,created_at:m.created_at});
