import {supportsPublicEntry} from './components/public-entry-terms.js';
// The nonce stays in this closure. ViewModels never contain proof cookies, request secrets or grants.
export function createPublicConnectionController({effects,slug,requestId,paint}){
 let gone=false,generation=0,nonce=null;
 let state={status:'loading',slug,connection:null,error:null,dialog:null,pending:false};
 const show=()=>{if(!gone)paint(structuredClone(state));};
 const project=data=>{
  if(!data||data.request_id!==requestId||!['pending','approved','denied','revoked','expired'].includes(data.status)||typeof data.nickname!=='string'||typeof data.expires_at!=='string')throw Error('INVALID_CONNECTION');
  const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
  const entry={request_id:data.request_id,status:data.status,participant_connected:data.status==='approved'&&data.participant_connected===true,nickname:data.nickname,expires_at:data.expires_at,
   confirmation_expires_at:date(data.confirmation_expires_at),entry_expires_at:date(data.entry_expires_at),
   entry_notice_version:typeof data.entry_notice_version==='string'?data.entry_notice_version:null,
   entry_duration_seconds:Number.isSafeInteger(data.entry_duration_seconds)?data.entry_duration_seconds:null,
   lease_idle_seconds:Number.isSafeInteger(data.lease_idle_seconds)&&data.lease_idle_seconds>0&&data.lease_idle_seconds<=300?data.lease_idle_seconds:null};
  entry.can_approve=entry.status==='pending'&&supportsPublicEntry(entry)&&entry.confirmation_expires_at!==null&&data.entry_expires_at===null&&typeof data.nonce==='string'&&data.nonce.length>0;
  return entry;
 };
 async function load(){const own=++generation;nonce=null;state={...state,status:'loading',connection:null,error:null,dialog:null,pending:false};show();
  try{const data=await effects.publicConnection(slug,{action:'preview',request_id:requestId});if(gone||own!==generation)return;state.connection=project(data);nonce=typeof data.nonce==='string'?data.nonce:null;state.status='ready';}
  catch(error){if(gone||own!==generation)return;state.status=error.code==='CONNECTION_GONE'?'expired':'unavailable';state.error={code:error.code??'CONNECTION_UNAVAILABLE'};}show();
 }
 async function decide(action,checked=false){
  const connection=state.connection;
  if(gone||state.pending||!connection||!nonce||!['approve','deny','revoke'].includes(action))return;
  if(action==='approve'&&(!checked||!connection.can_approve)||action==='deny'&&connection.status!=='pending'||action==='revoke'&&connection.status!=='approved')return;
  const own=generation;state.pending=true;state.error=null;show();
  try{const data=await effects.publicConnection(slug,{action,request_id:requestId,nonce,...(action==='approve'?{checked:true,risk_ack_version:'toktok-risk-v2',entry_notice_version:connection.entry_notice_version}:{})});if(gone||own!==generation)return;state.connection=project(data);state.dialog=null;}
  catch(error){if(gone||own!==generation)return;state.error={code:error.code??'CONNECTION_UNAVAILABLE'};if(error.code==='CONNECTION_GONE'){state.status='expired';state.connection=null;state.dialog=null;nonce=null;}}
  if(!gone&&own===generation){state.pending=false;show();}
 }
 return {load,decide,open(revoke=false){if(gone||state.pending||!state.connection||(!revoke&&!state.connection.can_approve)||(revoke&&state.connection.status!=='approved'))return;state.dialog=revoke?'revoke':'approve';state.error=null;show();},close(){if(!state.pending){state.dialog=null;show();}},dispose(){gone=true;generation++;nonce=null;},snapshot:()=>structuredClone(state)};
}
