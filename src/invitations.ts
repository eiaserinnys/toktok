import {fail} from './http';
export class Invitations {
 constructor(private storage:DurableObjectStorage){}
 private get sql(){return this.storage.sql;}
 init(){this.sql.exec(`CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS invitation_validations(validation_hash TEXT PRIMARY KEY,invitation_id TEXT NOT NULL,browser_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);`);}
 private invalid():never{return fail(400,'INVALID_INVITATION','초대 코드를 사용할 수 없습니다.');}
 valid(id:string,now:number){const row=this.sql.exec('SELECT * FROM invitations WHERE id=?',id).toArray()[0];return Boolean(row&&row.status==='active'&&Number(row.expires_at)>now);}
 validate(token_hash:string,validation_hash:string,browser_hash:string,now:number){
  const row=this.sql.exec('SELECT id,expires_at,status FROM invitations WHERE token_hash=?',token_hash).toArray()[0];
  if(!row||!this.valid(String(row.id),now))this.invalid();const expires=Math.min(now+600000,Number(row.expires_at));
  this.sql.exec('INSERT INTO invitation_validations VALUES(?,?,?,?,0)',validation_hash,String(row.id),browser_hash,expires);return {expires_at:expires};
 }
 bind(validation_hash:string,browser_hash:string,now:number){
  const row=this.sql.exec('SELECT * FROM invitation_validations WHERE validation_hash=?',validation_hash).toArray()[0];
  if(!row||row.used||row.browser_hash!==browser_hash||Number(row.expires_at)<=now||!this.valid(String(row.invitation_id),now))this.invalid();
  this.sql.exec('UPDATE invitation_validations SET used=1 WHERE validation_hash=?',validation_hash);return String(row.invitation_id);
 }
 consume(id:string,now:number){if(!this.valid(id,now))this.invalid();this.sql.exec("UPDATE invitations SET status='used' WHERE id=? AND status='active'",id);}
 create(id:string,token_hash:string,expires_at:number,now:number){this.sql.exec("INSERT INTO invitations VALUES(?,?,?,?,'active')",id,token_hash,now,expires_at);return {id,expires_at:new Date(expires_at).toISOString(),status:'active'};}
 revoke(id:string){const row=this.sql.exec('SELECT status FROM invitations WHERE id=?',id).toArray()[0];if(!row)fail(404,'NOT_FOUND','초대가 없습니다.');if(row.status==='active')this.sql.exec("UPDATE invitations SET status='revoked' WHERE id=?",id);return {id,status:row.status==='active'?'revoked':row.status};}
 list(limit:number,now:number){return this.sql.exec('SELECT id,expires_at,status FROM invitations ORDER BY created_at DESC,id DESC LIMIT ?',limit).toArray().map(row=>({id:row.id,expires_at:new Date(Number(row.expires_at)).toISOString(),status:row.status==='active'&&Number(row.expires_at)<=now?'expired':row.status}));}
 cleanup(now:number){this.sql.exec('DELETE FROM invitation_validations WHERE expires_at<=?',now);}
}
