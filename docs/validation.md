# HTTP 기반 검증 기록

2026-10-02. 기반 구현의 런타임·curl·타입검사·dry-run을 확인했습니다. 테스트 하니스의 타입 추론 오류는 담당자가 실제 시그니처를 확인해 허용한 제네릭 고정으로 해결했습니다. 최종 UI와 운영 배포는 이번 증거에 포함하지 않습니다.

## 단계 1: 설계 대조

기준 설계 커밋은 95d8b31입니다. docs/product-v1.md와 docs/architecture.md를 전체 읽었습니다. 기존 소스와 테스트는 없는 신규 리포였고 두 문서는 수정하지 않았습니다. 확정된 Worker/SQLite Room 구조와 9개 방 경로, 역할, 상태, TTL, 한도를 그대로 구현합니다. 설계 변경이나 추가 저장소·모델 호출은 없습니다.

실행 주체는 모든 아래 명령이 구현 에이전트입니다. 최종 UI의 390px/1440px 확인, 운영 creator 발급과 실제 배포는 후속 담당자/사용자입니다.

## 실제 실행 결과

공유 호스트에서 무거운 명령은 다음 runner로 순차 실행했고 테스트 worker는 하나입니다.

```sh
python3 "$AGENT_COMMON_FILES_DIR/skills/heavy-work-verify/scripts/heavy_verify.py" --timeout 300 -- pnpm --dir .projects/toktok--feat-http-foundation-cc9a955f test
```

| 게이트 | 실제 명령 | 결과 |
| :--- | :--- | :--- |
| RED | pnpm test (501 stub에서) | 10 failed (10), 모든 준비된 정상 경로 미구현 확인 |
| Workers SQLite 통합 | pnpm test | 10 passed (10), 1 file passed, 3.38s |
| curl HTTP 수용 | pnpm acceptance | TOKTOK_CURL_ACCEPTANCE_PASS, 두 참여자·3회 왕복·재전송·끊김 재개·관전·close/delete |
| 수용 판정기 음성 대조 | pnpm test:verdict | 1 passed (1), sequence 7 누락을 실제 Client.receive가 거부하고 cursor 6 유지 |
| 타입 | pnpm typecheck | 최종 exit 0 (이전 TS2589는 아래 원인과 보정 기록 참조) |
| bundle/config | pnpm dry-run | Wrangler 4.146.0, Total Upload 25.00 KiB / gzip 7.71 KiB, --dry-run: exiting now, exit 0 |

타입검사에서 초기 narrowing/ambient module 오류를 고친 뒤 test/foundation.test.ts(97,22)에 TS2589가 남았습니다. 허용된 stub 반환형과 callback 반환형 표기만으로는 해결되지 않았습니다. 담당자가 설치된 cloudflare-test.d.ts:24의 runInDurableObject<O,R> 시그니처를 확인하여 callback 인자 any가 O=any를 유발한다는 원인을 좁혔습니다. 허용된 타입 전용 수정으로 숫자 반환 두 호출에 <DurableObject,number>, cleanup 호출에 <DurableObject,{registered:number;remaining:number}>를 명시했고 마지막 typecheck가 exit 0입니다. 생산 코드에 any/ts-ignore를 추가하거나 컴파일러 옵션으로 오류를 숨기지 않았습니다. 기존 10 passed 런타임은 반복하지 않았으며 이 테스트 타입 표기 변경은 실행 동작을 바꾸지 않습니다.

설치 시 npm 10.9.8의 edgesOut 오류가 나서 pnpm으로 전환했습니다. pool이 포함한 workerd는 2026-08-22까지만 지원해 테스트가 실행되지 않았으므로 Miniflare와 Wrangler를 같은 최신 날짜 지원 버전으로 고정했습니다. production compatibility_date는 2026-10-01 그대로입니다. 로컬 서버는 다른 세션의 8787/9229와 충돌하여 전용 임시 포트와 inspector port 0을 사용했습니다. curl config는 ASCII escape 대신 UTF-8 문자열을 유지하도록 보정했습니다. 다른 세션의 프로세스나 파일을 수정하지 않았습니다.

## 핵심 요구 매핑

| 요구 | 코드 | 확인한 결과 |
| :--- | :--- | :--- |
| 승인 creator만 생성 | src/creator.ts:3, src/index.ts:31 | missing/invalid 401, 외부 Origin 변경 403, 비활성 명부의 503은 코드 대조 |
| 256bit 권한 분리 | src/http.ts:28, src/room.ts:51 | invite/read/owner/participant 서로 다른 43자 토큰, 읽기·입장·쓰기·관리 분리 |
| GET 안내 부작용 없음 | src/room.ts:69, src/guide.ts:3 | 반복 GET 후 participants 0, owner/creator 토큰 미노출, 브라우저 text/plain |
| 동시 순서와 중복 | src/room.ts:105 | 12개 동시 발신의 단조 순서, 중복 POST 200/201 동일 메시지, 다른 내용/reply_to 409 |
| cursor 이어받기 | src/room.ts:131 | 105개 저장 이력에서 첫 100개 후 101~105, DO eviction 후 같은 cursor 재개, 미래 cursor 400 |
| bounded wait | src/room.ts:139 | timeout 동일 cursor, 발신 wake, abort/close/delete 후 resolver 0, 동일 capability 8개 제한 429 |
| close/delete/expiry | src/room.ts:34, src/room.ts:41, src/room.ts:46 | closed 이력 허용·발신/입장 차단, wait 남은 이력 후 410, 만료 반환 시 차단, deleteAll 후 테이블·alarm 없음 |
| 입력과 보안 | src/http.ts:29, src/index.ts:24 | 크기/JSON/query 오류, no-store/no-referrer/noindex/nosniff, CORS 허용 없음 |
| curl 독립 참여 | scripts/acceptance.py:37 | 링크에서 API 발견 후 각자 입장, 3회 왕복, 응답 유실 재시도, 실제 curl 중단 후 재개 |
| 배포 준비 | wrangler.jsonc, .github/workflows/ci.yml | 단일 custom domain, workers.dev/preview/observability 비활성, dry-run 완료; 실제 배포 미수행 |

64 participants, 10000 messages, 32 room waits, sender 30/room 120/creator 5/IP 120 분당 한도는 구현 코드와 설정을 대조했습니다. 이 숫자 모두에 대한 부하 시험을 통과했다고 주장하지 않습니다. 테스트는 한 방의 현실적인 핵심 경로와 명시된 실패를 확인합니다.

## 시스템 흐름과 전수 경로

진입 경로 축은 생성, 공유 안내, 메타데이터, 입장, 발신, 이력, wait, close, delete의 9개입니다. 공개 health와 디자인 대기 루트는 방 데이터를 읽지 않는 별도 표면입니다. 각 경로는 Worker의 한 라우팅 경로를 통해 Room에 들어갑니다.

```text
curl A / curl B / read-only
  -> src/index.ts:15 (경로/Origin/IP/creator/입력 제한)
  -> src/index.ts:41 (Room DO 전달)
  -> src/room.ts:60 (capability 인증)
  -> join:95 / send:105 -> 동기 SQLite transaction
  -> send:128 / close:83 / erase:43 -> wait resolver wake
  -> page:131 / wait:139 -> 마지막 포함 sequence cursor
  -> scripts/acceptance.py:55 -> 처리 뒤 각 client cursor 저장
```

| 최종 표면 | 정본과 코드 |
| :--- | :--- |
| 안내 | Room 메타데이터 -> src/guide.ts:3, 사용자 텍스트는 인용 데이터 |
| HTTP 메시지 페이지 | Room SQLite -> src/room.ts:131, fallback 없이 저장된 순서 |
| curl 수신 | scripts/acceptance.py:55, 서버 cursor는 처리 후 저장 |
| 브라우저 | src/room.ts:71 및 src/index.ts:18, 디자인 준비 중 text/plain |

lifecycle 전 사례는 open 요청, closed 이력/발신/입장/wait, owner delete, 만료 후 일반 요청, wait 반환, alarm, abort, timeout, runtime eviction입니다. 일반 GET으로 빈 저장소에 테이블을 만들지 않습니다. wait의 검사와 등록 사이에는 await가 없고, 모든 종료 경로에서 finally가 timer/resolver/listener를 제거합니다. 대기는 영속화하지 않으며 runtime eviction 뒤 SQLite 이력을 cursor로 이어받습니다.

새 route/필드를 추가할 때는 Worker routing, Room 권한과 SQLite/view, OpenAPI, guide, runtime 테스트, curl 소비를 함께 확인합니다. 사람 관전 UI는 구현하지 않았으므로 API 관전 시험을 UI 시험으로 보고하지 않습니다.

## 남은 것과 하지 않은 것

타입검사 차단 항목은 해결했습니다. 상세 코드 검수 결과는 PR과 담당 세션의 인계 보고에 남깁니다. 최종 디자인, 운영 creator 인증, 실제 Cloudflare 권한·zone 로그·rate namespace·DNS·도메인 응답은 후속 확인입니다. 새 운영 credential, main push/merge, 실배포, 디자인 브랜치 병합, 워크트리 정리는 하지 않았습니다. 실제 모델 두 개를 실행하지 않았고 API 시험을 사람 UI/실기기 시험으로 주장하지 않습니다. 요구에 없는 복구/재시도 계층과 전역 방 목록·스케줄러·추가 DB는 넣지 않았습니다.

변경 밖 기존 테스트 실패는 없습니다. 빈 리포의 새 테스트 하니스에서 발견한 타입검사 오류는 위 보정으로 해결했습니다. 이전 통과 gate는 해당 실행 시점의 소스와 설정에 묶으며, 코드/의존 경로 변경 또는 관련 rebase가 생길 때만 무효화합니다.

## 관전 통합 검증 — 검수 미완료

main 22606681에 선정 Common room 디자인 a78acce0을 연결했습니다. 위의 HTTP 기반 기록은 선행 PR 시점의 증거이며 이번 결과와 구분합니다. product-v1.md 및 architecture.md는 수정하지 않았습니다. 운영 creator와 실배포는 여전히 미확인입니다.

이번 실행 주체는 구현 세션입니다. 전체 회귀는 PR CI 한 곳에 맡기며 로컬에서 foundation 전체를 반복하지 않았습니다. 단계 1 읽기 전용 spec-reviewer는 구현 blocker 없음으로 통과했습니다.

| 게이트 | 실제 명령 | 판정 원문과 범위 |
| :--- | :--- | :--- |
| 라우팅 RED | pnpm exec vitest run test/routing.test.ts | 3 failed (3), 미구현 HTML/Assets 분기 확인 |
| 관전 라우팅 | pnpm exec vitest run test/routing.test.ts -t 'serves\|negotiates\|preserves' | 3 passed (3), Assets/보안 헤더/HTML·md·JSON/공유 권한/GET 무입장/403·410/빈 저장소 확인 |
| 기존 권한 targeted | pnpm exec vitest run test/foundation.test.ts -t 'separates all capabilities' | 1 passed, 9 skipped, 기본 non-browser text/plain/입장·읽기·쓰기 분리 유지 |
| cursor/소유권 RED | pnpm exec vitest run --config vitest.ui.config.ts | 2 failed (2), no-op 적용 및 모든 응답 수락 stub의 실패 확인 |
| 최소 관전 단위 | pnpm test:ui | 3 passed (3), 중복 sequence/DOM 적용 실패 시 cursor 불변/이전 소유권·abort/Retry-After와 상한 backoff |
| 타입 | pnpm typecheck | tsc --noEmit, exit 0; strict 설정 그대로 |
| Assets dry-run | pnpm dry-run | Read 12 files, ASSETS binding, Total Upload 26.14 KiB / gzip 8.07 KiB, --dry-run: exiting now, exit 0 |
| 실제 관전 실행군 | node scripts/spectator-browser.cjs | 전체 PASS marker 없음. 아래 실패와 부분 증거를 참조 |

모든 무거운 명령은 heavy_verify.py --timeout 300으로 하나씩 실행했습니다. Workers 테스트 worker는 하나입니다. 브라우저는 지정된 Playwright 기본 headless shell, --disable-dev-shm-usage, 전용 TMPDIR와 ulimit -c 0을 사용했고 모든 Worker/HTTP/Chromium 프로세스를 finally에서 종료·회수했습니다.

첫 브라우저 실행은 offline 관찰 제한 10초가 이미 열린 bounded wait 25초보다 짧아 Timeout 10000ms exceeded로 실패했습니다. 제품 코드를 바꾸지 않고 이 하니스 관찰만 35초로 1회 보정했습니다. 두 번째 실행은 1440px의 모든 준비된 단계와 390px 빈방·3회 왕복·아바타·시안 대조·pause까지 진행한 뒤 `resume read position` assertion에서 실패했습니다. count 17 확인은 먼저 성공하여 추가 메시지는 표시됐습니다. before/paused/resumed 좌표를 assert 전 JSON에 저장하지 않아 feed/page 어느 축인지 이 증거로 판정할 수 없습니다. 제품 결함과 fullPage 캡처/모바일 하니스 영향 중 무엇인지 추측하지 않고 추가 수정·실행을 멈췄습니다. 통합 완료 또는 390px 위치 보존 통과로 보고하지 않습니다.

1440px에서 확인한 실제 변화는 다음과 같습니다.

- 두 curl 참가자의 3회 왕복이 관전 피드에 sequence 순서로 표시됩니다.
- 위험 HTML/Markdown 문자열이 평문으로 보이고 자바스크립트를 실행하지 않습니다.
- 발언자 닉네임 머리글자와 색상이 피드/사이드 목록에서 일치합니다.
- pause/resume 전후 feed scrollTop 120 및 pageY 25가 유지되며 sequence 1~17에 누락·중복이 없습니다.
- 실제 연결 끊김 동안 추가한 메시지를 마지막 cursor에서 재개하고 기존 피드를 유지합니다.
- 실제 Chromium clipboard 권한 denied에서 선택 가능한 긴 URL이 연결 방법 탭에 표시됩니다.
- 브라우저 경계의 제어된 429/Retry-After:1 응답 후 안내 시간 뒤 재시도합니다. 실제 SQLite rate-limit 응답은 기존 foundation CI가 담당하며 이 제어 응답을 실제 한도 발동으로 주장하지 않습니다.
- closed는 18개 이력을 보존하고 대기를 끝내며, 실제 TTL 만료 URL은 HTTP 410의 만료 표면으로 열립니다.

390px에서 빈방/실제 메시지/긴 한글/안전한 평문/최종 배지 색상/같은 발언자 머리글자·색상/가로 overflow 없음은 확인했습니다. reconnect/clipboard/429/closed/expired의 모바일 단계는 실패 뒤 실행되지 않아 확인하지 않았습니다.

화면과 JSON은 담당 세션에 로컬 산출물로 전달합니다. 공통 prefix는 `.local/artifacts/toktok/20261002-1958-spectator-`이며 evidence.json과 desktop/mobile room/empty/paused-reading PNG, desktop error/clipboard-fallback/rate-limit/closed/invalid/expired PNG가 있습니다. 선택 디자인 대조는 별도 design-same-content PNG입니다. 대조 화면은 읽기 전용 prototype의 review rail만 제거하고 title/feed/발언자에 동일한 창작 텍스트를 넣은 레이아웃 참고입니다. 서버 동작 증거는 실제 Worker 화면입니다. 이미지 속 긴 URL은 같은 형식의 A 43자로 가려 local fixture 토큰도 노출하지 않습니다.

## 관전 변경 경로와 화면 계약

| 축 | 실제 사례와 처리 |
| :--- | :--- |
| 진입 | / 및 /guide 정적 소개, /r HTML·Markdown·기본 text/plain, /api JSON, root CSS/JS/SVG/font/image Assets |
| 데이터 | src/index.ts의 기존 shared GET 검증 → src/room.ts의 SQL roomView/page → public/app.js metadata/messages/wait → session.js applyPage → view.js textContent append |
| 상태 표시 | metadata purpose/expires_at/status/permissions, message sender/text/time, empty/closed/ROOM_GONE/link-error, 피드를 보존하는 disconnect/429 안내 |
| 종료 | pause/room 이동/pagehide의 AbortController+retry/expiry 타이머 취소, 소유권이 맞는 응답만 적용, ROOM_GONE에서 피드 제거 |
| 추가 시 동시 대조 | Worker 분기·보안 헤더, Room의 기존 권한과 데이터 shape, OpenAPI, browser cursor/소유권, textContent 표시, runtime·브라우저 하니스 |

기존 Common room의 header/room-title/chat-tabs/feed/watch-toolbar/sidebar/empty/expired와 토큰을 재사용했습니다. CSS는 선택 화면이 쓰는 selector의 원래 선언과 순서를 유지하고 7방향·스튜디오·생성/종료 모달·fake typing 규칙을 제외했습니다. 새 px 값은 없고 intrinsic wrapping, hidden 속성, plain-text 줄바꿈 및 root asset 경로만 보정했습니다. 기존 inline 메시지 지연 값은 외부 CSS의 --i 기본 0으로 옮겼으며 CSP를 완화하지 않았습니다.

최종 배지 색은 #5f6d56입니다. desktop conversation/sidebar의 y는 286.15625로 일치하고 가로 폭은 1440과 390에서 각각 viewport를 넘지 않았습니다. bubble의 font/padding/radius 및 conversation의 같은 역할 값은 선택 디자인과 동일 창작 내용으로 대조했습니다. 실제 캡처에서 이웃 요소와 좌우 여백·텍스트 균형을 확인했으나 모바일 resume 실패 때문에 전체 시각/동작 검수 통과로 처리하지 않습니다. 생성/종료 모달은 운영에 없으므로 새 모달 QA를 수행하지 않았습니다. 예전 44px 전수 또는 reduced-motion 기록을 이번 실행 증거로 확대하지 않습니다.

로컬 Noto Sans KR Regular/Bold, Serif KR Regular 각 파일의 cmap은 U+AC00–U+D7A3 11,172개를 모두 포함합니다. 기존 SIL OFL을 보존하고 WOFF2로 변환했으며 외부 font/CDN 요청을 하지 않습니다.

## 허용된 모바일 위치 진단 1회

390×844 하나에서 캡처 없는 대조와 pause 중 fullPage 캡처 대조를 준비했습니다. 그러나 16개 메시지를 따라간 맨 아래에서 먼저 위로 이동하지 않고 +120 wheel을 보낸 하니스 실수로 준비 조건이 실패했습니다. `user wheel positions`에서 멈췄으며 제품 수정이나 추가 재시도는 하지 않았습니다. assert 전 좌표는 새 evidence.json에 보존했습니다. pause/resume 두 대조에 진입하지 못했으므로 위치 실패 원인은 여전히 미확정입니다.

측정된 실제 viewport는 innerHeight 844, visualViewportHeight 844이고 activeElement는 BODY입니다. feed.scrollTop 6046, scrollHeight 6636, clientHeight 590, pageY 600, toolbar height 63입니다. skip 링크는 computed fixed top -70px, rect y -70/bottom -13.203125로 화면 밖이었습니다. 따라서 원래 fullPage PNG의 skip 표시는 실제 viewport에서 포커스되어 나타난 상태의 증거가 아닙니다. 이 사실을 모바일 resume 원인 확정으로 확대하지 않습니다. 새 진단 prefix는 `.local/artifacts/toktok/20261002-2003-mobile-position-`입니다. 하니스/실제 서버/브라우저를 종료·회수했습니다.
