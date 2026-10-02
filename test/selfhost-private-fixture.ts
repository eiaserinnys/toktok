import {hash,newToken} from '../src/http';
import {PRIVATE_POLICY,PRIVATE_NOTICE,type PrivateRoomInit} from '../src/private-contracts';
export async function privateSnapshot(id:string,persist:boolean,now=Date.now()){
 const tokens={invite:newToken(),read:newToken(),owner:newToken()};const snapshot:PrivateRoomInit={id,creator_id:'fixture-principal',created_at:now,expires_at:now+120000,purpose:'mock untrusted system data',invite_hash:await hash(tokens.invite),read_hash:await hash(tokens.read),owner_hash:await hash(tokens.owner),settings_revision:1,mode:'DEMO',visibility:'private',persist,retention_seconds:persist?60:null,notice_version:PRIVATE_NOTICE,creator_ack:{kind:persist?'account_confirmation':'anonymous_declaration',version:PRIVATE_NOTICE,confirmed_at:now,owner_account_id:persist?'00000000-0000-0000-0000-000000000001':null},policy:{...PRIVATE_POLICY}};return {tokens,snapshot};
}
