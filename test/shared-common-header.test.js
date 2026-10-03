import {it,expect} from 'vitest';
import {room,guide,introduction,terminal} from '../public/shared/screens/common-room.js';
import {createCommonHeaderController} from '../public/shared/common-header-controller.js';
import {createLiveAdapter} from '../public/effects/live-http.js';
const config={mode:'DEMO',signup:'invite'},anon={authenticated:false,role:'anonymous',entitlements:{can_create_private:false,can_persist_private:false},owner_ack:null};
const member={...anon,authenticated:true,role:'member'},admin={...member,role:'admin'};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
it('uses the existing product header and footer for every common screen with actual-role view data',()=>{
 for(const render of [room,guide,introduction,vm=>terminal('ROOM_GONE',vm)]){
  const anonymous=render({status:'ready',Session:anon,Config:config});expect(anonymous.indexOf('초대 코드로 가입')).toBeLessThan(anonymous.indexOf('>로그인<'));expect(anonymous).toContain('class="header x-header"');expect(anonymous).not.toContain('어떻게 쓰나요?</a></nav>');
  const signed=render({status:'ready',Session:member,Config:config});expect(signed).toContain('내 자리');expect(signed).not.toContain('관리자 설정');expect(signed).toContain('class="x-bottom-links"');
  expect(render({status:'ready',Session:admin,Config:config})).toContain('관리자 설정');
 }
});
it('ignores old header responses and disposal, using unavailable rather than an anonymous fallback',async()=>{
 const slow=deferred();let call=0,state;const c=createCommonHeaderController({effects:{getConfig:async()=>config,getSession:()=>++call===1?slow.promise:Promise.resolve(member)},paint:v=>state=v});
 const first=c.load('/guide');await c.load('/about');expect(state.Session.role).toBe('member');slow.resolve(anon);await first;expect(state.Session.role).toBe('member');expect(state.ui.route).toBe('/about');c.dispose();
 const broken=createCommonHeaderController({effects:{getConfig:async()=>{throw Error('CONFIG_UNAVAILABLE');},getSession:async()=>anon},paint:v=>state=v});await broken.load('/');expect(state.status).toBe('unavailable');expect(state.Session).toBe(null);broken.dispose();
});
it('does not let a stale common GET replace the current session CSRF binding',async()=>{
 const slow=deferred();let reads=0,mutation;const adapter=createLiveAdapter({fetch:async(path,options)=>{
  if(path==='/api/session')return ++reads===1?slow.promise:Response.json({...member,csrf_token:'fictional-current-csrf'});
  mutation=options;return Response.json({agent:{id:'fictional-agent',name:'가상',status:'revoked',pending_expires_at:'2026-10-04T00:00:00.000Z',credential_expires_at:null}});
 }});
 const old=adapter.getSession();await adapter.getSession();slow.resolve(Response.json({...anon,csrf_token:null}));await old;await adapter.revokeAgent('fictional-agent');expect(mutation.headers['X-CSRF-Token']).toBe('fictional-current-csrf');
});
