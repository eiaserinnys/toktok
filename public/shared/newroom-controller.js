// Only reviewed input and share links enter the VM; owner/grant/nonce stay in memory.
export function createRoomController({effects,paint,newRequestId=()=>crypto.randomUUID(),now=()=>Date.now(),origin}){
 let alive=true,generation=0,request=null,owner=null,retryAt=0,timer=null;
 let state={status:'loading',Session:null,Config:null,purpose:'',persist:false,checked:false,pending:false,locked:false,error:null,created:null};
 const show=()=>{if(alive)paint(structuredClone({...state,retryBlocked:now()<retryAt}));};
 const failure=e=>({code:e.code||e.message||'UNAVAILABLE',status:e.status??null,retryAfter:e.retryAfter??null,...(e.room_id?{room_id:e.room_id}:{})});
 function validate(){const p=state.Config.limits.private,s=state.Session;
  if(!state.Config.enabled||(s.authenticated?!s.entitlements.can_create_private:!p.anonymousEnabled))return 'ADMISSION_DENIED';
  if(!state.purpose.trim()||Array.from(state.purpose).length>1000)return 'PURPOSE_INVALID';
  if(!state.checked)return 'RISK_ACK_REQUIRED';
  const max=s.authenticated?p.authenticatedMaxTtlSeconds:p.anonymousMaxTtlSeconds;
  if(!Number.isSafeInteger(state.ttl_seconds)||state.ttl_seconds<1||state.ttl_seconds>max)return 'TTL_INVALID';
  if(state.persist&&(!s.authenticated||!s.entitlements.can_persist_private))return 'PERSIST_DENIED';
  if(state.persist&&(!Number.isSafeInteger(state.retention_seconds)||state.retention_seconds<1||state.retention_seconds>p.maxRetentionSeconds))return 'RETENTION_INVALID';
  if(state.persist&&state.retention_seconds>state.ttl_seconds)return 'RETENTION_EXCEEDS_TTL';
 }
 return {
  async load(){const own=++generation;state.status='loading';show();
   try{const [Config,Session]=await Promise.all([effects.getConfig(),effects.getSession()]);if(!alive||own!==generation)return;
    const p=Config.limits.private;state={...state,status:'ready',Config,Session,ttl_seconds:Session.authenticated?p.authenticatedDefaultTtlSeconds:p.anonymousDefaultTtlSeconds,retention_seconds:p.defaultRetentionSeconds,persist:false,checked:false,error:null};
   }catch(error){if(!alive||own!==generation)return;state={...state,status:'unavailable',Config:null,Session:null,error:failure(error)};}show();
  },
  set(key,value){if(state.pending||state.locked||state.status!=='ready'||!['purpose','persist','checked','ttl_seconds','retention_seconds'].includes(key))return;
   if(key==='persist'&&value===true&&(!state.Session.authenticated||!state.Session.entitlements.can_persist_private))return;
   state[key]=value;state.error=null;show();
  },
  async submit(){if(state.pending||!['ready','uncertain'].includes(state.status)||now()<retryAt||state.error?.code==='CREATE_RESULT_NOT_RECOVERABLE')return;
   const invalid=request?null:validate();if(invalid){state.error={code:invalid};show();return;}
   const own=generation;state.pending=true;state.error=null;show();
   try{
    if(!request){const context=await effects.createContext();if(!alive||own!==generation)return;
     if(typeof context.nonce!=='string'||context.notice_version!=='toktok-risk-v2'||typeof context.can_persist_private!=='boolean'||context.authenticated!==state.Session.authenticated)throw Error('INVALID_CREATION_CONTEXT');
     if(state.persist&&!context.can_persist_private)throw Error('PERSIST_DENIED');
     const grant=await effects.creationGrant({nonce:context.nonce,risk_ack:true});if(!alive||own!==generation)return;
     if(typeof grant.creation_grant!=='string'||grant.notice_version!=='toktok-risk-v2'||typeof grant.expires_at!=='string')throw Error('INVALID_CREATION_GRANT');
     request={purpose:state.purpose,ttl_seconds:state.ttl_seconds,persist:state.persist,client_request_id:newRequestId(),creation_grant:grant.creation_grant,...(state.persist?{retention_seconds:state.retention_seconds}:{})};state.locked=true;
    }
    const result=await effects.createRoom(structuredClone(request));if(!alive||own!==generation)return;
    const room=result.room;if(!room||typeof room.id!=='string'||typeof room.purpose!=='string'||typeof room.expires_at!=='string'||room.visibility!=='private'||!['recent_buffer','persisted'].includes(room.retention_mode)||room.notice_version!=='toktok-risk-v2'||typeof result.invite_url!=='string'||typeof result.read_url!=='string'||typeof result.owner_token!=='string')throw Error('INVALID_CREATE_RESPONSE');
    for(const value of [result.invite_url,result.read_url]){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(origin&&url.origin!==origin)||!url.pathname.startsWith('/r/'+room.id+'/')||url.pathname.slice(('/r/'+room.id+'/').length).includes('/'))throw Error('INVALID_CREATE_RESPONSE');}
    if(room.retention_mode!==(request.persist?'persisted':'recent_buffer')||(request.persist?room.retention_seconds!==request.retention_seconds:!Number.isFinite(room.retention_seconds)||room.retention_seconds<=0))throw Error('INVALID_CREATE_RESPONSE');
    owner=result.owner_token;state.created={room:{id:room.id,purpose:room.purpose,expires_at:room.expires_at,retention_mode:room.retention_mode,retention_seconds:room.retention_seconds,notice_version:room.notice_version},invite_url:result.invite_url,read_url:result.read_url};state.status='created';state.checked=false;
   }catch(error){if(!alive||own!==generation)return;state.error=failure(error);state.status=state.locked?'uncertain':'ready';
    retryAt=now()+Math.max(0,Number(error.retryAfter)||0)*1000;clearTimeout(timer);if(retryAt>now())timer=setTimeout(show,retryAt-now());
   }finally{if(alive&&own===generation){state.pending=false;show();}}
  },
  ownerMaterial:()=>owner,
  dispose(){alive=false;generation++;clearTimeout(timer);request=null;owner=null;state.created=null;state.checked=false;}
 };
}
