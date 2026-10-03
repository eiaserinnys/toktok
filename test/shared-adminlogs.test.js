import {it,expect} from 'vitest';
import {createAdminLogsController} from '../public/shared/adminlogs-controller.js';
import {createLiveAdapter} from '../public/effects/live-http.js';
import {renderAdminLogs} from '../public/shared/screens/adminlogs.js';
const session={authenticated:true,role:'admin',entitlements:{can_create_private:true,can_persist_private:true},owner_ack:null};
const resource={revision:27,settings:{identity:{invitationTtlSeconds:600}},schema:{fields:{identity:{label:'인증',fields:{invitationTtlSeconds:{type:'integer',label:'초대 수명',min:1,max:2592000,unit:'seconds',applyTo:'authentication'}}}}}};
const invite={id:'fictional-id',expires_at:'2026-10-04T00:00:00.000Z',status:'active'};
it('requires actual admin Session before reading lists, without fixture/query privileges',async()=>{
 let reads=0,state;const c=createAdminLogsController({section:'invitations',effects:{getConfig:async()=>({mode:'DEMO',signup:'invite'}),getSession:async()=>({...session,role:'member'}),getAdminSettings:async()=>{reads++;return resource;},getInvitations:async()=>{reads++;return {invitations:[invite]};}},paint:v=>state=v});
 await c.load();expect(reads).toBe(0);expect(state.status).toBe('denied');expect(renderAdminLogs(state)).not.toContain('fictional-id');c.dispose();
});
it('creates only after confirmation, keeps one-time opaque code out of normal state/list and clears it on close',async()=>{
 let state,creates=0;const opaque='opaque.Fictional-Invite_not-a-UUID';const c=createAdminLogsController({section:'invitations',effects:{getConfig:async()=>({mode:'DEMO',signup:'invite'}),getSession:async()=>session,getAdminSettings:async()=>resource,getInvitations:async()=>({invitations:[]}),createInvitation:async ttl=>{creates++;expect(ttl).toBe(600);return {...invite,code:opaque};}},paint:v=>state=v});
 await c.load();c.requestCreate();expect(creates).toBe(0);await c.confirm();expect(creates).toBe(1);expect(state.rows).toEqual([invite]);expect(JSON.stringify(state)).not.toContain(opaque);expect(c.oneTimeCode()).toBe(opaque);c.closeDialog();expect(c.oneTimeCode()).toBe(null);expect(state.dialog).toBe(null);c.dispose();
});
it('maps list/audit projections and actual mutation CSRF without retaining unknown credentials',async()=>{
 const calls=[];const adapter=createLiveAdapter({fetch:async(path,options)=>{calls.push({path,options});return Response.json(path==='/api/session'?{...session,csrf_token:'fictional-csrf'}:path==='/api/admin/invitations'?{invitations:[{...invite,code:'must-not-leak',token_hash:'must-not-leak'}]}:path==='/api/admin/audit'?{audit:[{actor:'<fictional-admin>',time:1770000000000,action:'settings.update',revision:27,changes:{'public.catalog':{count:2,enabled_count:1}},email:'must-not-leak'}]}:{id:invite.id,status:'revoked'});}});
 await adapter.getSession();expect(await adapter.getInvitations()).toEqual({invitations:[invite]});const audit=await adapter.getAudit();expect(JSON.stringify(audit)).not.toContain('must-not-leak');await adapter.revokeInvitation(invite.id);expect(calls.at(-1).options.headers['X-CSRF-Token']).toBe('fictional-csrf');
 const html=renderAdminLogs({status:'ready',section:'audit',Session:session,Config:{mode:'DEMO',signup:'invite'},resource,rows:audit.audit});expect(html).toContain('&lt;fictional-admin&gt;');expect(html).not.toContain('<fictional-admin>');expect(html).not.toContain('textarea');
});
