import {invitation} from './adminlogs-projection.js';
// Lists and one-time disclosure are distinct. Plaintext code never enters normal state.
export function createAdminLogsController({effects,section,paint,navigate=()=>{}}){
 let alive=true,generation=0,code=null,retryTimer=null;
 let state={status:'loading',section,Session:null,Config:null,resource:null,rows:[],dialog:null,selected:null,pending:false,error:null,ttl_seconds:null,retryAt:0};
 const show=()=>{if(alive)paint(structuredClone(state));};
 const failure=error=>({code:error.code||error.message||'UNAVAILABLE',status:error.status??null,retryAfter:error.retryAfter??null});
 function failed(error){state.error=failure(error);if(error.status===429){const n=Number(error.retryAfter),delay=Number.isFinite(n)?Math.max(0,n*1000):Math.max(0,Date.parse(error.retryAfter)-Date.now());state.retryAt=Date.now()+delay;clearTimeout(retryTimer);retryTimer=setTimeout(show,delay);}}
 return {
  async load(){if(state.pending)return;const own=++generation;code=null;state={...state,status:'loading',dialog:null,error:null};show();
   try{const [Config,Session]=await Promise.all([effects.getConfig(),effects.getSession()]);if(!alive||own!==generation)return;state.Config=Config;state.Session=Session;
    if(!Session.authenticated||Session.role!=='admin'){state.status='denied';state.rows=[];state.resource=null;show();return;}
    const [resource,list]=await Promise.all([effects.getAdminSettings(),section==='invitations'?effects.getInvitations():effects.getAudit()]);if(!alive||own!==generation)return;
    const field=resource.schema?.fields?.identity?.fields?.invitationTtlSeconds,ttl=resource.settings?.identity?.invitationTtlSeconds;
    if(section==='invitations'&&(!field||field.type!=='integer'||!Number.isSafeInteger(ttl)||ttl<field.min||ttl>field.max))throw Error('INVITATION_SCHEMA_UNAVAILABLE');
    const rows=section==='invitations'?list.invitations:list.audit;if(!Array.isArray(rows))throw Error('INVALID_ADMIN_PROJECTION');
    state={...state,status:'ready',resource,rows:structuredClone(rows),ttl_seconds:ttl??null};
   }catch(error){if(!alive||own!==generation)return;state.status='unavailable';state.rows=[];state.error=failure(error);}show();
  },
  requestCreate(){if(state.status!=='ready'||state.pending||section!=='invitations')return;code=null;state.selected=null;state.dialog='invitation-create';state.error=null;show();},
  setTtl(value){if(state.dialog!=='invitation-create'||state.pending)return;state.ttl_seconds=value;state.error=null;show();},
  requestRevoke(id){if(state.status!=='ready'||state.pending||section!=='invitations')return;const row=state.rows.find(x=>x.id===id);if(!row||row.status!=='active')return;code=null;state.selected=row;state.dialog='invitation-revoke';state.error=null;show();},
  closeDialog(){if(state.pending)return;code=null;state.dialog=null;state.selected=null;show();},
  async confirm(){
   if(state.pending||state.retryAt>Date.now()||state.status!=='ready'||!['invitation-create','invitation-revoke'].includes(state.dialog))return;
   const own=generation,kind=state.dialog,selected=state.selected;
   if(kind==='invitation-create'){const field=state.resource.schema.fields.identity.fields.invitationTtlSeconds;if(!Number.isSafeInteger(state.ttl_seconds)||state.ttl_seconds<field.min||state.ttl_seconds>field.max){state.error={code:'INVALID_INVITATION_TTL'};show();return;}}
   state.pending=true;state.error=null;show();
   try{
    if(kind==='invitation-create'){
     const result=await effects.createInvitation(state.ttl_seconds);if(!alive||own!==generation)return;const row=invitation(result);
     if(row.status!=='active'||typeof result.code!=='string'||!result.code)throw Error('INVITATION_RESULT_UNAVAILABLE');
     code=result.code;state.rows=[row,...state.rows.filter(x=>x.id!==row.id)];state.selected=row;state.dialog='invitation-created';
    }else{
     const result=await effects.revokeInvitation(selected.id);if(!alive||own!==generation)return;
     if(result.id!==selected.id||!['revoked','used','expired'].includes(result.status))throw Error('INVALID_REVOKE_RESPONSE');
     state.rows=state.rows.map(x=>x.id===result.id?{...x,status:result.status}:x);state.dialog=null;state.selected=null;
    }
   }catch(error){if(alive&&own===generation)failed(error);}finally{if(alive&&own===generation){state.pending=false;show();}}
  },
  oneTimeCode:()=>code,
  async logout(){if(state.pending)return;state.pending=true;show();try{await effects.logout();if(alive)navigate('/');}catch(error){if(alive)failed(error);}finally{if(alive){state.pending=false;show();}}},
  dispose(){alive=false;generation++;code=null;clearTimeout(retryTimer);state.rows=[];state.Session=null;}
 };
}
