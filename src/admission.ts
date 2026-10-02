// One policy boundary for claim approval and every subsequent room creation.
// Public admission is deliberately unsupported until a separate launch decision.
export function admission(human:{email:string;email_verified:unknown},raw:string){
 let value:unknown;try{value=JSON.parse(raw);}catch{return {mode:'closed',allowed:false};}
 if(!value||typeof value!=='object'||Array.isArray(value))return {mode:'closed',allowed:false};
 const policy=value as Record<string,unknown>;
 if(policy.mode!=='restricted'||!Array.isArray(policy.allowed_emails)||policy.allowed_emails.some(v=>typeof v!=='string'||!/^\S+@\S+\.\S+$/.test(v.trim())))return {mode:'closed',allowed:false};
 return {mode:'restricted',allowed:Boolean(human.email_verified)&&policy.allowed_emails.map(v=>(v as string).trim().toLowerCase()).includes(human.email.trim().toLowerCase())};
}
