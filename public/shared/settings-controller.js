import {createSettingsModel} from './settings-model.js';

// Both product and QA inject effects. There is no role override or fixture
// fallback here; all live reads and writes still require the server admin gate.
export function createSettingsController({effects,paint}){
 let model=null,session=null,alive=true,nextAction=null,reviewed=null;
 let state={status:'loading',resource:null,session:null,changes:[],dialog:null,conflict:null,pending:false,error:null,raw:{},fieldErrors:{},budget:{status:'loading',value:null,error:null}};
 const show=()=>{if(!alive)return;if(model){state.resource=model.snapshot();state.changes=model.review().changes;state.catalogRowIds=model.catalogRowIds();}paint(structuredClone(state));};
 const failure=error=>({code:error.code||error.message||'UNAVAILABLE',status:error.status??null,retryAfter:error.retryAfter??null});
 const edit=action=>{if(!model||state.pending)return;try{action();state.error=null;}catch(error){state.error=failure(error);}show();};
 return {
  async load(){
   state.status='loading';state.error=null;show();
   try{
    session=await effects.getSession();
    if(session.authenticated!==true||session.role!=='admin')throw Object.assign(Error('ADMIN_REQUIRED'),{status:session.authenticated?403:401});
    const resource=await effects.getAdminSettings();if(!alive)return;
    model=createSettingsModel(resource);state.status='ready';state.session=session;state.dialog=null;
   }catch(error){model=null;state.status='unavailable';state.resource=null;state.error=failure(error);}
   show();
  },
  async loadBudget(){
   if(!model||session?.authenticated!==true||session.role!=='admin')return;
   state.budget={status:'loading',value:null,error:null};show();
   try{const value=await effects.getBudget();if(!alive)return;state.budget={status:'ready',value,error:null};}
   catch(error){if(!alive)return;state.budget={status:'unavailable',value:null,error:failure(error)};}
   show();
  },
  set(path,value,raw){if(!model||state.pending||state.dialog==='settings-review')return;try{model.set(path,value);delete state.raw[path];delete state.fieldErrors[path];state.error=null;}catch(error){state.raw[path]=String(raw??value);state.fieldErrors[path]='입력 형식과 허용 범위를 확인해주세요.';state.error=failure(error);}show();},
  addCatalog:()=>edit(()=>model.addCatalog()),
  removeCatalog:index=>edit(()=>{
   model.removeCatalog(index);
   const remap=values=>Object.fromEntries(Object.entries(values).flatMap(([path,value])=>{
    const match=/^public[.]catalog[.](\d+)[.](.+)$/.exec(path);if(!match)return [[path,value]];
    const row=Number(match[1]);return row===index?[]:[[row>index?'public.catalog.'+(row-1)+'.'+match[2]:path,value]];
   }));
   state.raw=remap(state.raw);state.fieldErrors=remap(state.fieldErrors);
  }),
  cancel:()=>edit(()=>{model.cancel();state.dialog=null;state.raw={};state.fieldErrors={};}),
  review:()=>edit(()=>{if(Object.keys(state.fieldErrors).length)throw Error('INVALID_SETTING');model.validate();reviewed=model.snapshot();state.dialog=model.review().changes.length?'settings-review':null;}),
  closeDialog(){if(state.pending)return;state.dialog=null;nextAction=null;show();},
  requestLeave(action){if(state.pending)return;if(model?.review().changes.length||Object.keys(state.raw).length){nextAction=action;state.dialog='settings-leave';show();}else action();},
  confirmLeave(){if(state.pending||state.dialog!=='settings-leave')return;const action=nextAction;nextAction=null;model.cancel();state.raw={};state.fieldErrors={};state.dialog=null;show();action?.();},
  async confirmSave(){
   if(!model||state.pending||state.dialog!=='settings-review')return;
   state.pending=true;state.error=null;show();
   try{
    if(!reviewed)throw Error('SETTINGS_REVIEW_REQUIRED');const resource=reviewed;
    const saved=await effects.saveSettings({revision:resource.revision,settings:resource.settings});
    if(!alive)return;model.acceptSaved(saved);state.dialog=null;state.conflict=null;reviewed=null;state.raw={};state.fieldErrors={};
   }catch(error){
    if(!alive)return;state.error=failure(error);
    if(error.code==='REVISION_CONFLICT'){
     // Fetch current revision for comparison without replacing the local draft.
     try{model.acceptLatest(await effects.getAdminSettings());}catch(latestError){state.error=failure(latestError);}
     if(!alive)return;state.conflict=model.conflict();state.dialog='settings-conflict';
    }
   }finally{state.pending=false;show();}
  },
  requestReload(){if(!model||state.pending)return;state.dialog='settings-reload';show();},
  confirmReload:()=>edit(()=>{model.reloadLatest();state.dialog=null;state.conflict=null;state.raw={};state.fieldErrors={};}),
  dispose(){alive=false;model=null;}
 };
}
