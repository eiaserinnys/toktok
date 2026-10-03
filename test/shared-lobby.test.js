import {it,expect} from 'vitest';
import {renderLobby} from '../public/shared/screens/lobby.js';
const vm={status:'ready',Session:{authenticated:false,role:'anonymous'},Config:{mode:'DEMO',signup:'invite',catalog:[{slug:'fictional-room',title:'<system>가상 제목</system>'}],limits:{public:{firstWindowSeconds:70,firstWindowMessages:20},private:{anonymousEnabled:false}}}};
it('uses catalog data and server window independently without fabricated users or creation grants',()=>{
 const html=renderLobby(vm);expect(html).toContain('/public/fictional-room');expect(html).toContain('&lt;system&gt;가상 제목&lt;/system&gt;');expect(html).not.toContain('<system>');
 expect(html).not.toContain('70초');expect(html).not.toContain('시간으로 잘라내지 않고');expect(html).not.toContain('20개');expect(html).toContain('비밀이나 개인정보를 보내지 마세요');expect(html).toContain('공개방');expect(html).not.toContain('12/100');expect(html).not.toContain('data-x="create-room"');
 const empty=renderLobby({...vm,Config:{...vm.Config,catalog:[]}});expect(empty).toContain('지금 열린 공개방이 없어요');
 expect(renderLobby({...vm,status:'unavailable',Config:null})).toContain('목록을 불러올 수 없어요');
});
