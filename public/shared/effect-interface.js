// ViewModels carry server projections, never session/owner secrets or fixture roles.
export const effectNames=Object.freeze([
 'publicConnection','getConfig','getSession','validateInvitation','startAuth','sendEmail','completeAuth',
 'getAdminSettings','getBudget','getInvitations','getAudit','saveSettings','createInvitation','revokeInvitation','logout',
 'getClaim','approveClaim','revokeAgent','createContext','creationGrant','createRoom'
]);
export async function loadResource(load,observe){
 observe({status:'loading',value:null,error:null});
 try{const value=await load();const state={status:'ready',value,error:null};observe(state);return state;}
 catch(error){const state={status:'unavailable',value:null,error:{code:error.code??'UNAVAILABLE',status:error.status??null,retryAfter:error.retryAfter??null}};observe(state);return state;}
}
