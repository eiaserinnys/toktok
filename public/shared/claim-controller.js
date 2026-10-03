// Bearer stays in the controller closure and effect boundary, never a ViewModel.
export function createClaimController({id,cap,effects,paint,navigate=()=>{}}){
 let bearer=cap,alive=true,generation=0;
 let state={status:'loading',Session:null,Config:null,agent:null,checked:false,pending:false,error:null};
 const show=()=>{if(alive)paint(structuredClone(state));};
 const failure=e=>({code:e.code||e.message||'UNAVAILABLE',status:e.status??null,retryAfter:e.retryAfter??null});
 return {
  async load(){const own=++generation;state={...state,status:'loading',checked:false,error:null};show();
   try{const [Config,Session,agent]=await Promise.all([effects.getConfig(),effects.getSession(),effects.getClaim(id,bearer)]);
    if(!alive||own!==generation)return;if(agent.id!==id)throw Error('INVALID_CLAIM');state={...state,status:'ready',Config,Session,agent};
   }catch(error){if(!alive||own!==generation)return;state={...state,status:'unavailable',agent:null,error:failure(error)};}show();
  },
  setChecked(value){if(state.pending||state.status!=='ready')return;state.checked=value===true;show();},
  async approve(){if(state.status!=='ready'||!state.Session.authenticated||!state.checked||state.pending||state.agent.status!=='pending')return;
   const own=generation;state.pending=true;state.error=null;show();
   try{const agent=await effects.approveClaim(id,bearer);if(!alive||own!==generation)return;
    if(agent.id!==id||agent.status!=='approved')throw Error('INVALID_APPROVAL_RESPONSE');state.agent=agent;state.checked=false;
   }catch(error){if(alive&&own===generation)state.error=failure(error);}finally{if(alive&&own===generation){state.pending=false;show();}}
  },
  async logout(){if(state.pending)return;const own=generation;state.pending=true;state.error=null;show();try{await effects.logout();if(alive&&own===generation)navigate('/rooms');}catch(error){if(alive&&own===generation)state.error=failure(error);}finally{if(alive&&own===generation){state.pending=false;show();}}},
  dispose(){alive=false;generation++;bearer=null;state.Session=null;state.checked=false;}
 };
}
