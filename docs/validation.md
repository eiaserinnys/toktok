# 관전 통합 검증 기록

현재 이메일/OTP/claim 추가 구현과 새 검증은 사용자 지시로 보류했습니다. 익명 private create 전환은 검토 중이며 아직 승인되지 않았습니다. 이 문서는 WIP이고 기존 통과 증거는 유지합니다. 최종 private 정책 합격이나 서비스 공개를 뜻하지 않습니다. [보존 상태와 증거](qa/claim-wip-20261002/README.md)를 봅니다.

2026-10-02. main 22606681의 실제 HTTP 방을 선정 Common room 디자인 a78acce0에 연결했습니다. 로컬 Worker/SQLite와 두 curl 참여자의 대화를 1440px/390px 관전 화면에서 확인했고, 마지막 보완은 세 스타일 복원과 만료 재확인·종료 안내 두 계약에 한정했습니다. 운영 인증·도메인·배포는 이번 증거에 포함하지 않습니다.

## 정본과 범위

제품 정본 docs/product-v1.md와 docs/architecture.md는 전체 읽고 보존했습니다. 별도 design/toktok-ui의 선정 Common room header/room-title/chat-tabs/feed/watch-toolbar/sidebar/empty/expired만 옮겼습니다. 디자인 스튜디오 7방향, reviewrail, WebMCP, mock route/timer/사용자, 생성·닫기 모달은 운영 Assets에 없습니다. 분석 캐시는 없습니다. 단계 1 읽기 전용 spec-reviewer는 blocker 없음으로 통과했습니다.

## 실제 명령과 판정

공유 호스트에서 heavy_verify.py --timeout 300(좁은 후속 브라우저는 180)으로 순차 실행했습니다. Workers 테스트 worker는 하나이고 Chromium은 지정된 Playwright 1.63 기본 headless shell, --disable-dev-shm-usage, 전용 TMPDIR, ulimit -c 0을 사용했습니다. Worker/HTTP/Chromium은 foreground에서 소유하고 finally로 종료·회수했습니다.

| 게이트 | 실제 명령 | 판정 원문과 범위 |
| :--- | :--- | :--- |
| 라우팅 RED | pnpm exec vitest run test/routing.test.ts | 3 failed (3), 미구현 HTML/Assets 분기 |
| 관전 라우팅 | pnpm exec vitest run test/routing.test.ts -t 'serves\|negotiates\|preserves' | 3 passed (3), Assets/보안 헤더/HTML·md·JSON/권한/GET 무입장/403·410/빈 저장소 |
| 기존 권한 targeted | pnpm exec vitest run test/foundation.test.ts -t 'separates all capabilities' | 1 passed, 9 skipped, 기본 text/plain/입장·읽기·쓰기 분리 |
| cursor/소유권 RED | pnpm exec vitest run --config vitest.ui.config.ts | 2 failed (2), no-op 및 이전 응답 수락 stub 실패 |
| 최소 관전 단위 | pnpm test:ui | 3 passed (3), sequence 중복/DOM 적용 실패 cursor/이전 소유권·abort/Retry-After·상한 backoff |
| 타입 | pnpm typecheck | tsc --noEmit, exit 0; strict 설정 유지 |
| Assets dry-run | pnpm dry-run | Read 12 files, ASSETS binding, Total Upload 26.14 KiB / gzip 8.07 KiB, --dry-run: exiting now, exit 0 |
| 원래 실제 관전 실행군 | node scripts/spectator-browser.cjs | 전체 PASS 없음. 1440 단계 통과, 390 초기 단계 통과 후 아래 캡처 영향 확인 |
| 390 남은 범위 | TOKTOK_BROWSER_SCOPE=mobile-remaining node scripts/spectator-browser.cjs | TOKTOK_SPECTATOR_MOBILE_REMAINING_PASS |
| 세 스타일 보완만 | node .local/artifacts/toktok/20261002-2014-style-targeted.cjs | TOKTOK_STYLE_TARGETED_PASS |
| 만료·종료 계약만 | node scripts/spectator-contracts.cjs | TOKTOK_CONTRACT_TARGETED_PASS |

선행 기반 PR #1의 Workers SQLite 10 passed, 판정기 1 passed, TOKTOK_CURL_ACCEPTANCE_PASS, strict 타입 및 dry-run 증거는 main 22606681에 반영됐습니다. 기반 검증은 인증 분리, 동시 저장·중복409, cursor 페이지, wait timeout/wake/abort 정리, close/delete/expiry 물리 deleteAll 및 입력·보안입니다. 관전 변경의 전체 회귀는 PR CI 한 곳에 맡깁니다. cba1a2c의 CI run 36999062338은 runtime 13 passed, 판정기 1 passed, 관전 단위 3 passed, 타입검사, curl marker와 Assets dry-run 성공을 직접 확인했습니다. 보완 후 최종 head의 CI는 PR checks와 인계 보고에 따로 확인합니다. 이미 통과한 로컬 unit/타입/routing/dry-run/1440 전체를 보완 뒤 반복하지 않았습니다.

## 요구별 실제 변화

| 요구 | 구현과 관찰 |
| :--- | :--- |
| 실제 관전만 | invite/read 검증 뒤 HTML. 브라우저는 metadata → messages → wait GET만 호출. owner/participant/creator 사용 및 입장·발신 없음 |
| 라우팅과 보안 | Worker-first Assets. /api JSON, Markdown Accept/?format=md, 기본 text/plain 유지. invalid 403, expired/deleted 410, CSP·no-store/noindex/no-referrer 유지 |
| 평문·실재 데이터 | purpose/text/nickname은 textContent. 위험 HTML/Markdown 실행 없음. sender.id로 발언한 사람만 표시, 머리글자·색상 일치, roster/online/관전자 수 추정 없음 |
| 메시지와 위치 | 두 curl 참여자 3회 왕복. append 후 cursor 전진, 중복 DOM 없음. pause 및 끊김 후 같은 cursor에서 재개. 아래에서만 따라가며 이전 feed/page 위치 유지 |
| 종료·만료 | closed 이력 보존 및 입장 불가 안내. 실제 TTL 만료에서 410/피드 제거. metadata 만료 재확인의 429도 Retry-After 후 재확인, paused에서는 messages/wait 재개 없음 |
| 링크 복사 | 실제 Chromium clipboard 허용·denied 양쪽 안내 opacity 1. 거부 시 같은 연결 탭에서 긴 URL 선택 가능. 초대 권한을 새로 만들지 않음 |
| 로컬 자산 | CSS/JS/SVG/font/image는 / 기준. 외부 요청 0. 같은 Noto Sans KR Regular/Bold, Serif KR Regular의 완성형 한글 11,172개 cmap 확인, SIL OFL 보존 |

1440px 원래 실행에서 feed120/page25를 pause/resume 전후 보존하고 sequence1~17을 빠짐없이 표시했습니다. 390 남은 실행은 17→18 재연결 뒤 feed120/page600을 유지했고, 제어된 wait429의 간격은 1027ms였습니다. closed18개 이력, invalid403/expired410, API GET-only, external0/CSP 오류0을 확인했습니다. 실제 TTL 만료와 브라우저 경계의 제어 429를 구분하며 계정 rate-limit을 실제 발동했다고 주장하지 않습니다.

## 모바일 초기 실패와 확정 원인

첫 실행의 offline 관찰 10초가 이미 열린 wait25초보다 짧아 실패했고 하니스 제한만35초로 한 번 보정했습니다. 다음 실행은 390 resume 위치 assertion에서 멈췄으나 좌표가 assert 뒤에 저장돼 실패 축을 판정할 수 없었습니다. 좁은 진단도 최초16개 도착으로 맨 아래인 feed에 +wheel을 보내 준비 조건에서 실패했습니다. 이 초기조건 실수는 제품 위치 실패 증거가 아닙니다.

담당 root가 제품 HEAD f27abed8에서 초기조건 feed120/page600을 명시하고 실제 pause/resume tap을 직접 실행했습니다. 캡처 없는 대조는 pause 직후·500ms·resume·17개 도착·500ms 모두 feed120/page600/toolbar63/pageHeight1732를 유지했습니다. fullPage 캡처 대조는 shot 직후에만 page600→632가 됐고 feed120과 toolbar/status 높이는 그대로였습니다. fullPage screenshot의 하니스 영향이 실측됐으므로 제품 pause/CSS를 보정하지 않았습니다. skip 링크도 실제 viewport의 rect y-70/bottom-13.203125로 화면 밖입니다.

root의 캡처 없는 위치 증거를 채택하고 남은390 게이트만 viewport PNG와 assert 전 JSON 저장으로 실행했습니다. 원래 전체 실행을 다시 통과한 것처럼 표현하지 않습니다.

## 마지막 국소 보완

선택 CSS를 추출할 때 빠진 #toast.visible와 모바일 .invite-btn 원본 규칙을 복원했습니다. JS visible 토글과 맞추고, 새로 선택 가능해진 #shared-url에 기존 button/a의 focus-visible·outline-offset을 공유했습니다. 새 px 값이나 장식은 없습니다. 1440/390의 성공·실제 denied 토스트 opacity1 및 viewport PNG를 확인했습니다. URL 선택·초점은 green 3px/offset5px이고, 390 버튼의 좌우22..368은 conversation과 일치하며 margin-top20px/min-height48px, 후속 cascade의 font14px·자연 높이52px를 유지합니다.

만료 probe의 비종료 오류·네트워크 실패는 즉시 messages/wait를 시작하지 않고 기존 retryDelay로 expiryTimer 하나를 예약합니다. controller/active 소유권을 유지합니다. 초기 closed metadata/ROOM_CLOSED/closed page는 permissions.join=false와 기존 metadata 표시 함수를 함께 적용하며 피드를 재렌더하지 않습니다. 좁은 후속 검증은 제어한 metadata expires_at/429 Retry-After1에서 active1029ms·paused1028ms 뒤 재확인, 이전 API0, paused messages/wait0을 확인했습니다. 실제 로컬 owner close는 메시지1개를 보존하고 입장·발신 불가 문구로 갱신했습니다. 제어 시각/응답은 실제 TTL 또는 계정 한도 시험이 아닙니다.

## 화면 증거와 실행 절차

모든 경로는 워크스페이스 기준입니다. PNG의 긴 URL은 같은 형식의 A43자로 가려 창작 fixture capability도 노출하지 않습니다. 시안 대조는 레이아웃 참고이며 실제 Worker 화면과 구분합니다.

| prefix 또는 파일 | 내용 |
| :--- | :--- |
| .local/artifacts/toktok/20261002-1958-spectator- | 원래 JSON, desktop/mobile room·empty·paused, desktop error·clipboard·429·closed·invalid·expired, 같은 창작 내용 design-same-content 대조 |
| .local/artifacts/toktok/20261002-2003-mobile-position- | 초기조건 실패 및 assert 전 좌표 |
| .local/artifacts/toktok/20261002-2008-root-mobile-position-evidence.json | root 직접 위치 대조, control/capture viewport PNG와 함께 채택 |
| .local/artifacts/toktok/20261002-2010-mobile-remaining- | 390 reconnect/error/clipboard/429/closed/invalid/expired viewport PNG 및 PASS JSON |
| .local/artifacts/toktok/20261002-2014-style-targeted- | 1440/390 success·denied-focus viewport PNG, 세 스타일 PASS JSON |
| .local/artifacts/toktok/20261002-2020-contract-targeted- | 제어 expiry429/실제 ownerclose PASS JSON 및 closed-invite viewport PNG |

원래 desktop conversation/sidebar y286.15625는 일치하고 390 scrollWidth=viewport390입니다. bubble 본문15px, meta12px 및 최종 badge #5f6d56를 확인했습니다. 같은 내용·폭으로 원본과 font/padding/radius를 대조했으며 마지막 버튼/토스트/초점 누락까지 위 별도 증거로 보완했습니다. 새 틀·배치·폰트 크기를 선택하지 않았습니다. 예전44px 전수 또는 reduced-motion 기록을 이번 검증으로 확대하지 않습니다. 생성·종료 모달은 운영 화면에 없습니다.

```sh
# 지정 Playwright 모듈과 읽기 전용 디자인 prototype의 절대 경로를 설정합니다.
export TOKTOK_PLAYWRIGHT_MODULE=/path/to/playwright
export TOKTOK_DESIGN_PROTOTYPE=/path/to/design/prototype
export TOKTOK_BROWSER_OUT=/path/to/evidence-prefix-
export TMPDIR=/home/eias/workspace/.local/tmp/toktok-browser-ca176c2f
ulimit -c 0
TOKTOK_BROWSER_SCOPE=mobile-remaining python3 "$AGENT_COMMON_FILES_DIR/skills/heavy-work-verify/scripts/heavy_verify.py" --timeout 300 -- node .projects/toktok--feat-spectator-ui-8995215e/scripts/spectator-browser.cjs
# 계약 보완은 별도 evidence prefix와 timeout180으로 spectator-contracts.cjs를 실행합니다.
```

위 재현 명령은 실행 절차입니다. 이번 세션에서 통과 게이트를 반복할 지시는 아닙니다. 단계3 읽기 전용 재검수는 보완 diff·PNG·JSON을 직접 대조하고 이전 지적 해소 및 만료/종료 계약 충족으로 통과했습니다. 새 영역 검수·테스트·브라우저 실행은 하지 않았습니다. 최종 head/CI 확인은 이 판정 이후 인계 보고에서 구분합니다.

## 남은 경계

운영 creator 발급 경로는 사용자 결정 대기입니다. 기존 승인 명부 adapter와 빈 registry 기본값을 유지합니다. 새 운영 credential, 공유 secret의 브라우저 전달, 로그인/공개 방 목록/생성·쓰기·관리 UI, Cloudflare 쓰기, DNS, main 머지, 워크트리 정리는 하지 않았습니다. 실 모델 실행, 운영 domain/zone 로그/계정 권한/rate namespace/실기기 검증은 포함하지 않습니다. 머지·배포와 사용자 최종 인계는 담당 root가 수행합니다.
