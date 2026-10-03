import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import type {IdentityEnv} from '../identity-types';
import {normalizeEmail} from '../email';
import {RepositoryError} from '../storage/repository';

interface SmtpConfiguration {host:string;port:number;secure:boolean;from:string;user?:string;password?:string;servername?:string;}
export interface SmtpTransport {
 sendMail(input:{from:string;to:string;subject:string;text:string}):Promise<unknown>;
 close():void;
}
export interface SmtpOptions {
 host:string;port:number;secure:boolean;requireTLS:true;pool:false;
 auth?:{user:string;pass:string};tls:{rejectUnauthorized:true;minVersion:'TLSv1.2';servername:string};
 connectionTimeout:number;greetingTimeout:number;socketTimeout:number;dnsTimeout:number;
 logger:false;debug:false;transactionLog:false;disableFileAccess:true;disableUrlAccess:true;maxRecipients:1;
}
type Factory=(options:SmtpOptions)=>SmtpTransport;
export interface ConfiguredEmail {identity:Pick<IdentityEnv,'EMAIL'|'EMAIL_FROM'>;close():void;}
function invalid():never {throw new RepositoryError('SMTP_CONFIGURATION_INVALID');}
function configuration(value:unknown):SmtpConfiguration {
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 const c=value as Record<string,unknown>;
 if(Object.keys(c).some(k=>!['host','port','secure','from','user','password','servername'].includes(k)))invalid();
 const hostname=(x:unknown)=>typeof x==='string'&&x.length<=253&&/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(x);
 if(!hostname(c.host)||!Number.isSafeInteger(c.port)||(c.port as number)<1||(c.port as number)>65535||typeof c.secure!=='boolean')invalid();
 if(c.servername!==undefined&&!hostname(c.servername))invalid();
 if((c.user===undefined)!==(c.password===undefined))invalid();
 for(const key of ['user','password'])if(c[key]!==undefined&&(typeof c[key]!=='string'||!(c[key] as string).length||(c[key] as string).length>1024||/[\r\n\0]/.test(c[key] as string)))invalid();
 let from:string;try{from=normalizeEmail(c.from);}catch{invalid();}
 return {...c,from} as unknown as SmtpConfiguration;
}
/** Private file only; constructing a sender does not connect or send a test email. */
export async function configuredSmtp(path:string|undefined,factory?:Factory):Promise<ConfiguredEmail|undefined>{
 if(!path)return;
 let file;let c:SmtpConfiguration;
 try{
  file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await file.stat();
  if(!stat.isFile()||stat.size>8192||(stat.mode&0o077)!==0)invalid();
  c=configuration(JSON.parse(await file.readFile('utf8')));
 }catch{invalid();}finally{await file?.close();}
 let create=factory;
 if(!create){try{const {default:mailer}=await import('nodemailer');create=options=>mailer.createTransport(options);}catch{throw new RepositoryError('SMTP_DRIVER_REQUIRED');}}
 const transport=create({host:c.host,port:c.port,secure:c.secure,requireTLS:true,pool:false,
  ...(c.user!==undefined?{auth:{user:c.user,pass:c.password!}}:{}),
  tls:{rejectUnauthorized:true,minVersion:'TLSv1.2',servername:c.servername??c.host},
  connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:10000,
  logger:false,debug:false,transactionLog:false,disableFileAccess:true,disableUrlAccess:true,maxRecipients:1});
 let closed=false;
 return {identity:{EMAIL_FROM:c.from,EMAIL:{async send(input){
  if(closed)throw new RepositoryError('SMTP_CLOSED');
  // The shared sender owns the fixed subject and body-only OTP template.
  if(input.from!==c.from||input.subject!=='톡톡 이메일 확인')invalid();
  try{await transport.sendMail({from:c.from,to:normalizeEmail(input.to),subject:input.subject,text:input.text});}
  catch{throw new RepositoryError('EMAIL_DELIVERY_UNCERTAIN');}
 }}},close(){if(!closed){closed=true;transport.close();}}};
}
