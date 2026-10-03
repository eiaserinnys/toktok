// A server-owned list; no fixture, local room count or credential material.
export function createAccountController({effects,paint,navigate=()=>{}}){
 let alive=true,generation=0,selected=null;
 let state={status:'loading',Session:null,Config:null,dialog:null,pending:false,error:null,bootstrapChecked:false};
 const eligible=()=>state.Session?.authenticated===true&&state.Session.role==='member'&&state.Session.can_bootstrap_admin===true;
 const show=()=>{if(alive)paint(structuredClone(state));};
 const failure=error=>({code:error.code||error.message||'UNAVAILABLE',status:error.status??null,retryAfter:error.retryAfter??null});
 return {
  async load(){const own=++generation;state.status='loading';state.error=null;show();
   try{const [Config,Session]=await Promise.all([effects.getConfig(),effects.getSession()]);if(!alive||own!==generation)return;
    if(Session.authenticated&&!Array.isArray(Session.agents))throw Error('INVALID_ACCOUNT_PROJECTION');
    state={...state,status:'ready',Config,Session,dialog:null,bootstrapChecked:false};
   }catch(error){if(!alive||own!==generation)return;state={...state,status:'unavailable',Config:null,Session:null,error:failure(error)};}show();
  },
  requestRevoke(id){if(state.pending||state.Session?.authenticated!==true)return;const agent=state.Session.agents.find(row=>row.id===id);if(!agent||agent.status!=='approved')return;selected=id;state.dialog='agent-revoke';state.selected=agent;state.error=null;show();},
  requestBootstrap(){if(state.pending||!eligible())return;selected=null;state.dialog='admin-bootstrap';state.bootstrapChecked=false;state.error=null;show();},
  checkBootstrap(checked){if(state.pending||state.dialog!=='admin-bootstrap'||!eligible())return;state.bootstrapChecked=checked===true;show();},
  async confirmBootstrap(){
   if(state.pending||state.dialog!=='admin-bootstrap'||state.bootstrapChecked!==true||!eligible())return;const own=generation;state.pending=true;state.error=null;show();
   try{const result=await effects.bootstrapAdmin(true);if(!alive||own!==generation)return;if(result?.bootstrapped!==true)throw Error('INVALID_BOOTSTRAP_RESPONSE');
    const session=await effects.getSession();if(!alive||own!==generation)return;if(session.authenticated!==true||session.role!=='admin'||!Array.isArray(session.agents))throw Error('ADMIN_SESSION_UNAVAILABLE');
    state.Session=session;state.dialog=null;state.bootstrapChecked=false;
   }catch(error){if(alive&&own===generation)state.error=failure(error);}finally{if(alive&&own===generation){state.pending=false;show();}}
  },
  closeDialog(){if(state.pending)return;selected=null;state.dialog=null;state.selected=null;state.bootstrapChecked=false;show();},
  async confirmRevoke(){
   if(state.pending||state.dialog!=='agent-revoke'||!selected)return;const own=generation,id=selected;state.pending=true;show();
   try{const agent=await effects.revokeAgent(id);if(!alive||own!==generation)return;
    if(agent.id!==id||agent.status!=='revoked')throw Error('INVALID_REVOKE_RESPONSE');
    state.Session.agents=state.Session.agents.map(row=>row.id===id?agent:row);selected=null;state.dialog=null;state.selected=null;
   }catch(error){if(alive&&own===generation)state.error=failure(error);}finally{if(alive&&own===generation){state.pending=false;show();}}
  },
  async logout(){if(state.pending)return;state.pending=true;show();try{await effects.logout();if(alive)navigate('/');}catch(error){if(alive)state.error=failure(error);}finally{if(alive){state.pending=false;show();}}},
  dispose(){alive=false;generation++;selected=null;state.Session=null;}
 };
}
