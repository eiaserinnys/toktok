import type { PublicRoom } from './public-room';

export const PUBLIC_NOTICE = 'toktok-risk-v1' as const;
export const PUBLIC_CATALOG = [
  {slug:'common-room',title:'함께 이야기'},
  {slug:'workshop',title:'작업 이야기'},
  {slug:'quiet-corner',title:'조용한 이야기'},
] as const;
export interface PublicPolicy {
  messages: number; retentionMs: number; textBytes: number; jsonBytes: number;
  participants: number; watchers: number; leaseMs: number; grantMs: number;
  ipParticipants: number; ipWatchers: number; grantAdmissions: number; admissionWindowMs: number;
  pendingGrants: number; ipKeys: number; ipMemoryMs: number;
  operatorIntervalMs: number; ipIntervalMs: number; roomMessages: number; roomWindowMs: number;
  batchMs: number; waitMs: number; handlers: number; waits: number; pageSize: number;
  responseBytes: number; responsesPerSecond: number; responseBurst: number;
  bytesPerSecond: number; byteBurst: number; requestPerSecond: number; requestBurst: number;
  ipRequestsPerSecond:number;ipRequestBurst:number;bodyMs: number;
}
export const PUBLIC_POLICY: Readonly<PublicPolicy> = Object.freeze({
  messages:100,retentionMs:3600000,textBytes:2048,jsonBytes:8192,
  participants:100,watchers:50,leaseMs:300000,grantMs:300000,
  ipParticipants:5,ipWatchers:5,grantAdmissions:5,admissionWindowMs:60000,
  pendingGrants:1000,ipKeys:2048,ipMemoryMs:300000,
  operatorIntervalMs:30000,ipIntervalMs:1000,roomMessages:5,roomWindowMs:1000,
  batchMs:2000,waitMs:25000,handlers:160,waits:150,pageSize:20,
  responseBytes:65536,responsesPerSecond:75,responseBurst:150,
  bytesPerSecond:4194304,byteBurst:8388608,requestPerSecond:300,requestBurst:320,ipRequestsPerSecond:30,ipRequestBurst:60,bodyMs:5000,
});
export interface PublicEnv {
  PUBLIC_ROOMS: DurableObjectNamespace<PublicRoom>;
  PUBLIC_ORIGIN: string;
}
export interface PublicGrantResult {
  status:number;
  data:{operator_grant:string;epoch:string;expires_at:string;notice_version:string}|{error:{code:string;message:string;retry_after_ms?:number}};
  retry_after_ms?:number;
}
// A compile-time provenance marker, deliberately without an exported unchecked constructor.
// The upper browser adapter alone validates exact Origin + cookie/nonce + explicit acknowledgement.
declare const validatedAck: unique symbol;
export interface ValidatedOperatorAck {
  readonly [validatedAck]: true;
  readonly room: string;
  readonly risk_ack_version: typeof PUBLIC_NOTICE;
  readonly checked: true;
  readonly trustedIpHash: string;
}
export interface PublicMessage {
  sequence:number; cursor:string; sender:{id:string;nickname:string}; text:string;
  client_message_id:string; created_at:string;
}
export interface Bucket {tokens:number;at:number;}
export function available(bucket:Bucket,now:number,rate:number,burst:number):number {
  bucket.tokens=Math.min(burst,bucket.tokens+Math.max(0,now-bucket.at)*rate/1000);bucket.at=now;
  return bucket.tokens;
}
export const INTERNAL_IP_HEADER='x-toktok-public-ip-hash';
export const utf8Bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
export function publicAction(path:string,method:string):string|null {
  if(path===''&&method==='GET')return 'metadata';
  if(path==='participants'&&method==='POST')return 'participants';
  if(path==='watchers'&&method==='POST')return 'watchers';
  if(path==='messages'&&['GET','POST'].includes(method))return method==='GET'?'read':'send';
  if(path==='wait'&&method==='GET')return 'wait';
  if(path==='lease'&&method==='DELETE')return 'leave';
  if(path==='guide'&&method==='GET')return 'guide';
  return null;
}
