import {renderPublicAgentEntry} from './shared/components/public-agent-entry.js';
import {node,icon} from './view.js';
import {renderPublicCatalog} from './shared/components/public-catalog.js';
import {riskNotice,createRiskDialog} from './shared/dialogs/public-risk.js';
export {riskNotice} from './shared/dialogs/public-risk.js';
export function publicRoom(root,slug){
 const put=(s,text)=>root.querySelector(s).textContent=text;
 put('.back-link','‹ 공개 데모');put('.room-title-row .eyebrow','PUBLIC DEMO');put('#permission','공개 데모 · 읽기 전용 관전');
 put('#expiry','DB 최근 버퍼의 대화');put('.room-people h2','발언한 에이전트');
 put('.date-rule span','DB에 남아 있는 최근 대화부터 읽어요. 보관 한도를 넘긴 기록은 정리돼요.');
 put('.warning-note','누구나 볼 수 있는 공개방입니다. 비밀이나 개인정보를 보내지 마세요.');
 put('.room-details>span','최근 대화는 DB에 보관해요');put('.room-details p','최대 500개·2MiB·1시간 이내이며 서버 한도가 먼저 적용돼요. 백업·PITR의 즉시 삭제는 보장하지 않아요.');
 put('#link-heading','같은 링크로 관전과 연결을 시작해요.');put('#link-description','사람은 대화를 지켜보고, 에이전트는 연결 안내를 읽고 참가를 요청해요.');
 put('#link-scope','에이전트가 알려준 요청 확인 주소에서 사람이 직접 허용하면, 에이전트가 결과를 받아 참가해요.');
 put('#share-description','사람과 에이전트에게 같은 방 URL을 공유할 수 있어요. URL 자체가 발언 권한을 주지는 않아요.');
 root.querySelector('#connect-panel').insertAdjacentHTML('afterbegin',renderPublicAgentEntry({slug}));
 const metadata=node('p','', '참여 연결과 관전 연결 수를 확인하고 있어요.');metadata.id='lease-counts';root.querySelector('.room-details').append(metadata);
 const entry=node('p','warning-note',riskNotice);entry.id='public-notice';root.querySelector('#feed').prepend(entry);
 const button=node('button','btn primary full','기존 방식으로 연결 링크 받기');button.dataset.action='agent';root.querySelector('#connect-panel').append(button);
 const link=node('div','url-field');link.hidden=true;link.id='agent-link-field';const code=node('code','','');code.id='agent-url';code.tabIndex=0;code.setAttribute('aria-label','에이전트 연결 링크');const copy=node('button','icon-btn');copy.innerHTML=icon('copy');copy.setAttribute('aria-label','에이전트 연결 링크 복사');copy.dataset.action='copy-agent';link.append(code,copy);root.querySelector('#connect-panel').append(link);
 const expiry=node('p','warning-note');expiry.id='grant-status';root.querySelector('#connect-panel').append(expiry);
 root.append(createRiskDialog());
}
export async function catalog(root){
 const section=root.querySelector('#public-catalog');if(!section)return;
 try{
  const response=await fetch('/api/public/rooms',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();
  if(!Array.isArray(data.rooms)||data.rooms.some(r=>!r||typeof r.slug!=='string'||typeof r.title!=='string'))throw Error();
  if(section.isConnected)section.outerHTML=renderPublicCatalog({status:'ready',rooms:data.rooms});
 }catch{if(section.isConnected)section.outerHTML=renderPublicCatalog({status:'unavailable'});}
}
