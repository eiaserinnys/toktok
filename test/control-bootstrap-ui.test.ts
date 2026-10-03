import {SELF} from 'cloudflare:test';
import {beforeEach,it,expect} from 'vitest';
import {reset,records,seedMember,C,save,hash,newToken,origin,SettingsStore} from './control-auth-host';
const now=Date.UTC(2030,0,1);
async function request(path:string,session?:{cookie:string;csrf:string},body?:unknown,extra:Record<string,string>={}){const response=await SELF.fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,value:await response.json() as Record<string,unknown>};}
async function session(email:string,verified=1){await seedMember(email);const token=newToken(),csrf=newToken(),key=await hash(token);await records(async tx=>{const rows=await tx.list(C.accounts,{prefix:'a:',limit:100});const account=rows.find(row=>row.value.email===email)!;await save(tx,C.accounts,account.key,{...account.value,email_verified:verified});await save(tx,C.sessions,key,{owner_id:account.value.id,csrf,expires_at:now+3600000});});return {cookie:'__Host-toktok_session='+token,csrf};}
beforeEach(async()=>{await reset();await request('/__control/reset',undefined,{});await request('/api/config');});
it('only the verified designated member sees eligibility; existing account remains eligible and denial leaves role unchanged',async()=>{
 const designated=await session('admin@fixture.example'),other=await session('other@fixture.example');
 expect((await request('/api/session')).value.can_bootstrap_admin).toBe(false);
 const eligible=(await request('/api/session',designated)).value;expect(eligible.role).toBe('member');expect(eligible.can_bootstrap_admin).toBe(true);expect(eligible).not.toHaveProperty('email');expect(eligible).not.toHaveProperty('owner_id');
 expect((await request('/api/session',other)).value.can_bootstrap_admin).toBe(false);expect((await request('/api/admin/bootstrap',other,{confirm:true})).status).toBe(403);
 for(const [payload,headers] of [[{confirm:false},{}],[{confirm:true},{'X-CSRF-Token':'fictional-stale'}],[{confirm:true},{Origin:'https://foreign.example'}]] as const)expect((await request('/api/admin/bootstrap',designated,payload,headers)).status).toBe(403);
 expect((await request('/api/admin/settings',designated)).status).toBe(403);expect((await request('/api/session',designated)).value.role).toBe('member');
 const approved=await request('/api/admin/bootstrap',designated,{confirm:true});expect(approved).toEqual({status:200,value:{bootstrapped:true}});expect((await request('/api/session',designated)).value).toMatchObject({role:'admin',can_bootstrap_admin:false});expect((await request('/api/admin/settings',designated)).status).toBe(200);expect((await request('/api/admin/bootstrap',designated,{confirm:true})).status).toBe(403);
 console.info('BOOTSTRAP_UI_BOUNDARIES',{eligible:true,other:false,anonymous:false,explicit:200,replay:403});
});
it('consumed designation, existing admin marker and unverified account all suppress bootstrap',async()=>{
 const designated=await session('admin@fixture.example',0);expect((await request('/api/session',designated)).value.can_bootstrap_admin).toBe(false);expect((await request('/api/admin/bootstrap',designated,{confirm:true})).status).toBe(403);
 await records(async tx=>{const row=(await tx.list(C.accounts,{prefix:'a:',limit:10}))[0];await save(tx,C.accounts,row.key,{...row.value,email_verified:1});await save(tx,C.accounts,'admin',{id:'fictional-other-admin'});});expect((await request('/api/session',designated)).value.can_bootstrap_admin).toBe(false);expect((await request('/api/admin/bootstrap',designated,{confirm:true})).status).toBe(403);
 await records(async tx=>{await tx.delete(C.accounts,'admin');const store=new SettingsStore(tx);await store.stateSave({...await store.state(),bootstrap_consumed:true});});expect((await request('/api/session',designated)).value.can_bootstrap_admin).toBe(false);expect((await request('/api/admin/bootstrap',designated,{confirm:true})).status).toBe(403);
 console.info('BOOTSTRAP_UI_UNAVAILABLE',{unverified:false,existingAdmin:false,consumed:false});
});
