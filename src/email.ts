import {bad,fail,text} from './http';
import type {Env} from './contracts';
export interface EmailDelivery {to:string;code:string;expires_at:number;}
export type EmailSender=(delivery:EmailDelivery)=>Promise<void>;
export interface IdentityOptions {sendEmail?:EmailSender;trustedIP?:(request:Request)=>string;now?:()=>number;}
export function normalizeEmail(value:unknown):string{
 const email=text(value,3,320);if(/[\r\n]/.test(email))bad();
 const normalized=email.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))bad();return normalized;
}
export function normalizeIP(value:string):string{
 if(/^\d+\.\d+\.\d+\.\d+$/.test(value)){
  const octets=value.split('.');if(octets.some(n=>Number(n)>255||String(Number(n))!==n))bad();return octets.join('.');
 }
 if(!/^[\da-fA-F:.]+$/.test(value)||!value.includes(':'))bad();
 try{return new URL(`http://[${value}]/`).hostname.slice(1,-1).toLowerCase();}catch{bad();}
}
export function trustedIP(request:Request):string{
 const ip=request.headers.get('CF-Connecting-IP');
 if(!request.cf||!ip||request.headers.has('CF-Worker'))fail(503,'TRUSTED_IP_REQUIRED','인증 발송을 준비하지 못했습니다.');
 try{return normalizeIP(ip);}catch{return fail(503,'TRUSTED_IP_REQUIRED','인증 발송을 준비하지 못했습니다.');}
}
export function sender(env:Env,options:IdentityOptions):EmailSender{
 if(options.sendEmail)return options.sendEmail;
 if(!env.EMAIL||!env.EMAIL_FROM)fail(503,'AUTH_PROVIDER_UNCONFIGURED','이메일 확인 연결을 준비하고 있습니다.');
 const from=normalizeEmail(env.EMAIL_FROM);
 return async({to,code,expires_at})=>{await env.EMAIL!.send({from,to,subject:'톡톡 이메일 확인',text:`톡톡 확인 코드: ${code}\n유효 시각: ${new Date(expires_at).toISOString()}\n이 시각 전 한 번 사용할 수 있습니다. 요청하지 않았다면 무시하세요.`});};
}
export interface EmailLimits {email_hour:number;email_day:number;cooldown_seconds:number;ip_hour:number;ip_day:number;month:number;}
export function emailLimits(raw:string):EmailLimits{
 let value:unknown;try{value=JSON.parse(raw);}catch{fail(503,'EMAIL_CONFIGURATION_ERROR','인증 발송 한도 설정이 필요합니다.');}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(503,'EMAIL_CONFIGURATION_ERROR','인증 발송 한도 설정이 필요합니다.');
 const v=value as Record<string,unknown>,fields=['email_hour','email_day','cooldown_seconds','ip_hour','ip_day','month'];
 if(Object.keys(v).some(k=>!fields.includes(k))||fields.some(k=>!Number.isSafeInteger(v[k])||Number(v[k])<=0)||v.month!==10000)fail(503,'EMAIL_CONFIGURATION_ERROR','인증 발송 한도 설정이 필요합니다.');
 return v as unknown as EmailLimits;
}
