import {escapeHtml as E} from './auth-primitives.js';
import {renderNoticeDisclosure} from './notice-disclosure.js';
export const retentionPolicy='최근 메시지는 DB에 최대 500개·직렬화 본문 합계 2MiB·1시간 중 먼저 도달한 한도까지 보관해요. 서버 설정이나 방 만료가 더 짧으면 먼저 정리해요. 새 비공개방의 장기 보관은 권한이 있는 계정만 생성할 때 선택하며 기본은 꺼져 있어요. 장기 보관을 선택하면 실제 고지된 기간을 따라요. 활성 DB의 정리가 백업·PITR 사본의 즉시 물리 삭제를 뜻하지 않아요. 방 정보·참여자 별칭·권한 지문은 본문과 별도로 저장될 수 있어요.';
export const duration=seconds=>seconds%86400===0?seconds/86400+'일':seconds%3600===0?seconds/3600+'시간':seconds%60===0?seconds/60+'분':seconds+'초';
const unavailable=()=>({ready:false,text:'보관 조건을 확인할 수 없어요. 다시 확인해주세요.'});
export function policySummary(room){
 if(!room||!['recent_buffer','persisted','memory'].includes(room.retention_mode))return unavailable();
 if(room.retention_mode==='memory')return room.retention_seconds===null?{ready:true,text:'이전 정책 · 본문 메모리 보관 · 재시작 시 사라질 수 있어요.'}:unavailable();
 const s=room.retention_seconds??room.recent_buffer?.max_age_seconds;
 if(!Number.isFinite(s)||s<=0||(room.retention_mode==='persisted'&&!Number.isSafeInteger(s)))return unavailable();
 if(room.retention_mode==='persisted')return {ready:true,text:`선택한 본문 보관 · 최대 ${duration(s)} · 방 만료가 먼저 오면 읽을 수 없어요.`};
 const b=room.recent_buffer;
 if(!b||!Number.isSafeInteger(b.max_messages)||b.max_messages<1||b.max_messages>500||!Number.isSafeInteger(b.max_bytes)||b.max_bytes<1||b.max_bytes>2097152||s>3600)return unavailable();
 const bytes=b.max_bytes===2097152?'2MiB':b.max_bytes.toLocaleString('ko-KR')+' bytes';
 return {ready:true,text:`최근 대화 · 최대 ${b.max_messages}개·${bytes}·${duration(s)} 중 먼저 도달한 한도. 더 짧은 서버 설정·방 만료가 우선해요.`};
}
export function renderPolicySummary({room}={}){const p=policySummary(room);return `<p class="notice-helper" data-policy-summary data-policy-ready="${p.ready}">${E(p.text)}</p>`;}
export function renderRetentionDisclosure({id='retention-policy',room,title='대화 보관 안내',body,open=false}={}){
 const actual=room?policySummary(room):null;
 return renderNoticeDisclosure({id,title,open,version:room?.notice_version,body:[...(actual?[actual.text]:[]),...(body?[body]:room?[room.retention_mode==='memory'?'이전 방의 메모리 정책을 유지해요. 저장 방으로 자동 전환하지 않아요. 방 정보·참여자 별칭·권한 지문은 본문과 별도로 저장될 수 있어요.':'활성 DB의 정리가 백업·PITR 사본의 즉시 물리 삭제를 뜻하지 않아요. 방 정보·참여자 별칭·권한 지문은 본문과 별도로 저장될 수 있어요.']:[retentionPolicy])]});
}
