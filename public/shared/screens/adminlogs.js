import {escapeHtml as E,notice,tag} from '../components/auth-primitives.js';
import {renderProductHeader} from '../components/header.js';
import {renderAdminNav} from '../components/admin-nav.js';
const statuses={active:'사용 전',used:'사용 완료',expired:'만료됨',revoked:'취소됨'};
const actions={'admin.bootstrap':'최초 관리자 확인','settings.update':'설정 변경','invitation.create':'가입 초대 발급','invitation.revoke':'가입 초대 취소'};
function changes(value,path=''){
 if(value!==null&&typeof value==='object')return Object.entries(value).flatMap(([key,item])=>changes(item,path?path+'.'+key:key));
 return [{path,value:value===null?'없음':typeof value==='boolean'?(value?'ON':'OFF'):String(value)}];
}
export function renderAdminLogs(vm){
 const {section,status,Session,Config,resource,rows=[],pending,error}=vm;
 const header=renderProductHeader({status:status==='denied'?'ready':status,Session,Config,ui:{route:'/admin/'+section}});
 if(status!=='ready'||Session?.role!=='admin'||!resource)return `${header}<main id="content" class="x-main x-wrap">${notice(status==='loading'?'목록을 읽고 있어요.':'이 목록을 볼 수 없어요.',status==='loading'?'실제 관리자 세션과 서버 응답을 확인해요.':'실제 관리자 권한과 연결 상태를 확인해주세요. '+(error?.code||''),status==='loading'?'':'error')}</main>`;
 const invitations=section==='invitations';
 const heading=`<div class="admin-page-head"><span class="eyebrow">${invitations?'SIGNUP INVITATIONS':'RECORDED CHANGES'}</span><h1>${invitations?'건네준 초대장':'변경 기록'}</h1><p>${invitations?'가입 초대는 계정 가입 자격이며 방 접근이나 에이전트 승인 권한과 달라요. 원문 코드는 발급 직후 한 번만 보여요.':'서버가 기록한 변경을 읽어요. 여기서 설정이나 기록을 바꾸지 않아요. 원문 이메일·IP·권한 키는 표시하지 않아요.'}</p></div>`;
 const list=invitations?rows.map(row=>`<article class="invite-row"><div><strong>가입 초대</strong><p>${E(statuses[row.status])} · ${E(new Date(row.expires_at).toLocaleString('ko-KR'))} 만료</p><code>${E(row.id)}</code></div>${tag(statuses[row.status],row.status==='active'?'':'muted')}${row.status==='active'?`<button type="button" class="text-button" data-x="revoke-invitation" data-id="${E(row.id)}" ${pending?'disabled':''}>취소</button>`:''}</article>`).join(''):rows.map(row=>`<article class="invite-row"><div><strong>${E(actions[row.action]||row.action)}</strong><p>${E(new Date(row.time).toLocaleString('ko-KR'))} · 변경자 ${E(row.actor)}${row.revision===null?'':` · 설정 버전 ${E(row.revision)}`}</p><ul class="change-list">${changes(row.changes).map(change=>`<li><span>${E(change.path)}</span><div><b>${E(change.value)}</b></div></li>`).join('')}</ul></div></article>`).join('');
 return `${header}<main id="content" class="admin-shell">${renderAdminNav(resource,section)}<section class="admin-content">${heading}<section class="invites-section"><div class="section-heading"><h2>${invitations?'가입 초대 목록':'서버 변경 기록'}</h2><button type="button" class="btn soft" data-x="${invitations?'new-invitation':'reload-adminlogs'}" ${pending?'disabled':''}>${invitations?'초대 만들기':'다시 읽기'}</button></div>${rows.length?`<div class="invite-list">${list}</div>`:`<div class="admin-empty"><h3>${invitations?'아직 건네준 초대가 없어요.':'기록된 변경이 없어요.'}</h3></div>`}<p class="fineprint">서버가 반환한 목록만 보여요. 전체 기록 수나 숨겨진 항목의 존재를 추정하지 않아요.</p>${error?notice('요청을 마치지 못했어요.',error.code+(error.retryAfter?` · ${error.retryAfter}초 이후 다시 시도해주세요.`:''),'error'):''}</section></section></main>`;
}
