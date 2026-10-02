import {bad} from './http';
import {PRIVATE_POLICY,validatePrivatePolicy,type PrivatePolicy} from './private-contracts';
export const BUDGET_KINDS=['admission_requests','response_bytes','private_creates','active_room_seconds','persistent_write_bytes','email_attempts'] as const;
export type BudgetKind=typeof BUDGET_KINDS[number];
export interface WorkloadCap {kind:BudgetKind;unit:'count'|'bytes'|'seconds';day:number;month:number;}
// Matches d230fbe PublicPolicy; runtime engine wiring remains the integrator's responsibility.
export const DEFAULT_PUBLIC_POLICY={messages:100,retentionMs:3600000,textBytes:2048,jsonBytes:8192,participants:100,watchers:50,leaseMs:300000,grantMs:300000,ipParticipants:5,ipWatchers:5,grantAdmissions:5,admissionWindowMs:60000,pendingGrants:1000,ipKeys:2048,ipMemoryMs:300000,operatorIntervalMs:30000,ipIntervalMs:1000,roomMessages:5,roomWindowMs:1000,batchMs:2000,waitMs:25000,handlers:160,waits:150,pageSize:20,responseBytes:65536,responsesPerSecond:75,responseBurst:150,bytesPerSecond:4194304,byteBurst:8388608,requestPerSecond:300,requestBurst:320,ipRequestsPerSecond:30,ipRequestBurst:60,bodyMs:5000};
export interface Settings {
 deployment:{mode:'demo'|'hosted';enabled:boolean};signup:{policy:'closed'|'invite'|'open'};
 public:{catalog:{slug:string;title:string;enabled:boolean}[];policy:typeof DEFAULT_PUBLIC_POLICY;firstWindowSeconds:number;agentReadCadenceSeconds:number;browserReadCadenceSeconds:number};
 private:{anonymousEnabled:boolean;createPerIpHour:number;activePerIp:number;activeGlobal:number;dailyCreates:number;anonymousDefaultTtlSeconds:number;anonymousMaxTtlSeconds:number;authenticatedDefaultTtlSeconds:number;authenticatedMaxTtlSeconds:number;persistenceAllowed:boolean;defaultPersist:boolean;defaultRetentionSeconds:number;maxRetentionSeconds:number;policy:PrivatePolicy};
 identity:{emailLimits:{email_hour:number;email_day:number;cooldown_seconds:number;ip_hour:number;ip_day:number;month:number};otpLifetimeSeconds:number;otpAttempts:number;flowTtlSeconds:number;sessionTtlSeconds:number;invitationTtlSeconds:number};
 budget:{targetUsd:number;warningUsd:number;cutoffUsd:number;calendar:'UTC';workloadCaps:WorkloadCap[]};
}
export const DEFAULT_SETTINGS:Settings={
 deployment:{mode:'demo',enabled:false},signup:{policy:'invite'},
 public:{catalog:[{slug:'common-room',title:'함께 이야기',enabled:true},{slug:'workshop',title:'작업 이야기',enabled:true},{slug:'quiet-corner',title:'조용한 이야기',enabled:true}],policy:{...DEFAULT_PUBLIC_POLICY},firstWindowSeconds:300,agentReadCadenceSeconds:5,browserReadCadenceSeconds:2},
 private:{anonymousEnabled:false,createPerIpHour:3,activePerIp:3,activeGlobal:10,dailyCreates:100,anonymousDefaultTtlSeconds:3600,anonymousMaxTtlSeconds:86400,authenticatedDefaultTtlSeconds:86400,authenticatedMaxTtlSeconds:604800,persistenceAllowed:false,defaultPersist:false,defaultRetentionSeconds:86400,maxRetentionSeconds:604800,policy:{...PRIVATE_POLICY}},
 identity:{emailLimits:{email_hour:2,email_day:3,cooldown_seconds:120,ip_hour:30,ip_day:100,month:10000},otpLifetimeSeconds:600,otpAttempts:5,flowTtlSeconds:600,sessionTtlSeconds:43200,invitationTtlSeconds:604800},
 budget:{targetUsd:100,warningUsd:50,cutoffUsd:70,calendar:'UTC',workloadCaps:[
 {kind:'admission_requests',unit:'count',day:100000,month:3000000}, {kind:'response_bytes',unit:'bytes',day:3221225472,month:68719476736},
 {kind:'private_creates',unit:'count',day:100,month:2000}, {kind:'active_room_seconds',unit:'seconds',day:144000,month:4320000},
 {kind:'persistent_write_bytes',unit:'bytes',day:16777216,month:268435456}, {kind:'email_attempts',unit:'count',day:1000,month:10000}]}
};
type ApplyTo='runtime'|'new_room'|'authentication'|'provisioning';
interface Meta {label:string;unit:string;min:number|null;max:number|null;applyTo:ApplyTo;readOnly?:boolean;constant?:boolean;}
export type SchemaNode=Meta&({type:'object';fields:Record<string,SchemaNode>}|{type:'integer'}|{type:'boolean'}|{type:'enum';values:readonly string[]}|{type:'string';pattern?:string}|{type:'array';items:SchemaNode});
const number=(label:string,min:number,max:number,unit:string,applyTo:ApplyTo='runtime'):SchemaNode=>({type:'integer',label,min,max,unit,applyTo});
const bool=(label:string,applyTo:ApplyTo='runtime'):SchemaNode=>({type:'boolean',label,min:null,max:null,unit:'boolean',applyTo});
const enumeration=(label:string,values:readonly string[],applyTo:ApplyTo='runtime'):SchemaNode=>({type:'enum',label,values,min:null,max:null,unit:'enum',applyTo});
const object=(label:string,fields:Record<string,SchemaNode>,applyTo:ApplyTo='runtime'):SchemaNode=>({type:'object',label,fields,min:null,max:null,unit:'object',applyTo});
const list=(label:string,min:number,max:number,items:SchemaNode):SchemaNode=>({type:'array',label,min,max,items,unit:'items',applyTo:'runtime'});
const string=(label:string,min:number,max:number,pattern?:string):SchemaNode=>({type:'string',label,min,max,pattern,unit:'characters',applyTo:'runtime'});
const publicFields:Record<string,SchemaNode>={};
for(const [key,value] of Object.entries(DEFAULT_PUBLIC_POLICY)){
 const interval=['operatorIntervalMs','ipIntervalMs','roomWindowMs','admissionWindowMs'].includes(key);
 publicFields[key]=number(key,interval?value:1,interval?3600000:value,key.endsWith('Ms')?'ms':key.toLowerCase().includes('bytes')?'bytes':'count');
}
publicFields.leaseMs=number('참여 수명',1000,300000,'ms');publicFields.grantMs=number('입장 허가 수명',1000,300000,'ms');
publicFields.batchMs=number('응답 묶음 간격',2000,10000,'ms');
publicFields.responseBytes=number('응답 안전 불변 상한',65536,65536,'bytes');
const privateFields:Record<string,SchemaNode>={};
for(const [key,value] of Object.entries(PRIVATE_POLICY))privateFields[key]=number(key,key==='readCadenceMs'?2000:key==='responseBytes'?65536:1,key==='readCadenceMs'?10000:value,key.endsWith('Ms')?'ms':key.endsWith('Bytes')?'bytes':'count','new_room');
privateFields.handlers=number('동시 처리',1,160,'count','new_room');
privateFields.bodyInflight=number('동시 본문 처리',1,16,'count','new_room');
export const SETTINGS_SCHEMA=object('설정',{
 deployment:object('서비스',{mode:enumeration('모드',['demo','hosted'],'new_room'),enabled:bool('서비스 활성화')}),
 signup:object('가입',{policy:enumeration('가입 정책',['closed','invite','open'],'authentication')}),
 public:object('공개방',{catalog:list('공개방 목록',0,10,object('공개방',{slug:string('경로',1,64,'^[a-z0-9]+(?:-[a-z0-9]+)*$'),title:string('표시 제목',1,64),enabled:bool('활성화')})),policy:object('공개방 정책',publicFields),firstWindowSeconds:number('최초 읽기 범위',1,300,'seconds'),agentReadCadenceSeconds:number('에이전트 권장 읽기 간격',1,300,'seconds'),browserReadCadenceSeconds:number('브라우저 권장 읽기 간격',1,300,'seconds')}),
 private:object('비공개방',{
 anonymousEnabled:bool('익명 생성'),createPerIpHour:number('IP별 시간 생성',1,3,'count'),activePerIp:number('IP별 활성 방',1,3,'count'),activeGlobal:number('전체 활성 방',1,10,'count'),dailyCreates:number('일 생성',1,100,'count'),
 anonymousDefaultTtlSeconds:number('익명 기본 수명',60,86400,'seconds','new_room'),anonymousMaxTtlSeconds:number('익명 최대 수명',60,86400,'seconds','new_room'),authenticatedDefaultTtlSeconds:number('계정 기본 수명',60,604800,'seconds','new_room'),authenticatedMaxTtlSeconds:number('계정 최대 수명',60,604800,'seconds','new_room'),persistenceAllowed:bool('계정 저장 허용','new_room'),defaultPersist:{...bool('기본 저장 OFF 안전 조건','new_room'),readOnly:true,constant:false},defaultRetentionSeconds:number('기본 보관',1,604800,'seconds','new_room'),maxRetentionSeconds:number('최대 보관',1,604800,'seconds','new_room'),policy:object('방 정책',privateFields,'new_room')},'new_room'),
 identity:object('인증',{
 emailLimits:object('메일 요청 및 발송 제한',{email_hour:number('이메일 시간 요청',1,2,'count','authentication'),email_day:number('이메일 일 요청',1,3,'count','authentication'),cooldown_seconds:number('재요청 간격',120,86400,'seconds','authentication'),ip_hour:number('IP 시간 요청',1,30,'count','authentication'),ip_day:number('IP 일 요청',1,100,'count','authentication'),month:number('배포 월 발송',1,10000,'count','authentication')},'authentication'),
 otpLifetimeSeconds:number('OTP 수명',1,600,'seconds','authentication'),otpAttempts:number('OTP 오입력',1,5,'count','authentication'),flowTtlSeconds:number('인증 흐름 수명',1,600,'seconds','authentication'),sessionTtlSeconds:number('세션 수명',1,43200,'seconds','authentication'),invitationTtlSeconds:number('초대 수명',1,2592000,'seconds','authentication')},'authentication'),
 budget:object('작업량 예산',{targetUsd:number('목표',1,10000,'USD'),warningUsd:number('경고',1,10000,'USD'),cutoffUsd:number('차단',1,10000,'USD'),calendar:enumeration('달력',['UTC']),workloadCaps:list('작업량 상한',6,6,object('상한',{kind:enumeration('종류',BUDGET_KINDS),unit:enumeration('단위',['count','bytes','seconds']),day:number('일 상한',1,68719476736,'units'),month:number('월 상한',1,68719476736,'units')}))})
});
function validateNode(node:SchemaNode,value:unknown):void{
 if(node.constant!==undefined&&value!==node.constant)bad();
 if(node.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))bad();const record=value as Record<string,unknown>;
  if(Object.keys(record).length!==Object.keys(node.fields).length||Object.keys(record).some(k=>!(k in node.fields)))bad();
  for(const [key,child] of Object.entries(node.fields))validateNode(child,record[key]);
 }else if(node.type==='integer'){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<node.min!||value>node.max!)bad();}
 else if(node.type==='boolean'){if(typeof value!=='boolean')bad();}
 else if(node.type==='enum'){if(typeof value!=='string'||!node.values.includes(value))bad();}
 else if(node.type==='string'){if(typeof value!=='string'||Array.from(value).length<node.min!||Array.from(value).length>node.max!||(node.pattern&&!new RegExp(node.pattern).test(value)))bad();}
 else {if(!Array.isArray(value)||value.length<node.min!||value.length>node.max!)bad();for(const item of value)validateNode(node.items,item);}
}
/** Platform-independent typed validation. No env fallback, client readiness, or mode-derived entitlement. */
export function validateSettings(value:unknown):Settings{
 validateNode(SETTINGS_SCHEMA,value);const s=value as Settings;
 try{validatePrivatePolicy(s.private.policy);}catch{bad();}
 if(s.private.defaultPersist||s.deployment.mode==='demo'&&s.signup.policy==='open')bad();
 if(s.private.defaultPersist&&!s.private.persistenceAllowed||s.private.anonymousDefaultTtlSeconds>s.private.anonymousMaxTtlSeconds||s.private.authenticatedDefaultTtlSeconds>s.private.authenticatedMaxTtlSeconds||s.private.defaultRetentionSeconds>s.private.maxRetentionSeconds||s.private.activePerIp>s.private.activeGlobal)bad();
 if(s.identity.emailLimits.email_hour>s.identity.emailLimits.email_day||s.identity.emailLimits.ip_hour>s.identity.emailLimits.ip_day||s.public.policy.waits>s.public.policy.handlers||s.public.policy.byteBurst<s.public.policy.responseBytes||s.public.policy.responseBurst<1||s.public.policy.batchMs>s.public.policy.waitMs)bad();
 if(s.budget.warningUsd>s.budget.cutoffUsd||s.budget.cutoffUsd>s.budget.targetUsd)bad();
 if(new Set(s.public.catalog.map(c=>c.slug)).size!==s.public.catalog.length)bad();
 if(new Set(s.budget.workloadCaps.map(c=>c.kind)).size!==BUDGET_KINDS.length)bad();
 for(const cap of s.budget.workloadCaps){const bound=DEFAULT_SETTINGS.budget.workloadCaps.find(c=>c.kind===cap.kind)!;if(cap.unit!==bound.unit||cap.day>bound.day||cap.month>bound.month||cap.day>cap.month)bad();}
 return structuredClone(s);
}
export function publicConfig(settings:Settings,revision:number){return {schema_version:1,revision,mode:settings.deployment.mode,enabled:settings.deployment.enabled,signup:settings.signup.policy,public:{catalog:settings.public.catalog.filter(c=>c.enabled),firstWindowSeconds:settings.public.firstWindowSeconds,pageSize:settings.public.policy.pageSize,agentReadCadenceSeconds:settings.public.agentReadCadenceSeconds,browserReadCadenceSeconds:settings.public.browserReadCadenceSeconds},private:{anonymousEnabled:settings.private.anonymousEnabled,defaultPersist:false,anonymousDefaultTtlSeconds:settings.private.anonymousDefaultTtlSeconds,anonymousMaxTtlSeconds:settings.private.anonymousMaxTtlSeconds,authenticatedDefaultTtlSeconds:settings.private.authenticatedDefaultTtlSeconds,authenticatedMaxTtlSeconds:settings.private.authenticatedMaxTtlSeconds,defaultRetentionSeconds:settings.private.defaultRetentionSeconds,maxRetentionSeconds:settings.private.maxRetentionSeconds}};}
