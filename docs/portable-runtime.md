# Portable runtime 연결 계약

Cloudflare를 유지하면서 public/private core와 저장 adapter를 플랫폼에서 분리했습니다. 제품 router, ControlPlane namespace와 권한·예산·설정 주입은 root 통합 단계입니다.

## 공통 포트

`src/storage/repository.ts`가 유일한 정본입니다. `transaction<T>(scope, fn: (tx) => Promise<T>): Promise<T>` 안에서 `get/put/delete/list`는 모두 await 가능한 targeted CRUD입니다. `control`은 settings/account/OTP/invite/budget의 원자 범위이고 `room:<id>`는 private metadata와 선택 persist body입니다. callback은 tx와 순수 계산만 사용하며 외부 HTTP/메일/longpoll은 금지합니다. nested transaction과 10초 이후 callback 접근은 거절합니다.

transaction의 누적 접근 한도는 4096 records/8MiB이며 단일 JSON record 64KiB, list 최대1000입니다. DB 전체 크기나 scope의 전체 행 수를 이 값으로 제한하지 않습니다. JSON 검증·clone, scope/collection allowlist와 parameterized SQL을 사용합니다. callback의 domain 403/409/429는 rollback 후 보존하며 driver 원문 오류는 고정 코드로 가립니다.

- `src/storage/sqlite.ts`: Node24 DatabaseSync, BEGIN IMMEDIATE와 로컬 직렬 mutex, WAL/foreign keys/busy timeout, await 전에 cursor 소비입니다.
- `src/storage/postgres.ts`: 선택 시만 pg 초기화, 같은 DB/schema session advisory owner lock, 각 transaction의 같은 client와 scope advisory xact lock입니다. owner 연결 상실은 readiness를 닫고 자동 재연결하지 않습니다.
- `src/storage/cloudflare.ts`: 좁은 structural SQL/storage port, storage.transaction(async closure)와 즉시 toArray입니다. 직접 BEGIN을 보내지 않습니다. runtime 생성 내부 테이블 중 exact `__cf_kv`, `_cf_METADATA`만 제외합니다. 임의 prefix나 사용자 테이블은 허용하지 않습니다. 기존 IdentityRegistry SQL은 자동 이주하지 않으며 새 namespace가 필요합니다. nodejs_als compatibility는 root 실제 config 연결 사항입니다.

## Public core와 policy

`PublicRoomCore({origin,catalog,policy,clock?,budget?})`는 cloudflare:workers를 import하지 않습니다. CF `PublicRoom`은 얇은 wrapper이고 Node PublicRooms가 같은 core를 보유합니다. configure(revision, policy, catalogue)는 trusted server 호출만 허용합니다. disabled slug는 신규 입장을 막고 기존 lease는 drain합니다. production catalogue/settings 공급은 root DB revision 연결이며 코드 기본값은 seed입니다.

firstWindowMs<=300000/firstWindowMessages<=20, responseBytes=65536, byteBurst>=responseBytes, waits<=handlers, responseBurst>=1, batchMs=2000..10000<=waitMs를 강제합니다. 최종 service safety envelope를 포함한 JSON을 byte cap에 넣고 한 항목도 안 들어가면 수락 전 413 또는 POLICY_BOUNDS로 닫습니다. 빈 has_more 페이지를 반복하지 않습니다. publicGuide와 adapter/core guide는 같은 trusted policy 값을 표시하고 비신뢰 title은 분리된 escaped 데이터입니다. 기존 기본값과 30초/strict5/sec/cursor 계약은 유지합니다.

## Private core와 snapshot

`src/private-contracts.ts`의 PrivateRoomInit/PrivateCreatorAck/PrivateBudgetPort가 A/C의 exact import 정본입니다. initialize는 trusted DB 권한 검증 후 전달되는 immutable snapshot입니다. 같은 snapshot 재시도는 idempotent이며 다른 snapshot은409입니다. public/anonymous private는 memory only, 유효 entitlement 계정의 새 private opt-in만 persist입니다. A가 권한/global admission을 검증하며 core의 snapshot 타입을 클라이언트 권한 확인으로 대체하지 않습니다.

memory 본문은 ring만 쓰고 private_messages 행은0입니다. metadata에는 cap hash/참여 principal 및 생성 조건을 둡니다. persist만 같은 room transaction의 metadata guard를 통과하여 body/dedupe/sequence를 저장합니다. 새 memory instance는 새 epoch, persist 재시작은 epoch/sequence를 유지합니다. 최초5분/20개, delta/gap/reset, byte-prefix cursor/has_more와 보관 범위 idempotency는 공통 page 계약입니다. 16KiB 본문도 실제 JSON envelope가64KiB에 들어가는지 수락 전에 확인합니다. 참여 secret/생성 결과는 DB에서 복구하지 않습니다.

handlers 기본64/상한160, bodyInflight 기본8/상한16, waits32/cap1입니다. waits와 bodyInflight는 handlers를 넘지 않습니다. 본문 parsing 전에 RAM slot을 얻고 finally/abort/shutdown에 반환합니다. 중복 wait를 거절한 요청은 원래 wait 소유권을 해제하지 않습니다. Node registry timer는 bounded maintenance/absolute expiry용이며 root startup overdue 목록 연결은 후속입니다. 읽기 노출은 만료 시각부터 즉시 금지하되 physical row 정리는100행씩 bounded로 수행합니다. 백업/PITR 잔존까지 즉시 삭제됐다고 주장하지 않습니다.

## 예산 예약 소유 경계

core가 normal admission_requests, 최종 직렬화 response_bytes, persist DB 본문 쓰기 직전 persistent_write_bytes를 각각 소유합니다. root는 같은 경계에 이중 예약하지 않습니다. 하나의 요청 context에서 각 kind마다 서버가 발급한 별도 ID를 한번 만들며 개별 reservation 재시도는 같은 ID입니다. 문자열 suffix로 ID를 만들지 않습니다. host는 A newBudgetOperation helper를 budget.newOperationId로 주입합니다. reserve 성공은 예약 완료이며 domain 오류를 그대로 전파합니다. 204/0byte 응답은 amount>0 예약을 생략합니다.

각 instance RAM funded_until은0에서 시작하며 normal admission 전에 now+30초를 덮도록 active_room_seconds 60초 block을 선예약합니다. 동시 funding Promise를 공유하고 request가 있을 때만 갱신합니다. 재시작 때 옛 grant를 쓰지 않으며 유휴 자동 충전 timer는 없습니다. funding 실패는 새 send/wait를 닫되 이미 대기하는 작업은 최대25초 이내 회수합니다. 예약시각 UTC 귀속이며 실제 CF 청구 duration 계측은 아닙니다.

owner close/delete/shutdown/정리와 고정 오류 경로는 bounded cleanup headroom입니다. static catalogue/guide·잘못된 외부 request의 Worker 비용과 CONTROL 조회/예약 호출 비용도 root 전체 예산에 필요합니다. core의 local budget 포트가 edge 무한 호출을 차단하거나 billing hard cap을 보장하지 않습니다.

CF wrapper의 세 번째 constructor dependencies.budgetFactory는 root CONTROL→HTTP JSON-safe adapter 주입 접점입니다. 함수 객체는 Wrangler binding이 아닙니다. 미설정503이며 테스트 TEST_BUDGET/mock strict port를 실제 CONTROL enforcement 증거로 쓰지 않습니다.

## Node host 연결

createServer({origin,handler,repo,close,trustedProxyCidrs?})는 Fetch Request/Response bridge입니다. 기본 trusted IP는 socket peer이며 forwarding/CF-Connecting-IP는 믿지 않습니다. 명시 신뢰 CIDR에서만 XFF 체인을 사용합니다. 외부 internal hash header는 지우고 서버 hash로 바꿉니다. disconnect는 AbortController로 전달하며 전송 backpressure를 처리합니다. 논리 lease/handler를 실제 TCP 수라고 표현하지 않습니다.

복수 Set-Cookie는 getSetCookie() 배열로 전달하고 다른 header 및 QA CSP는 유지합니다. /health는 생존, /ready는 repo owner와 종료 상태이며 비밀을 출력하지 않습니다. createApplication의 router/hostClose가 root auth/private/security wrapper 주입 접점입니다. 종료 시 신규 요청을 닫고 private registry도 hostClose에서 shutdown해야 합니다.

## 호출·저장 축의 커버와 제외

공통 room 엔진 호출 표면은 CF PublicRoom, Node PublicRooms, CF PrivateRoom, Node PrivateRooms 네 곳이며 각각 같은 public/private core를 사용합니다. body 저장 축은 public RAM-only, private memory RAM-only, private opted-in persist repository 세 가지로 나눴습니다. repository 구현 축은 CF DO SQLite/Node SQLite/Node PG 모두 targeted transaction이며 startup은 하나만 선택합니다. slot/seq/idempotency/cursor API는 core가 소유하고 CF alarm과 Node timer만 플랫폼별입니다.

기존 src/room.ts는 root legacy 호환 경계이므로 이번 분리에서 제외했습니다. src/index.ts/contracts.ts/http.ts와 production wrangler/public UI/control/auth는 다른 세션 소유로 수정하지 않았습니다. 실제 HTTP 권한·global room 슬롯·CONTROL budget 연결은 root/A가 담당합니다. 오래된 public load의 호출 표면은 이후 최종 통합 CI에서 확인하며 이 작업에서 다시 실행하지 않았습니다.


## Private CF 재시작 식별자

trusted `inspect(id?:string)`와 `maintenance(id?:string)`는 서버가 제공한 방 ID로 core를 결합하며 ID 없이는 scope를 만들지 않습니다. CF wrapper는 exact KV `toktok_private_room_id`에 비밀 없는 ID만 저장하고 constructor의 blockConcurrencyWhile에서 복원합니다. initialize는 repository schema 준비 후 기존 ID 일치를 확인·보존하고 실제 core snapshot 초기화 성공 후 alarm을 잡습니다. alarm과 schedule은 복원된 ID를 명시 전달합니다. ID만 존재하는 부분 실패는 성공한 room/slot/body 상태가 아니며 inspect의 실제 snapshot을 확인해야 합니다. 공개 DO에는 이 KV 경로가 없습니다.

CF schema 검사는 문서상 `__cf_kv`, alarm의 `_cf_METADATA`와 로컬 SQLite 런타임 mock KV에서 직접 관측한 `_cf_KV`만 제외합니다. 사용자 테이블이나 임의 내부 prefix는 허용하지 않습니다. Node/PG schema 판단은 별도이며 이 제외 목록을 상속하지 않습니다.


## Node 공개 registry 회수 경계

`PublicRooms.has(slug)`는 기존 core 존재 여부만 확인하며 새 방을 만들지 않습니다. 설정 변경과 room 진입에서 비활성 slug를 prune하고 모든 lease/pending grant/handler/wait가0일 때 shutdown·삭제합니다. 활성 기존 방은 자연 drain하며 전체 core100에서는 새 core 생성만429로 거절합니다. 별도 polling/keepalive timer는 없습니다. 운영 catalog10은 root 설정 상한이며 registry100은 rename 중 이전 활성 core까지 합친 코드 불변상한입니다. CF는 같은 Node Map을 사용하지 않으며 catalog 설정 권한과 전역 funded duration 예산으로 비용을 제한해야 합니다.
