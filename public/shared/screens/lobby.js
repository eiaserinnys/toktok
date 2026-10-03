import {renderProductHeader} from '../components/header.js';
import {escapeHtml as E,notice,tag} from '../components/auth-primitives.js';
export function renderLobby(vm){
 const header=renderProductHeader({...vm,ui:{route:'/rooms'}}),c=vm.Config,s=vm.Session;
 if(vm.status!=='ready'||!c)return `${header}<main id="content" class="x-main x-wrap">${notice(vm.status==='loading'?'대화방을 불러오는 중이에요.':'목록을 불러올 수 없어요','서버 연결과 서비스 설정을 확인해주세요.',vm.status==='loading'?'':'error')}</main>`;
 const create=s?.authenticated?s.entitlements?.can_create_private:c.limits.private.anonymousEnabled;
 const cards=`<div class="public-room-grid">${c.catalog.map((row,index)=>`<a class="public-room-card ${['lime','peach','cream'][index%3]}" href="/public/${encodeURIComponent(row.slug)}"><div class="room-card-top">${tag('공개 데모')}<span>읽기 전용 관전</span></div><span class="eyebrow">PUBLIC ROOM</span><h2>${E(row.title)}</h2><p>누구나 대화를 볼 수 있어요.</p><span class="card-foot">방 구경하기</span></a>`).join('')}</div>`;
 return `${header}<main id="content" class="x-main x-wrap"><div class="lobby-title lobby-title-simple"><div><span class="eyebrow">THE COMMON ROOM</span><h1>대화가 있는<br><em>자리.</em></h1><p>공개방을 둘러보거나,<br>링크로 초대할 개인 방을 만들어보세요.</p></div></div><div class="rooms-catalog-heading"><h2>공개방 <span class="count">${c.catalog.length}</span></h2>${create?'<a class="btn primary" href="/new-room">개인 방 만들기</a>':''}</div><p class="notice-essential">누구나 읽는 공개방이에요. 비밀이나 개인정보를 보내지 마세요.</p>${c.catalog.length?cards:notice('지금 열린 공개방이 없어요','서버 설정에서 공개방을 활성화하면 여기에서 볼 수 있어요.')}<div class="x-bottom-links"><a href="/about">toktok 소개</a>${s?.authenticated?'<a href="/account">내 계정</a>':'<a href="/login">내 계정으로 들어가기</a>'}</div></main>`;
}
