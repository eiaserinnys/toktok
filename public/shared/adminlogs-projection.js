const invalid=()=>{throw Object.assign(Error('INVALID_ADMIN_PROJECTION'),{code:'INVALID_ADMIN_PROJECTION'});};
export function invitation(data){
 if(typeof data?.id!=='string'||typeof data.expires_at!=='string'||!Number.isFinite(Date.parse(data.expires_at))||!['active','used','revoked','expired'].includes(data.status))invalid();
 return {id:data.id,expires_at:data.expires_at,status:data.status};
}
export function invitations(data){if(!Array.isArray(data?.invitations))invalid();return {invitations:data.invitations.map(invitation)};}
export function audit(data){
 if(!Array.isArray(data?.audit))invalid();return {audit:data.audit.map(row=>{
  if(typeof row.actor!=='string'||!Number.isFinite(row.time)||typeof row.action!=='string'||!(row.revision===null||Number.isSafeInteger(row.revision))||!row.changes||typeof row.changes!=='object'||Array.isArray(row.changes))invalid();
  return {actor:row.actor,time:row.time,action:row.action,revision:row.revision,changes:structuredClone(row.changes)};
 })};
}
