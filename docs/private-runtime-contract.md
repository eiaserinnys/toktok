# 비공개방 공통 런타임 통합 계약

2026-10-03 root 결정. 이 문서는 구현 입력이며 구현·배포 완료 보고가 아니다. 기존 private의 무조건 본문 SQL 저장은 새 방 생성 경로에서 사용하지 않는다. 실제 운영 배포 전이므로 기존 로컬 WIP DB를 자동 변환하거나 삭제하지 않는다.

## 소유와 공통 코드

- A: control scope의 생성 권한·확인 증표·IP 생성 제한·활성 방 예약·설정 snapshot·예산 예약.
- B: `private-contracts.ts`, `private-core.ts`, thin CF `PrivateRoom` wrapper, Node private room registry와 해당 targeted tests. 기존 `room.ts`는 수정하지 않는다.
- C: 동일 shared 화면의 새 방/입장 고지와 memory cursor/이력 소실 표시. 제품/QA fixture가 같은 renderer를 사용한다.
- root: HTTP dispatch, binding, runtime 주입, 공통 보안 wrapper, 전체 연결 검증. 새 private는 `PRIVATE_ROOMS`, 새 Repository control은 `CONTROL` namespace로 연결한다. 과거 `ROOMS`/`IdentityRegistry` fixture는 새 코드의 운영 데이터 이주로 간주하지 않는다.

## 생성 확인과 HTTP 계약

기존 `POST /api/v1/rooms` 경로를 사용한다. 새 입력은 `{purpose, ttl_seconds?, persist?, retention_seconds?, client_request_id, creation_grant?}`다. `purpose`는 비신뢰 표시 데이터다. visibility는 서버가 `private`로 고정하며 mode, entitlement, creator id, owner acknowledgement를 요청에서 신뢰하지 않는다.

생성 권한은 다음 중 하나다.

1. 승인된 agent Bearer credential: A가 매 생성 시 계정/agent 상태와 소유자의 현재 `toktok-risk-v1` 확인을 검증한다. 에이전트가 제출한 체크를 사람 확인으로 기록하지 않는다.
2. 브라우저 사람 세션: exact Origin + session CSRF와 현재 화면의 명시 확인을 거친 단기 creation grant를 사용한다. 새 확인 시 opaque account/version/time을 저장한다.
3. 익명: 같은 브라우저의 creation context cookie/nonce + exact Origin으로 확인 화면을 거친 단기 grant를 사용한다. 익명 확인은 검증된 사람 신원이 아니라 안내 확인 선언임을 기록한다. 이메일/계정을 만들지 않으며 persist는 무조건 거부한다.

브라우저용 `POST /api/private/create-context`는 서버 생성 43자 nonce, `__Host-toktok_create` HttpOnly/Secure/SameSite=Lax/Path=/ cookie, 10분 절대 만료를 결합한다. 서버에는 지문만 기록한다. 이어 `POST /api/private/create-grants`의 `{nonce, risk_ack:true, risk_ack_version:'toktok-risk-v1'}`를 검증하고 5분 만료의 1회 grant를 반환한다. 세션이 있으면 CSRF도 필요하다. grant는 확인 당시 계정/익명 주체·cookie context·IP HMAC·버전에 결합하며 평문은 반환 1회뿐이다. 이메일/초대 가입과 무관하다. client JSON에 role을 넣어도 권한이 생기지 않는다.

grant는 브라우저 또는 사용자가 전달한 agent의 정상 HTTP 생성 호출에 사용할 수 있다. machine 사용에서는 동일 IP를 강제하지 않는다. 발급 IP와 요청 IP에 대한 생성/남용 한도를 모두 검사하고, grant를 넘기는 행위가 권한 위임임을 UI/guide에 고지한다. grant 없는 자동화에는 고정된 `OPERATOR_ACK_REQUIRED` 오류와 확인 경로를 제공하며 Cloudflare challenge나 UA 위장으로 해결하지 않는다.

`client_request_id`는 1~128자이며 주체+요청 내용 digest에 묶는다. 동일 ID/다른 입력은 409다. 원문 capability는 DB·audit에 보관하지 않는다. 최초 성공에만 invite/read URL과 owner_token을 반환한다. 같은 요청이 이미 생성됐지만 최초 응답을 잃었다면 새 방을 만들거나 token을 바꾸지 않고 `409 CREATE_RESULT_NOT_RECOVERABLE`과 room_id를 반환한다. pending 초기화는 `409 CREATE_PENDING`/Retry-After로 구분한다. UI/guide는 관리자 키와 최초 결과를 잃으면 복구할 수 없고 방은 원래 TTL까지 남을 수 있음을 미리 고지한다. 사용자가 명시적으로 새 생성 시도를 시작하기 전 자동으로 새 client_request_id를 만들지 않는다. dedupe는 방의 절대 만료까지 유지한다. **평문 secret의 재현을 위해 DB에 저장하지 않으며**, 중간 실패를 성공 응답으로 꾸미지 않는다.

## 전역 생성 예약과 장애

control transaction은 enabled/readiness, principal, persist 권한, TTL, IP별 시간 생성/활성 수, 전체 활성 수/일 생성, private_creates 예산을 모두 검사한다. 예약 상태는 `pending → active → closed|expired|failed`다. unknown 초기화 결과는 활성 slot을 계속 점유하며 무조건 반환하지 않는다. room id와 absolute expiry를 최초 예약에 고정한다. 재시도는 같은 id/snapshot을 사용한다.

방 initialize는 idempotent이고 동일 id에 다른 snapshot은 거부한다. room initialization 확인 후 control은 active로 전환한다. 명확히 초기화되지 않은 pending은 bounded reconciliation으로 확인한 뒤만 실패 처리한다. 종료는 방 상태가 먼저 closed/삭제됨을 확인한 뒤 control slot을 반환한다. control에서 slot만 줄이고 아직 방에 쓰기 가능한 상태를 남겨서는 안 된다. expiry는 두 곳 모두 같은 절대시각으로 접근을 차단하고 control은 재시작 후에도 만료 예약을 정리한다. 일반 설정 PUT의 mode 변경은 신뢰 가능한 실제 활성/pending 수가 0일 때만 허용한다.

## 방 snapshot 및 최소 영속 데이터

`PrivateRoomInit`는 trusted 값만 받는다: id, opaque creator id, created_at/expires_at, purpose, invite/read/owner token hash, settings revision, mode, visibility=`private`, persist, retention_seconds 또는 null, notice_version, creator_ack의 종류/version/time, private policy snapshot. raw email/IP/token/body를 control audit에 기록하지 않는다.

metadata·참여자 ID/별칭·capability 지문은 저장될 수 있음을 고지한다. 본문 비저장은 모든 사용자 작성 데이터가 사라진다는 뜻이 아니다. public body와 private memory body는 Repository에 전달하지 않는다. 저장 private만 같은 `room:<id>` transaction의 `private_rooms` persist snapshot을 검증한 뒤 `private_messages`를 쓴다. 기존 metadata의 persist 값을 바꾸는 API는 없다.

## cursor와 본문 retention

새 private 응답은 `{service, room, permissions}` 및 `{service, messages, epoch, cursor, earliest_cursor, history_status, has_more, room_status}` 계약을 사용한다. cursor는 `<uuid epoch>:<monotonic sequence>`이며 timestamp를 cursor로 사용하지 않는다. message에는 기존 sequence/sender/text/client_message_id/reply_to/created_at와 cursor를 제공한다.

- memory: core 생성 때 새 epoch, 최근 최대 100개·최대 1시간 ring. eviction/restart 후 body와 해당 idempotency 자료가 소실되고 `history_reset`을 명시한다.
- persist: epoch/다음 sequence는 metadata에 유지하고 본문은 생성 때 선택한 retention 이내만 저장한다. 재시작 뒤 유효 본문을 다시 읽을 수 있다. 본문 삭제 뒤에도 sequence를 1로 되돌리지 않는다.
- cursor 없음: 최근 5분 중 최대 20개를 기본 첫 창으로 제공한다. 이후에는 cursor 이후만 페이지로 읽는다. 관리자가 더 작게 설정할 수 있다.
- 같은 epoch에서 보관 시작 이전 cursor는 `history_gap`; 다른 epoch는 `history_reset`과 bounded 첫 창을 반환한다. 미래 sequence/잘못된 형식은 400이다.
- 응답 page count/실제 JSON UTF-8 bytes를 동시에 제한한다. `has_more`이면 마지막 **반영한** cursor로 계속한다. 화면은 gap/reset을 고지하며 이전 내용을 새 epoch 메시지로 오인하지 않는다.
- 동일 sender/client_message_id 재시도는 현재 보관 중 원문이 같을 때만 같은 응답, 다르면 409다. memory restart나 body retention을 넘는 중복 제거는 보장하지 않는다. guide에 명시한다. reply_to는 현재 보관 중인 동일 epoch 메시지만 허용한다.

persist retention 삭제는 요청 시 읽기 차단을 먼저 보장하고 bounded maintenance로 실제 row 삭제를 수행한다. DB/PITR/백업의 즉시 물리 소거는 주장하지 않는다. 만료는 삭제 스케줄 지연과 무관하게 매 요청/대기 반환 직전에 검사한다.

## 참여·읽기와 제한

invite/read/owner/participant 권한을 분리한다. owner는 공유 링크나 일반 DOM에 넣지 않는다. invite GET은 참가자를 만들지 않는다. 참가 POST는 `{nickname, client_request_id, notice_version, visibility:'private', retention_mode:'memory'|'persisted'}`의 정확한 생성 snapshot acknowledgement를 요구한다. 이는 machine acknowledgement이며 사람 동의를 대신하지 않는다. 서버 응답/entry guide에 실제 보관기간과 링크 소지자 접근/no E2EE를 항상 노출한다. 잘못된 고지 버전/저장 모드는 409 NOTICE_CHANGED로 최신 snapshot을 제공한다.

private 정책도 DB 설정에서 생성 snapshot으로 전달한다. 초기 안전값은 memory 100개/1시간, 본문 16KiB, participant 최대 64, sender 30/분·room 120/분, 최대 persisted body 10,000개, page 20개/응답 64KiB, 동시 wait 32개·capability별 1개·wait 25초, 최소 read cadence 2초다. 기존 private의 본문 16KiB 상한은 유지하되 실제 JSON envelope 64KiB를 넘는 단일 메시지는 수락 전 413으로 거부한다. 모든 제한은 조절 가능한 product schema에 넣고 안전 상한을 초과하지 않는다.

longpoll은 DB transaction/room mutation queue 밖에서 대기한다. 새 메시지 판정과 waiter 등록 사이 유실을 막는다. abort/timeout/close/shutdown은 timer/listener/waiter를 회수한다. cap 하나로 병렬 wait/read를 만들어 한도를 우회하지 못한다. 공통 core를 CF actor와 Node 단일 소유 room registry가 호출한다. Node/Postgres multi-app은 이번 지원 범위가 아니다.

2026-10-03 추가 안전 경계: PrivateRoomCore가 방별 전체 handler와 body 읽기 동시성을 직접 제한한다. 기본 handler 64개(코드 상한 160), body-inflight 8개(코드 상한 16)이며 대기 요청도 handler 수에 포함한다. `waits <= handlers`, `bodyInflight <= handlers`를 설정 관계로 검증하고 body 파싱 전에 메모리 slot을 확보한다. 초과는 429와 Retry-After, 종료·취소·실패는 finally에서 slot을 반환한다. 이는 실제 네트워크 연결 수나 전송 완료 후 버퍼 전체를 세는 보장이 아니다. root의 외부 요청 제한은 이 core 제한을 대신하지 않는다.

두 mode 모두 `defaultPersist=false`는 안전 불변조건이다. 설정 UI에서 true를 입력할 수 있게 남겨 두지 않으며 생성 요청의 persist 생략은 OFF다. 저장은 자격이 있는 주체가 새 방에서 명시적으로 선택한 경우에만 허용한다.

## 예산과 합격 기준

root admission은 expensive work 전에 admission_requests를, 응답 직전에 실제 body bytes를, DB 본문 쓰기 전에 persistent_write_bytes를 원자 예약한다. 예약 실패 시 새 작업을 수행하지 않는다. 이미 예약했으나 취소/실패한 비용은 환불하지 않아 실제 수행량이 집계를 넘지 않게 한다. longpoll/활성 actor duration은 bounded active_room_seconds grant로 선예약하며 초기화/재시작에서 재사용·중복 소유되지 않게 한다. 정밀한 실제 Cloudflare 청구를 이 카운터로 보장하지 않는다.

필수 targeted gate: anonymous persist 거부, invited entitlement+checkbox 승인 후 새 persist만 허용, 기존 memory 변경 거부, 같은 snapshot 재초기화/다른 snapshot 거부, memory SQLite/PG body 검색 0, 재시작 memory epoch reset/저장 이력 유지, TTL/retention 경계, concurrent sequence/dedupe, page count/bytes와 explicit gap, notice mismatch, owner secrecy, 취소/종료 wait 회수, budget 거부 전 body SQL 0. HTTP 두 client 왕복과 390/1440 동일 화면 표시를 최종 통합에서 확인한다.
