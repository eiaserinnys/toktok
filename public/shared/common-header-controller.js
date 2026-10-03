// Header-only state; the observer feed and page body are never re-rendered here.
export function createCommonHeaderController({effects,paint,navigate=()=>{}}){
 let alive=true,generation=0,state={status:'loading',Session:null,Config:null,ui:{}};
 const show=()=>{if(alive)paint(structuredClone(state));};
 return {
  async load(route){const own=++generation;state={status:'loading',Session:null,Config:null,ui:{route}};show();
   try{const [Config,Session]=await Promise.all([effects.getConfig(),effects.getSession()]);if(!alive||own!==generation)return;state={status:'ready',Config,Session,ui:{route}};}
   catch{if(!alive||own!==generation)return;state={status:'unavailable',Session:null,Config:null,ui:{route}};}show();
  },
  toggle(){if(state.status!=='ready'||!state.Session.authenticated)return;state.ui.accountOpen=!state.ui.accountOpen;show();},
  async logout(){if(state.status!=='ready'||!state.Session.authenticated||state.ui.logoutPending)return;const own=generation;state.ui.logoutPending=true;state.ui.logoutError=null;show();
   try{await effects.logout();if(alive&&own===generation)navigate('/');}
   catch(error){if(alive&&own===generation)state.ui.logoutError=error.code||'로그아웃하지 못했어요. 다시 시도해주세요.';}
   finally{if(alive&&own===generation){state.ui.logoutPending=false;show();}}
  },
  dispose(){alive=false;generation++;state.Session=null;state.Config=null;}
 };
}
