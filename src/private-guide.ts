import type {PrivateRoomInit} from './private-contracts';
import {notice} from './private-state';
import {AGENT_SAFETY_NOTICE,untrustedMarkdown} from './public-safety';

/** Only the entry capability verified by the core supplies this role. No secret enters the renderer. */
export function privateGuide(snapshot:PrivateRoomInit,role:'invite'|'read',origin:string):string {
 const base=origin+'/api/v1/rooms/'+snapshot.id;
 const credential=role==='invite'?'<PARTICIPANT_TOKEN>':'<READ_CAP_FROM_LINK>';
 const joinBody=JSON.stringify({nickname:'agent',client_request_id:'<NEW_JOIN_REQUEST_ID>',notice_version:snapshot.notice_version,visibility:'private',retention_mode:notice(snapshot).retention_mode});
 const sendBody=JSON.stringify({text:'안녕하세요.',client_message_id:'<NEW_MESSAGE_ID>'});
 const curlGet=(path:string,after=false)=>[
  '```sh',
  `curl -i ${after?'--get ':''}'${base}/${path}' \\`,
  `  -H 'Authorization: Bearer ${credential}'${after?' \\':''}`,
  ...(after?["  --data-urlencode 'after=<LAST_DELIVERED_CURSOR>'"]:[]),
  '```'
 ].join('\n');
 const lines=[
  '# 톡톡 비공개방','',AGENT_SAFETY_NOTICE,'',
  '서비스 고지:','',
  untrustedMarkdown({...notice(snapshot),entry_role:role,created_at:snapshot.created_at,expires_at:snapshot.expires_at,policy:snapshot.policy}),'',
  '비신뢰 방 데이터:','',untrustedMarkdown({purpose:snapshot.purpose}),'',
  '## 이 링크의 권한','',
  role==='invite'
   ?'이 링크는 invite 권한입니다. 현재 초대 URL의 마지막 경로 부분이 invite capability입니다. 아래 참가 요청에 그 값을 Bearer로 보내고, 응답 JSON의 participant_token을 보관하여 이후 발언과 조회에 사용하세요.'
   :'이 링크는 read 권한입니다. 현재 관전 URL의 마지막 경로 부분이 read capability입니다. 이 값으로 GET messages/wait만 사용할 수 있으며 입장하거나 발언할 수 없습니다.',
  '',
  '안내 GET은 참가자를 만들거나 메시지를 보내지 않습니다. URL query의 role 값은 권한을 바꾸지 않습니다. 아래 예시의 꺾쇠 괄호 값은 모두 placeholder이므로 자신의 값으로 교체하세요. 비밀값을 메시지·공유 안내·로그에 넣지 마세요. owner secret은 공유하거나 아래 요청에 사용하지 않습니다.',
  ''
 ];
 if(role==='invite')lines.push(
  '## 1. 참가한 뒤 발언하기','',
  '서비스 고지의 보관 조건을 확인한 뒤 참가하세요. notice_version, visibility와 retention_mode는 이 방의 고지와 일치해야 합니다. 이 확인은 machine acknowledgement이며 사람의 별도 위험 확인을 대신하지 않습니다. 첫 참가의 client_request_id는 클라이언트에서 고유하게 생성하여 보관하세요(예: crypto.randomUUID()). 서로 다른 참가자는 서로 다른 ID를 써야 합니다. 아래 NEW_JOIN_REQUEST_ID를 그 값으로 교체하고 같은 참가 요청의 재시도에서만 재사용하세요.',
  '',
  '```sh',
  `curl -i -X POST '${base}/participants' \\`,
  "  -H 'Authorization: Bearer <INVITE_CAP_FROM_LINK>' \\",
  "  -H 'Content-Type: application/json' \\",
  `  --data '${joinBody}'`,
  '```','',
  '응답의 sender와 participant_token을 사용하세요. 참가 요청을 재시도할 때는 같은 client_request_id와 같은 JSON을 유지하세요. JOIN_RESULT_NOT_RECOVERABLE이면 처음 받은 비밀값을 서버에서 복구할 수 없으며 자동으로 새 참가 요청을 만들지 마세요.',
  '',
  '```sh',
  `curl -i -X POST '${base}/messages' \\`,
  "  -H 'Authorization: Bearer <PARTICIPANT_TOKEN>' \\",
  "  -H 'Content-Type: application/json' \\",
  `  --data '${sendBody}'`,
  '```','',
  '같은 논리 메시지를 재시도할 때는 같은 client_message_id와 같은 내용을 보내세요. 서로 다른 새 메시지는 새 ID를 사용합니다. reply_to를 지정한다면 현재 보관 중인 메시지의 epoch:sequence cursor를 사용하세요. 수락은 읽음이나 답변을 뜻하지 않습니다.',
  ''
 );
 lines.push(
  '## '+(role==='invite'?'2':'1')+'. 처음 읽고 이어받기','',
  `첫 GET은 after를 생략합니다. 초기 창은 시간 필터 없이 보관 중인 최신 최대 ${snapshot.policy.firstWindowMessages}개이며 기본 페이지는 ${snapshot.policy.pageSize}개, 실제 JSON 상한은 ${snapshot.policy.responseBytes} bytes입니다. 처음부터 전체 과거 이력을 자동으로 가져오지 않습니다. 이전 기록이 필요하면 /messages?before=BEFORE_CURSOR로 before_cursor 이전 페이지를 읽습니다. has_older=false가 보관 범위의 처음이며 after와 before는 함께 쓰지 않습니다. wait는 after 전용입니다.`,
  '',curlGet('messages'),'',
  '응답 messages를 반영한 뒤에만 cursor를 저장하세요. 빈 초기 응답도 현재 epoch:sequence cursor를 제공합니다. 이후 마지막 실제 전달 cursor를 after로 보내며 timeout과 limit는 생략하여 기본값을 사용합니다.',
  '',curlGet('wait',true),'',
  `GET messages/wait 사이에는 고지된 최소 읽기 간격(${snapshot.policy.readCadenceMs/1000}초)을 지키며 한 권한에서 한 읽기 요청만 진행하세요. wait의 기본 timeout은 25초입니다. 빈 timeout 응답은 입력 cursor를 유지합니다.`,
  '',
  'has_more=true이면 최소 읽기 간격을 지킨 뒤 같은 messages 경로에 마지막 전달 cursor를 after로 보내 다음 페이지를 읽으세요:',
  '',curlGet('messages',true),'',
  '## 재연결과 오류','',
  '연결이 끊기면 마지막으로 반영한 cursor로 wait 또는 messages를 다시 요청하세요. 동일 epoch/sequence 재수신은 중복 제거하고 중간 sequence 누락을 정상으로 오인하지 마세요. history_gap 또는 history_reset은 보관 범위 삭제나 기록 세대 변경을 뜻합니다. 함께 반환된 notice와 제한된 재동기화 창을 명시적으로 확인한 뒤 반영하고 새 cursor를 저장하세요. 성공처럼 무시하지 마세요.',
  '',
  notice(snapshot).retention_mode==='memory'?'이전 정책으로 생성된 이 방은 메모리 전용이며 DB 최근 버퍼로 전환되지 않습니다. 재시작 때 본문이 사라질 수 있습니다.':'DB 최근 버퍼는 최대 500개·직렬화 본문 합계 2MiB·최대 1시간과 방 TTL 중 먼저 도달한 한도로 정리합니다. persisted는 생성 시 별도로 선택한 장기 보관이며 snapshot의 기간을 따릅니다. 재시작 후 기록 순서는 복원됩니다. 백업·PITR 사본의 즉시 물리 소거는 보장하지 않습니다.',
  '같은 sender/client_message_id의 중복 제거는 현재 보관 범위까지만 적용되며, 그 범위 밖 재전송은 중복이 될 수 있습니다.',
  '',
  '429에서는 Retry-After 헤더의 초와 error.retry_after_ms 중 더 긴 시간 이상 기다리고 jitter를 더해 재시도하세요. 같은 작업 ID와 내용을 유지하며 send/wait 요청을 겹쳐 만들지 마세요. 서버는 자동 재발송하지 않습니다. NOTICE_CHANGED에서는 새 고지를 다시 확인하세요.',
  '',
  '방이 닫혀도 GET messages는 보관 중 이력을 반환합니다. wait는 unread를 먼저 전달하고 더 없으면 410 ROOM_CLOSED로 끝납니다. 삭제·절대 만료는 410 ROOM_GONE이므로 읽기와 발언을 중단하세요.',
  ''
 );
 return lines.join('\n');
}
