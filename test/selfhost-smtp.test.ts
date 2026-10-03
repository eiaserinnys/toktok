import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuredSmtp,type SmtpOptions} from '../src/selfhost/smtp';
import {sender} from '../src/email';
import {RepositoryError} from '../src/storage/repository';

test('private SMTP configuration preserves the shared OTP template and does no startup delivery',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'toktok-smtp-')),file=join(directory,'smtp.json');
 const config={host:'smtp.fixture.example',port:587,secure:false,from:'login@fixture.example',user:'fixture-user',password:'fixture-password'};
 let options:SmtpOptions|undefined,calls=0,closed=0,fail=false;
 try{
  await writeFile(file,JSON.stringify(config),{mode:0o600});
  const email=await configuredSmtp(file,input=>{options=input;return {async sendMail(message){calls++;assert.equal(message.subject,'톡톡 이메일 확인');assert.equal(message.from,config.from);assert.equal(message.to,'recipient@fixture.example');assert.match(message.text,/123456/);assert(!message.subject.includes('123456'));if(fail)throw new Error('provider-secret-fixture');},close(){closed++;}};});
  assert.equal(calls,0);assert(email);assert.equal(options?.requireTLS,true);assert.equal(options?.tls.rejectUnauthorized,true);assert.equal(options?.debug,false);assert.equal(options?.logger,false);assert.equal(options?.disableUrlAccess,true);assert.equal(options?.disableFileAccess,true);assert.equal(options?.maxRecipients,1);
  const deliver=sender(email.identity,{});await deliver({to:'recipient@fixture.example',code:'123456',expires_at:Date.UTC(2030,0,1)});assert.equal(calls,1);
  fail=true;await assert.rejects(deliver({to:'recipient@fixture.example',code:'123456',expires_at:Date.UTC(2030,0,1)}),e=>e instanceof RepositoryError&&e.code==='EMAIL_DELIVERY_UNCERTAIN'&&!String(e).includes('provider-secret'));
  assert.equal(calls,2);email.close();email.close();assert.equal(closed,1);
  await assert.rejects(deliver({to:'recipient@fixture.example',code:'123456',expires_at:Date.UTC(2030,0,1)}),e=>e instanceof RepositoryError&&e.code==='SMTP_CLOSED');assert.equal(calls,2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('unconfigured SMTP is inactive and invalid or readable-by-others secrets never instantiate a transport',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'toktok-smtp-')),file=join(directory,'smtp.json');let calls=0;
 const factory=(_input:SmtpOptions)=>{calls++;return {async sendMail(){},close(){}};};
 try{
  assert.equal(await configuredSmtp(undefined,factory),undefined);
  for(const value of [null,{host:'smtp.fixture.example',port:587,secure:false,from:'sender@fixture.example',ignoreTLS:true},{host:'smtp.fixture.example',port:587,secure:false,from:'sender@fixture.example',user:'fixture'}]){
   await writeFile(file,JSON.stringify(value),{mode:0o600});await assert.rejects(configuredSmtp(file,factory),e=>e instanceof RepositoryError&&e.code==='SMTP_CONFIGURATION_INVALID');
  }
  await writeFile(file,JSON.stringify({host:'smtp.fixture.example',port:465,secure:true,from:'sender@fixture.example'}));await chmod(file,0o644);
  await assert.rejects(configuredSmtp(file,factory),e=>e instanceof RepositoryError&&e.code==='SMTP_CONFIGURATION_INVALID');assert.equal(calls,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
