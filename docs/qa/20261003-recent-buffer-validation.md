# 최근 DB 버퍼 v2 검증

사용자 2026-10-03 06:29:43 UTC 정책 변경에 따른 구현이다. [정책 전환·비용 산식](../development/recent-buffer-policy.md), [명령 결과 요약](evidence/20261003-recent-buffer/results.json)을 함께 읽는다. 원래 실제 소개 발언을 다시 게시하거나 복원했다고 주장하지 않는다.

## 구현과 자기 검수

공통 `RecentBuffer`가 public/new private의 bounded DB history, transaction sequence/dedupe, count/bytes/time cleanup을 소유한다. CF SQLite/Node SQLite/PG Repository가 같은 계약을 실행한다. Public lease/승인과 history epoch는 분리한다. 이전 private v1 memory에는 `recent_authorized`를 추가하지 않으며 새로운 본문 write 경로로 전환하지 않는다. 기존 longterm opt-in은 유지한다.

쓰기 전 quantity/USD 예약, 실패 시 본문/sequence 0, retained replay 추가 저장 예약 0, cleanup에서 새 동일-ID index를 잘못 삭제하지 않음, public scope 분리, partial cleanup 100개/TX, cold alarm/Node startup, reply/response byte 경계를 두 번째 읽기 검수로 대조했다. 별도 독립 reviewer 실행 결과로 표현하지 않는다. 타이머 keepalive source는 working source에서 제거했고 배포 대상에 없다. 사용자 수동 pending인 WAF/BIC/credential/workflow/senderDNS는 변경하지 않는다.

## 실행 결과

- 공통 저장 계약: SQLite·격리 PG·실제 Workers SQLite에서 concurrent sequence 12, same ID replay/conflict, count 500, serialized bytes 2MiB, 최초20/delta, 정책 축소, 시간/TTL, 100개 정리, 만료 ID 재사용, rollback, 동일 ID 동시 요청을 검사했다. 모두 PASS.
- 실제 Workers HTTP application 20건 중 최초 19 PASS/1 FAIL. 실패는 dedupe 안전 확인 추가로 SQL meter의 cleanup read13→14, replay lookup10→11이 된 기록 차이였다. 관측값을 보존하고 해당 1건만 보정 PASS(2 SKIP). 원시 application JSON/log를 덮어쓰지 않았다.
- CF public 기존 권한·정원·발신·순서·바이트·wait·eviction·window 12 PASS. DB 저장 전환으로 무효화된 이전 RAM-only assertion을 새 계약에 맞춰 이관했다.
- CF storage/host 최초 8 PASS/2 FAIL은 옛 SQL0/history_reset 기대였다. 두 fixture를 recent DB/동일 epoch 복원으로 이관한 뒤 해당2 PASS/8 SKIP. 별도 413 upstream-cancel 실패 진단은 실행하거나 PASS로 바꾸지 않았다.
- Node SQLite/PG recent+private/공개 재시작 계약 선택 5 PASS. Node 최종 startup/budget/lifecycle/shared-store 5 PASS. 추가 private response envelope 경계 1 PASS. 실제 Node HTTP/guide/private socket/bounds/registry/reservation 12 PASS. 새 private와 longterm PG는 모두 재시작 후 body1/epoch 유지. 기존 v1 private는 body SQL0/새 memory epoch.
- UI·schema·registry 106 PASS. 이후 native numeric policy field 보완의 영향 검사와 private TTL 소수 표기/생성·계정·coverage 선택 검사도 PASS. 새 count501/time 상한 및 schema read-only bytes를 검사했다.
- CONTROL 포트의 새 v2 고지/생성/claim/예산/권한 8 PASS. public UI adapter 10 PASS와 Workers HTTP 최초 1 PASS/1 FAIL(옛 KV0 기대)을 기록했다. KV는 비밀 없는 config/slug, SQL은 메시지+dedupe 2행으로 정정한 실패 1건만 1 PASS/1 SKIP.
- auth OTP13/claim9 22 PASS. 모든 주소/OTP는 로컬 fixture이며 외부 메일 0.
- Python receipt 3 PASS. 기본 Python client는 같은 client message ID를 유지하고 실제 메시지 응답과 feed cursor를 확인한 뒤 완료를 출력한다. 불확실한 전송은 자동 재게시하지 않는다.

Workers application 원시 로그에 기존 request-stream uncaught 경고 **10건**이 남는다. 테스트 판정과 분리하며 warning0 또는 기존 413 upstream 취소 해결로 주장하지 않는다. 새 recent-buffer의 restart/count/bytes/time assertions는 통과했다.

## 실제 제품/공유 검수 화면

기존 디자인 d6f0e975 및 root 7f6e9bd의 Common room renderer·레이아웃을 유지했다. 새 디자인이나 검수 전용 제품 복제는 없다.

- 로컬 실제 Node24 SQLite + 기본 Python client + 가상 사람의 확인: 390/1440 각 연결 요청/고지 v2/checkbox 해제 후 재확인/참가/발언 receipt/관전/새 익명방 안내 PASS. storage0/CSP0/cleanuptrue. 실제 운영방 승인·게시 증거가 아니다.
- 실제 local admin session/DB/schema: 390/1440에서 public/private max500, 501 입력 error, 고정 byte/time 설명, mutation0/CSP0 PASS. 첫 하니스 cookie 형식 오류는 제품 진입 전 실패로 보존했다.
- 실제 숫자 policy renderer가 `type=integer`를 넘겨 native min/max가 빠진 결함을 RED로 확인했다. 공유 schema renderer에서 integer→number로 보완하고 숫자 제한과 error 연결을 검증했다. 새 치수/CSS나 정책 확대 없음.
- 보호된 flow board의 모든 활성 iframe ready, 새 DB recent/이전 v1 memory preview, API0 PASS. Dialogue 열기 trigger를 누르지 않은 하니스 timeout을 원문으로 보존하고, 미도달 gallery만 390/1440 tail 2 PASS. 실제 공통 public-risk dialog의 DB/PITR 고지, Escape, API0/CSP0/cleanuptrue 확인.
- README hero는 설명→공개방 순서를 유지한 최신 실제 렌더다. 대화 이미지는 로컬 DB의 가상 설계/검토 데이터이며 실제 유실 발언이나 실제 관리자/비밀을 담지 않는다. 브라우저 애니메이션 완료 후 캡처했고 이미지를 직접 확인했다.

원시 파일과 PNG: `.local/artifacts/toktok/20261003-recent-buffer/`. 초기 실패, 수정 결과, tail을 각각 보존한다. private capability가 포함될 수 있는 로컬 private 화면은 README/public evidence로 복사하지 않는다. 요약 파일에는 cookie/token/주소/권한 값이 없다.

## 명령

Node는 고정 Node24.21.0과 `--import ./selfhost/node_modules/tsx/dist/loader.mjs`, runtime/browser는 공용 `heavy_verify.py`로 실행했다. Workers는 `vitest.application.config.ts`, `vitest.public.config.ts`, `test/selfhost.vitest.config.ts`, `test/control-auth-vitest.config.ts`; UI는 `vitest.unit.config.ts`다. 각 correction은 실패한 이름만 `-t`로 선택했다. CF/Node 분리 tsc, generated 확인, Node bundle, Wrangler dry-run 및 최종 배포 결과는 아래 후속 절에 기록한다.

## 최종 빌드

CF 및 Node 분리 타입 검사 exit0, generated 모듈 정합 exit0, Node bundle 294.9KiB 및 Wrangler strict dry-run exit0(Worker 284.85KiB/gzip68.17KiB, assets111)이다. pnpm 실행 환경 Node22의 엔진 경고는 보존했으며 실제 자체 호스팅 검증은 Node24.21.0에서 했다. 최종 로컬 빌드 이후 변경은 테스트 assertion과 문서뿐이다. 기존 CI workflow의 Node24/자체 호스팅 의존성 연결은 이번 권한 범위에서 변경하지 않았다.

## PR CI 첫 결과와 HTTP backpressure

PR #12 첫 CI37107882644는 application19 PASS/1 FAIL이다. 열두 개를 동시에 발신하는 fixture가 하나의 RATE_LIMITED429/Retry-After1을 무조건201로 단정해 실패했다. 실제 body-inflight8 상한을 바꾸지 않고 모든 응답을 먼저 회수한 뒤 429만 같은 sender/client message ID로 1회 재시도하도록 fixture를 고쳤다. 같은 메시지의 중복·순서 검증은 유지한다. 로컬 이전 PASS를 이 CI의 성공으로 쓰지 않는다.

보정한 동시 발신 HTTP 1건은 1 PASS/5 SKIP이다. 실제로 최초10건201·2건429 후 Retry-After1을 기다린 동일 ID2건201, 최종sequence1..12를 확인했다. 해당 실행의 request-stream 경고2건은 별도로 남는다. 사용자 BIC 수동 설정 후 기본 Python 공개/Markdown200과 비인증401/관리자403을 확인했으며 운영 발언은 하지 않았다.
