import {fail} from './http';
import {C,type Tx,save,read,expire} from './control-records';
interface Invitation {id:string;token_hash:string;created_at:number;expires_at:number;status:'active'|'used'|'revoked';}
interface Validation {invitation_id:string;browser_hash:string;expires_at:number;used:boolean;}
export class Invitations {
 constructor(private tx:Tx){}
 private invalid():never{return fail(400,'INVALID_INVITATION','초대 코드를 사용할 수 없습니다.');}
 async valid(id:string,now:number){const row=await read<Invitation>(this.tx,C.invitations,'i:'+id);return row&&row.status==='active'&&row.expires_at>now?row:undefined;}
 async validate(token_hash:string,validation_hash:string,browser_hash:string,now:number){
  const index=await this.tx.get(C.invitations,'t:'+token_hash),invitation=index?await this.valid(String(index.id),now):undefined;if(!invitation)this.invalid();
  const expires_at=Math.min(now+600000,invitation.expires_at),key='v:'+validation_hash;await save(this.tx,C.invitations,key,{invitation_id:invitation.id,browser_hash,expires_at,used:false});await expire(this.tx,C.invitations,key,expires_at);return {expires_at};
 }
 async bind(hash:string,browser_hash:string,now:number){const key='v:'+hash,row=await read<Validation>(this.tx,C.invitations,key);if(!row||row.used||row.expires_at<=now||row.browser_hash!==browser_hash||!await this.valid(row.invitation_id,now))this.invalid();await save(this.tx,C.invitations,key,{...row,used:true});return row.invitation_id;}
 async consume(id:string,now:number){const row=await this.valid(id,now);if(!row)this.invalid();await save(this.tx,C.invitations,'i:'+id,{...row,status:'used'});}
 async create(id:string,token_hash:string,expires_at:number,now:number){await save(this.tx,C.invitations,'i:'+id,{id,token_hash,expires_at,created_at:now,status:'active'});await save(this.tx,C.invitations,'t:'+token_hash,{id});return {id,expires_at:new Date(expires_at).toISOString(),status:'active' as const};}
 async list(limit:number,now:number){return (await this.tx.list(C.invitations,{prefix:'i:',limit})).map(({value:r})=>({id:String(r.id),expires_at:new Date(Number(r.expires_at)).toISOString(),status:r.status==='active'&&Number(r.expires_at)<=now?'expired':String(r.status)}));}
 async revoke(id:string){const row=await read<Invitation>(this.tx,C.invitations,'i:'+id);if(!row)fail(404,'NOT_FOUND','초대가 없습니다.');const status=row.status==='active'?'revoked':row.status;await save(this.tx,C.invitations,'i:'+id,{...row,status});return {id,status};}
}
