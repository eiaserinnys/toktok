export interface EmailEnvelope {to:string;subject:string;text:string;attemptId:string;}
export interface EmailSender {send(envelope:EmailEnvelope):Promise<'sent'|'uncertain'>;}
export interface SmtpTransport {sendMail(message:{to:string;from:string;subject:string;text:string}):Promise<void>;}
/** A provides template and atomic reservation. Transport is configured explicitly; no implicit resend. */
export class SmtpEmailSender implements EmailSender {
  constructor(private readonly transport:SmtpTransport,private readonly from:string){}
  async send(envelope:EmailEnvelope):Promise<'sent'|'uncertain'>{try{await this.transport.sendMail({to:envelope.to,from:this.from,subject:envelope.subject,text:envelope.text});return 'sent';}catch{return 'uncertain';}}
}
export class UnconfiguredEmailSender implements EmailSender {async send(_envelope:EmailEnvelope):Promise<'sent'|'uncertain'>{throw new Error('EMAIL_UNCONFIGURED');}}
