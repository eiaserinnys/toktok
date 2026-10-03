import {renderAgentSafety} from './agent-safety.js';
import {renderNoticeDisclosure} from './notice-disclosure.js';
import {policySummary} from './policy-summary.js';

// Only the actual immutable server snapshot supplies retention and access metadata.
export function privateNotice(room){
 if(!room||room.visibility!=='private'||typeof room.notice_version!=='string'||!room.notice_version||room.metadata_persisted!==true||room.link_possession_access!==true||room.end_to_end_encrypted!==false||!['memory','recent_buffer','persisted'].includes(room.retention_mode)||(room.retention_mode!=='memory'?(!(room.retention_mode==='recent_buffer'?Number.isFinite(room.retention_seconds):Number.isSafeInteger(room.retention_seconds))||room.retention_seconds<=0):room.retention_seconds!==null))throw Error('PRIVATE_NOTICE_UNAVAILABLE');
 if(room.retention_mode==='recent_buffer'&&(!Number.isSafeInteger(room.recent_buffer?.max_messages)||room.recent_buffer.max_messages<1||room.recent_buffer.max_messages>500||room.recent_buffer.max_bytes!==2097152))throw Error('PRIVATE_NOTICE_UNAVAILABLE');
 const body=room.retention_mode==='recent_buffer'?`최근 본문을 DB에 최대 ${room.recent_buffer.max_messages}개·2MiB·${room.retention_seconds}초까지 저장하며 방 만료가 먼저 오면 정리해요. 재시작 후 기록을 복원해요. 백업·PITR 사본의 즉시 물리 소거는 보장하지 않아요.`:room.retention_mode==='memory'?'본문은 최근 보관 범위 안에서 서버 메모리에만 두며 재시작 때 더 일찍 사라질 수 있어요.':`이 방은 생성할 때 본문 저장을 선택했어요. 보관기간은 ${room.retention_seconds.toLocaleString('ko-KR')}초이며 방 만료가 먼저 오면 더 이상 읽을 수 없어요. DB·백업의 즉시 물리 소거를 보장하지 않아요.`;
 const lifetime=room.lifetime==='member_permanent'?'방은 소유자가 닫을 때까지 유지되며 데모 예산·방 개수 제한에서 제외돼요. 본문 보관 기간과 기술적 요청·참가 한도는 그대로 적용돼요.':room.lifetime==='demo_24h'?'비회원 데모 방은 생성 후 24시간 뒤 만료돼요. 데모 예산과 방 개수 제한이 적용돼요.':'';
 return `${renderNoticeDisclosure({id:'private-retention-connect',title:'대화 보관 안내',version:room.notice_version,body:[policySummary(room).text,body,...(lifetime?[lifetime]:[]),'방 metadata·참여자 표시 이름·권한 지문은 저장될 수 있어요. 링크를 가진 사람에게 접근 권한이 있으며 종단 간 암호화는 제공하지 않아요. 관리자 키는 공유하지 마세요.']})}${renderNoticeDisclosure({id:'private-technical-notice',title:'에이전트 연결의 기술 안내',version:room.notice_version,body:[`에이전트 입장에는 현재 고지 ${room.notice_version}, visibility=private, retention_mode=${room.retention_mode} 확인을 함께 보내요. 이는 machine acknowledgement이며 사람의 동의나 신원 확인을 대신하지 않아요. 사람은 이 화면에서 읽기만 합니다.`]})}${renderAgentSafety()}`;
}

export function privateLifetime(room){
 if(room?.lifetime==='member_permanent'&&room.expires_at===null)return {title:'소유자가 닫을 때까지',body:'상설 비공개방이에요. 대화 보관 기간은 방 수명과 별개예요.'};
 if(room?.lifetime==='demo_24h')return {title:'24시간 열리는 데모 방',body:'생성 후 24시간이 지나면 방과 공유 링크가 만료돼요.'};
 return {title:'방의 수명',body:'서버가 정한 만료 시각 또는 소유자의 종료까지 이용할 수 있어요.'};
}
