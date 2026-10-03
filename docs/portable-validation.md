# Portable 기반 검증과 인계

기존 B managed WT feat/public-memory-rooms에서 shared memory core, async targeted RepositoryPort/세 adapter, private memory·opt-in persist와 Node24 installer 기반을 구현했습니다. 기존100+50 부하/비용 gate를 반복하지 않았으며 실제 서비스 통합/배포/메일/사용자 DB 변경은 없습니다. draft PR #3의 기반 구현입니다.

## 실행 경계

모든 heavy 작업은 공유 heavy_verify runner, 전용 TMPDIR, foreground 회수, worker1입니다. 새 격리 PG container/volume만 생성·회수했습니다. 호스트 Node22는 그대로이며 공식 Node24.21.0 다운로드 checksum과 이미지 digest를 확인했습니다. managed 새 WT 생성은 lock timeout으로 실패하여 root 승인대로 기존 B WT를 사용했습니다. lock 삭제/우회는 하지 않았고 root 복구 후에도 기존 WT를 유지합니다.

## 실제 통과 결과

| 신규 targeted 범위 | 결과/핵심 관측 |
| :-- | :-- |
| SQLite targeted transaction+public shared core | 3 PASS, rollback/CAS/private guard/누적 접근 제한, 메모리 public 계약 |
| Node HTTP/IP/SMTP mock | 3 PASS, socket peer 기본/forwarded opt-in/불확실 메일 재시도 없음 |
| PG owner/atomic race | 1 PASS, 2연결 경합 winner1, 동일schema 두번째owner 거절, 무관schema 보존/연결상실 failclosed |
| CF targeted record와 shared public | record1 PASS, selected public/domain2 PASS, abort 후 wait/handler0/공개 storage0 |
| callback domain 오류 | SQLite/PG2 PASS 및 CF domain 포함,403/409/429 rollback+원래 code/status |
| installer/consistent backup | 보정 후1 PASS, explicit apply/SQLite-without-PG/두번째owner 거절/backup integrity ok |
| public bounds/envelope | 1 PASS, policy 불변 관계/escaped page8457bytes/실제cursor 전진 |
| cookies+funding | 2 PASS, Set-Cookie2개/CSP보존/funding 공유·재시작0, fixture enforcement 한정 |
| dynamic policy guide | 1 PASS, tightened snapshot에서 adapter/core 안내 일치 |
| private SQLite memory/persist | 2 PASS, memory DB body0/new epoch, persist restart·retention gap·TTL410·쓰기 예산 거절 body0 |
| private byte page | 보정 후1 PASS, actual JSON54912bytes/부분페이지 cursor/abort·shutdown wait0 |
| private ownership/admission | 2 PASS, 중복wait409가 기존소유권 유지/handlers·body slots finally0 |
| private shutdown body parser | 1 PASS, status499/bodyInflight0/handler0 |
| strict kind/amount budget fixture | 1 PASS, 고유17IDs/4kinds, initialize/read/post/persist write/0bytes skip |
| CF private alarm/schema | root 추가 허용 selected1 PASS, exact _cf_METADATA/memory rows0+reset/persist bodyrows1+복원 |
| CF native SQL row 계측 | 1 PASS, 대표 reserve6read/4write, cleanup8read/1write, 실제 A 전체장부 아님 |
| private Node HTTP | 1 PASS, 2클라이언트3페이지, shutdown3011ms/wait0/handler0/timer0 |
| private PG restart | 1 PASS, memory body0/history_reset, persist body1/history ok, fixture 회수exit0 |
| 최종 Node24 Docker 기반 | build PASS, actual container1 PASS, nonroot/PGdriver 불필요/두번째owner 거절/stop737ms |
| CF 분리 타입 검사 | 최초2개fixture 타입 실패 후 한 보정 exit0 |

PASS 개수는 별개의 selected 실행 결과이며 전체 suite 단일 통과를 뜻하지 않습니다. TEST_BUDGET과 strict fixture는 no-op 또는 A ID conflict 의미를 모사한 테스트 포트입니다. 실제 CONTROL HTTP budget enforcement는 root 연결 후 검증해야 합니다. CF restart 검증은 실제 SQLite를 공유한 새 core instance이며 실제 DO eviction/hibernation을 재현했다고 쓰지 않습니다. actual128MB heap/운영 CPU/생산 성능은 미측정입니다.

## 실패와 실행 상한

RED는 미구현 source로 실패를 확인했습니다. PG 최초 harness 회수 timeout 후 한 보정은 PASS입니다. installer 최초 foreground/flock 종료·backup 순서 실패를 no-fork flock 및 정상 종료 뒤 backup으로 보정하여 한 실행 PASS입니다. CF abort 첫 실패는 AbortError와499 transport 차이를 구분하고 body 회수하여 selected 보정 PASS입니다. private byte 첫 실패는 기존 public32KiB body 정책 전달 실수였으며 narrow body policy로 private64KiB를 적용한 selected 보정 PASS입니다.

CF private 최초/보정 두 실패는 alarm이 실제 _cf_METADATA를 생성하여 schema check가 닫힌 원인이었습니다. 기존 실행 상한에 도달하여 중단·보고한 뒤 root가 exact 내부테이블 보정+추가selected1회를 허용했습니다. 사용자테이블/임의prefix는 여전히 허용하지 않고 Node/PG는 변경하지 않았습니다. 그 추가 한 번이 PASS입니다.

Node 타입 검사는 초기 기반에서는 exit0였지만 최종 확장 검사에서 fixture 오류4곳이 나왔습니다. 기존 허용한 보정1회 후 새 PG private fixture의 TS7022(rows 추론)1곳만 남았고 rows:number로 수정했습니다. **이 마지막 수정 후 Node tsc는 실행 상한상 재실행하지 않아 미확인입니다.** root 최종 통합 타입 검사에서 확인해야 합니다. strict/ts-ignore/any 또는 설정 완화로 숨기지 않았습니다. 분리 CF tsc는 exact fixture Env/JSON-safe 반환 타입 보정 후 exit0입니다.

## 재현용 명령

아래는 기록이며 이 문서 때문에 통과 gate를 다시 실행하지 않습니다. Node24는 별도 내려받은 실행 파일로 호출하고 모든 명령은 heavy runner 안에서 수행했습니다.

```sh
node24 --import ./selfhost/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 --test-timeout=60000 test/selfhost-private-node.test.ts test/selfhost-private-postgres.test.ts
node24 --import ./selfhost/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern 'private shutdown cancels' test/selfhost-private.test.ts
node24 ./selfhost/node_modules/typescript/bin/tsc --noEmit -p selfhost/tsconfig.json
pnpm exec tsc --noEmit -p selfhost/tsconfig.cloudflare.json
pnpm exec vitest run --config test/selfhost.vitest.config.ts --testNamePattern 'CF private runtime' --reporter=verbose
docker build -f selfhost/Dockerfile -t toktok-portable-fixture:249424e1 .
node24 --import ./selfhost/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 --test-timeout=60000 test/selfhost-container.test.ts
```

## 정적 검수와 남은 연결

독립 읽기 전용 검수는 중복 read/wait의 소유권 해제 P1을 발견했습니다. 실제 소유 획득 여부로 finally를 제한하고 두 번409 뒤 원래 wait/abort0을 targeted 확인했습니다. 이후 예산ID/0byte, bodyshutdown, exactCFmetadata, cookies/CSP, 동적guide/bounds delta 재검수는 새 반려 사유 없이 통과했습니다. 검수자가 테스트/빌드를 대신 실행하지 않았습니다.

root/A는 CONTROL HTTP budget factory와 새 ControlPlane namespace, settings revision 공급, auth/creator entitlement/global slots, root router/private bindings, Node startup overdue scan/hostClose, QA 전용 security wrapper를 연결해야 합니다. SMTP 실제 provider/template/secret과 숨김TTY 설치 도우미는 미완료입니다. selfhost CLI ready/catalogue 성공만으로 전체 DEMO/HOSTED/OTP/admin 지원 완료라고 보고하지 않습니다.

새 atomic 장부 SQL 비용은 [비용 보완](public-cost-comparison.md)에 root 실제 A reserve/cleanup 계측을 반영했습니다. private rows/storage/alarms와 계정baseline은 일부 계획 가정이며 아직 native 전체 측정이 아닙니다. $34.26/$40/$100은 현재 전체제품 검증 가격/청구 hard cap이 아닙니다. 이전 비용·부하 원시 JSON은 보존했습니다.

분석 캐시 정본은 document_id `d35f3b20-efd6-4cf7-b359-2ff1965029b2`입니다. 저장·runtime·body 저장 축의 커버/제외는 [호출 계약](portable-runtime.md)에 열거했습니다. 현재 기반 변경 후 Git 원격 HEAD와 clean 상태는 담당 세션의 최종 인계에 기록하며 main merge/배포는 하지 않습니다.

## 통합 전 narrow 후속

4e8ad3c의 자동 CI 37079992297은 test/test:verdict/test:ui PASS 후 top-level typecheck에서 실패했습니다. 격리 selfhost pg/types를 설치하지 않는 기존 CF 타입 검사 범위에 Node 소스가 포함된 원인은 root platform 분리 소유입니다. public fixture의 concrete DO namespace/stub와 Node mock JSON 반환 타입5곳은 owned 파일에서 국소 보정했으며 추가 runtime/전체 검증은 실행하지 않았습니다. old public fixture의 mutation helper는 과거 wrapper 상태를 가정하므로 root 선택 회귀에서 core 접점을 사용해야 합니다. 이 보완으로 기존 통과 gate를 다시 열지 않았습니다.

root가 추가 요청한 publicError budget retry narrow 단위검사는 RED에서17초가1초로 잘린 결함을 확인하고 GREEN1 PASS입니다. generic HttpError.retryAfter 초를 Retry-After와 retry_after_ms로 보존하며 PublicError.retryMs가 있으면 기존 ms 값을 우선합니다. 공용 HttpError 파일은 수정하지 않았습니다. 실제 CONTROL 연결은 root 후속입니다.


## 재시작 inspect와 cold-alarm 보완

trusted host inspect(id)와 maintenance(id)는 새 core가 식별자를 명시 결합하며 ID가 없으면 failclosed합니다. 실제 DO eviction 후 inspect selected 1 PASS(44ms)를 확인했습니다. private CF wrapper는 비밀 없는 `toktok_private_room_id` KV 하나만 보존·복원하고 공개 DO에는 저장을 추가하지 않았습니다. ID만 남은 부분 초기화를 방 성공으로 판정하지 않습니다.

cold-alarm 첫 gate는 KV 생성 후 SCHEMA_CONFLICT로 실패했습니다. 승인된 schema 이름 진단에서 생성 전 actor는 빈 목록이었고, mock KV 생성 후 정확한 내부 테이블 `_cf_KV`를 확인했습니다. SQL/table 행 데이터·본문은 출력하지 않았습니다. CF 검사에 이 정확한 이름만 추가하고 Node/PG는 변경하지 않은 보정 selected 1회가 PASS(61ms)입니다. cold eviction alarm 후 body rows0/initialized true, 실패한 초기화는 KV ID만 있고 snapshot rows0/initialized false입니다. 기존 inspect 및 다른 통과 gate는 반복하지 않았습니다.

Node PublicRooms registry의 rename 누적을 root 승인 범위에서 보정했습니다. configure/room 진입 및 has는 제거된 slug를 diagnostics로 prune하고 participant/watcher/pending grant/handler/wait가 모두0일 때만 shutdown·제거합니다. 전체100 core에서 새 core만429로 거절하며 기존 core는 drain/cleanup을 유지합니다. 별도 polling timer는 없습니다. 신규 targeted1 PASS(2280ms): pending grant 100개 room 유지/101번째429+Retry-After1초/만료 뒤 GC/기존 활성wait abort+leave 회수 및 timer0입니다. 운영 catalog 상한10은 root 정책이며 안전 registry 상한100과 구분합니다. 기존 부하는 반복하지 않았습니다.


operator grant의 outer DTO도 publicError가 직렬화한 `error.retry_after_ms`를 재사용합니다. 별도 메서드 gate의 최초 fixture가 B legacy HttpError에 없는 네 번째 생성자 인자를 사용하여 retry가 없었습니다. 실제 A 경계처럼 retryAfter 속성을 부여한 한 보정 실행이1 PASS(31ms)입니다. outer/inner 모두17000ms, status429, pending grant0/handler0을 확인했으며 기존 publicError case는 반복하지 않았습니다.


## 생성 purpose와 미초기화 GET 계약

공유 MAX_PRIVATE_PURPOSE_CHARACTERS=1000을 private-contracts 정본에 두고 private-state 생성 snapshot에 사용합니다. 신규 targeted1 PASS(9ms): 빈 문자열/Unicode1000 허용,1001은400 INVALID_SNAPSHOT입니다. 원래 HTTP 생성 계약0..1000을 보존하며 client 미허용 키 거절은 바꾸지 않았습니다.

CF wrapper GET은 읽기 전용 repo.check가 blank인 경우404 ROOM_NOT_FOUND를 반환하고 schema apply/metadata KV/예산 work를 만들지 않습니다. check 오류는 일반 오류 응답으로 남겨 실제 schema conflict를404로 위장하지 않습니다. 신규 selected1 PASS(86ms): unknown GET404/schema tables0/metadata keys0, 새 fixture 기존 방의 warm+cold GET200, unrelated schema conflict500/table보존입니다. 원래 coldalarm/inspect 등 통과 case는 선택하지 않았습니다. 최종 host/typecheck/CONTROL 연결은 root 통합 범위입니다.


## 초기 권한 거절의 request stream 회수

public/private core fetch finally에서 아직 미소비이고 unlocked인 request body만 비동기로 cancel합니다. 데이터를 읽거나 무한 drain하지 않으며 upstream cancel 완료를 기다려 handler를 붙잡지 않습니다. 권한 검사/본문 parsing 순서는 유지합니다. 요청 body 취소와 fixture response body 소비는 서로 다른 경계입니다.

새 six-denial gate 최초는 include에 새 파일이 없어0 tests였으며 PASS가 아닙니다. include만 추가한 허용 하니스 보정1회가1 PASS(167ms)입니다. 실제 CF stub private read→join/read→send/invite→send/participant→close/read→close 및 public watcher→send 모두403, fixture 관측 bodyUsed true/locked false, private handler0/bodyInflight0/public handler0입니다. 그 selected 출력에 request-stream 경고는 없었습니다. 운영 전체 경고 부재나 모든 transport cancellation 성공을 보장하지 않습니다. 독립 읽기 전용 delta 검수 PASS이며 기존 통과 case/부하/전체검증은 반복하지 않았습니다.

관련 공식 근거는 [workerd #918](https://github.com/cloudflare/workerd/issues/918)와 [Miniflare proxy](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/core/proxy.worker.ts)입니다. core에 도달하지 않는 root HTTP의 초기 거절은 root가 별도 회수합니다. upstream cancel 실패는 제품 응답/handler를 무한 대기시키지 않으며 해당 미확인 transport를 성공으로 쓰지 않습니다.


## 닫힌 wait와 소유자 삭제 정리

새 Node SQLite lifecycle selected gate 첫 실행 1 PASS(224ms)입니다. 닫힌 방의 wait는 읽지 않은 메시지를 먼저200으로 전달하고 빈 wait만410 ROOM_CLOSED로 끝냅니다. 대기 중 close도410으로 깨우며 GET messages의 닫힌 이력200은 유지합니다. pending wait 최종0입니다.

소유자 DELETE는204 뒤 접근410이며 만료 전에도 저장 본문과 dedupe를 한 번에 메시지100개씩 정리합니다. mock201개가100/100/1로 제거되고 잔여 작업은1초 후 maintenance, 최종 body/dedupe0 및 다음 정리없음을 확인했습니다. 이 수치는 active DB 행 제거이며 backup/PITR 모든 사본의 즉시 물리삭제 증거가 아닙니다. 기존 통과 gate와 부하는 반복하지 않았습니다.


## Node startup retention restore 신규 검증

SQLite 첫 selected 실행1 PASS(1109ms), 새 격리 Postgres16 컨테이너 첫 selected 실행1 PASS(3762ms)입니다. 기존 v1 marker 데이터는 check/apply/start 거절 후 명시적 migration으로 보존했고 새 빈 apply는v2입니다. 실제 index를 fixture에서 제거하면 check가 SCHEMA_CONFLICT로 닫히고 무관 테이블1행은 그대로입니다. PG serving owner가 있는 migration도 OWNER_CONFLICT로 거절합니다. 실제 사용자 DB와 CF schema는 변경하지 않았습니다.

각 adapter에서 metadata 페이지1/1/0으로 기존 persist 방2개를 순회하고 HTTP 요청 없이 새 registry에서 restore했습니다. 한 방의 오래된 body101개는 첫100개와 기존 timer의 후속 정리로 제거하고, 삭제 상태의 아직 젊은 body1개도 정리했습니다. 두 adapter 모두 최종 body/dedupe0, shutdown timer0, 미초기화 control 예약의 room metadata0입니다. 예시 ID/본문은 mock이며 출력은 숫자뿐입니다. 무작정 전체 스냅샷/무한 polling/DB body pubsub는 추가하지 않았습니다. Docker foreground는 exit0으로 회수했습니다.

검증 명령은 Node24 heavy runner 안에서 `--test --test-concurrency=1 --test-timeout=60000 test/selfhost-restore-sqlite.test.ts` 및 `test/selfhost-restore-postgres.test.ts`를 각각 한 번 실행했습니다. 기존 통과 storage/private/100+50 부하 gate는 반복하지 않았습니다. 최종 호스트 타입 검사와 migration CLI/listen-ready 연결은 root가 담당합니다.
