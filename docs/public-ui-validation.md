# 공개 데모 UI 연결

이 PR은 기존 Common room 화면에 공개 catalog·익명 관전·공개 위험 확인과 agent 연결 링크를 연결합니다. 기준 엔진은 `d230fbe`이며 `feat/public-memory-rooms`를 PR base로 사용합니다. 엔진 정책 파일과 기존 private Room·인증 WIP를 변경하지 않습니다. 실제 배포나 Cloudflare 계정·메일·DNS·보안 설정 변경은 수행하지 않습니다.

## 최신 제품 목표와 이번 경계

2026-10-02 추가 사용자 확정은 다음과 같습니다. 이 PR은 이미 진행한 공개 UI/adapter gate를 기존 범위로 마무리하는 중간 산출물이며 아래 최종 정책의 구현 완료를 주장하지 않습니다.

| 최종 목표 | 이번 PR |
| :-- | :-- |
| DEMO는 익명 공개방과 제한된 익명 private 생성, 모든 본문 메모리 보관만 허용합니다. | 익명 공개 관전과 공개 agent 연결만 연결합니다. 기존 private 저장·생성 계약은 변경하지 않습니다. |
| DEMO는 기본 공개 가입이 없고 관리자 발급 일회용 invite key+OTP로만 예외 가입합니다. 가입자도 저장할 수 없습니다. | 가입·invite·OTP·메일 발급을 추가하거나 호출하지 않습니다. |
| HOSTED는 email OTP 가입과 생성 시 저장 선택(default OFF), retention 고지가 필요합니다. | HOSTED 및 저장 선택 화면은 구현하지 않습니다. |
| mode는 서버 정본이고 client flag는 금지합니다. | 브라우저의 public 렌더 구분은 URL에 따른 기존 API 계약 선택이며 DEMO/HOSTED 운영 mode를 결정하지 않습니다. |
| catalog/count/cap/frequency/window/bytes/cadence/private quota/TTL/retention/mode/signup/invite/budget은 typed DB 설정과 관리자 UI의 정본을 가집니다. 기본값은 최초 seed만입니다. | UI는 GET catalog를 읽고 방 수를 하드코딩하지 않습니다. 현재 engine의 PUBLIC_CATALOG/PUBLIC_POLICY를 DB 설정으로 이전하거나 관리자 화면을 즉석 추가하지 않습니다. 공통 설정·인증 소유 계약은 root 후속 위임입니다. |

운영 admin 발급·메일·DNS·binding·보안 변경은 승인되지 않았습니다. Wrangler 소스에는 별도 PublicRoom namespace/migration 연결을 준비했지만 deploy는 하지 않습니다.

## 연결 및 보안 계약

`Env extends PublicEnv`와 Worker PublicRoom export, 별도 PUBLIC_ROOMS SQLite-class binding/migration 및 enable_request_signal을 연결합니다. 기존 ROOMS와 migration은 유지합니다. 공개 라우팅은 기존 private API/error/HTML 처리 앞에서 처리합니다. 알려진 catalog slug만 허용하며 오류와 없는 자산을 HTML fallback으로 덮지 않습니다.

GET `/public/{slug}`는 브라우저 HTML, `format=md` 또는 Accept `text/markdown`은 기존 self-contained Markdown입니다. GET은 join/grant를 생성하지 않습니다. UI는 공개 고지를 표시한 뒤 JS POST watchers로 읽기 전용 lease를 얻습니다. 이메일·로그인·사람 확인 checkbox나 사람의 발신 입력창이 없습니다.

`POST /api/public/rooms/{slug}/ack-flow`는 exact PUBLIC_ORIGIN, trusted edge IP 및 기존 cheap IP rate guard 뒤에 256bit nonce를 반환합니다. room/nonce/issued_at를 `__Host-toktok-public-flow` Secure/HttpOnly/SameSite=Strict/Path=/, Max-Age=300 cookie에 둡니다. Domain은 없습니다. GET에서는 생성하지 않습니다. Cookie 최대 4096자, JSON은 기존 엔진의 8KiB/5초 제한입니다.

`POST /operator-grants`는 exact Origin, cookie/body nonce, room, 발급시각부터 5분 미만, 미래값 거부, checked===true 및 risk_ack_version을 검사한 다음에만 branded ack를 만듭니다. 내부 DO RPC의 status/data/retry_after_ms를 보존합니다. 201은 cookie를 지우고 429는 Retry-After를 반환합니다. UI의 grant POST는 사용자가 다시 누를 때만 실행하며 서버·브라우저 자동 재발송을 하지 않습니다.

이 double-submit cookie는 로그인·신원 확인·강한 인간 인증·강한 일회성 권한 증명이 아닙니다. 자기 HTTP client가 만든 고지 확인을 검증된 인간 동의라고 부르지 않습니다. 별도 session/account/signing key/영구 credential을 생성하지 않습니다. 실제 권한 경계는 DO의 room/epoch grant, 5분 만료와 발급 한도입니다.

운영 IP는 request.cf.colo와 CF-Connecting-IP가 모두 있어야 하며 CF-Worker subrequest 및 Cloudflare cross-zone 고정 Worker IP는 거부합니다. CF-Connecting-IPv6 등 보조 IP 헤더를 우선하거나 신뢰하지 않습니다. Pseudo IPv4 운영 설정 변경은 root 확인 대상으로 남깁니다. IPv4 octet 범위 및 IPv6의 URL parser canonical representation을 사용합니다. XFF/x-real-ip/body/외부 internal hash는 신뢰하지 않습니다. 모든 공개 API가 이 경계를 통과한 뒤 기존 엔진에 전달됩니다. [Cloudflare 공식 헤더 계약](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)을 2026-10-02 확인했습니다. 로컬 fixture는 명시적인 dependency injection으로만 IP를 전달하며 운영 flag나 우회 endpoint로 연결하지 않습니다. 정상 User-Agent는 차단하거나 bot으로 바꾸지 않습니다. BIC/WAF edge 통과는 로컬 성공으로 증명하지 않습니다.

관전 링크는 grant 없는 `/public/{slug}`입니다. 연결 성공 후 별도 agent 링크 `#grant=...`를 표시합니다. 들어온 fragment는 최초 읽은 뒤 history.replaceState로 즉시 제거하고 페이지 메모리에서만 사용합니다. localStorage/sessionStorage/IndexedDB에 저장하지 않으며 browser가 participant를 자동 생성하지 않습니다. 받은 링크의 실제 만료는 알 수 없으므로 서버 확인이라고 표시하고, 이번 페이지에서 발급한 링크는 반환된 expires_at을 안내합니다. 만료된 발급 링크를 다시 복사하려면 새 위험 확인을 안내합니다. clipboard denial은 기존 탭·토스트·선택 가능한 code fallback을 사용합니다.

## cursor 및 읽던 위치

첫 읽기는 after 없이 서버의 최근 window를 받습니다. 이후 실제 DOM에 반영한 epoch:sequence 이후 최대20개를 읽습니다. has_more면 앞 페이지의 실제 마지막 cursor로 이어 읽고 모든 read/wait 사이 최소2초를 지킵니다. 운영 cadence 5/10초는 여기서 정하지 않습니다. 기존 retryDelay helper에 public jitter를 더하며 429 Retry-After보다 일찍 재시도하지 않습니다.

페이지 전환·pagehide에서 pending request를 abort하고 best-effort DELETE lease합니다. 즉시 TCP 회수를 약속하지 않으며 engine의 최대25초 대기회수가 최종 bound입니다. 같은 token의 wait는 순차 요청 하나뿐입니다.

LEASE_EPOCH_RESET/유효 lease 만료 시 watcher만 다시 입장하며 기존 cursor를 유지합니다. history_reset/history_gap이면 소실 안내 후 이전 DOM과 sender 목록을 지우고 서버 제한 window로 교체합니다. 이전 세대 대화를 새 것으로 합치거나 cursor를 조용히 0으로 바꾸지 않습니다. 같은 epoch/sequence 재수신은 제외합니다. 실제 메시지와 전송 경계가 맞지 않는 sequence는 정상으로 취급하지 않습니다. 논리 lease 수는 참여 연결/관전 연결로 표시하며 사람 수라고 주장하지 않습니다.

## 검증 기록

| gate | 실행 결과 |
| :-- | :-- |
| RED | 신규 adapter import 부재로 suite 실패, 구현 전 확인입니다. |
| Node 계약 | `vitest run --config vitest.public-ui.node.config.ts`: **6 passed**, 596ms입니다. HTML/MD/API 오류 분리와 GET 무admission, Origin/cookie/nonce/room/time/unchecked, 201/429, spoofIP, cursor/reset/gap/fragment입니다. |
| 실제 Workers/SQLite 통합 | `vitest run --config vitest.public-ui.config.ts`: **2 passed**, 2.94초입니다. 실제 browser adapter 확인→실제 RPC grant→participant→발신→watcher 읽기 및 빈 public storage를 검사합니다. fixture grant 발급으로 대체하지 않습니다. |
| tsc | 최초는 테스트 헤더 배열 union 추론 1건 실패, Record 배열 타입만 보정 후 **exit0**입니다. |
| 운영 구성 dry-run | `wrangler deploy --dry-run`: **exit0**, 62.17KiB/gzip16.15KiB, ROOMS/PUBLIC_ROOMS binding을 확인했습니다. 실배포는 없습니다. |
| Chromium | 최초 페이지 진입에서 Page crashed, 판정 없음입니다. 원자료를 저장했고 기존 성공 @playwright/test 및 TMPDIR로 보정1회를 실행했습니다. 1440 홈/관전/위험dialog 미체크·Escape·초점복귀/실제grant 발급까지 확인했으나 실제 clipboard denial 권한 descriptor를 하니스가 하나만 설정해 그 판정에서 중단됐습니다. 제품 clipboard 실패 또는 시각 불합격으로 세지 않습니다. false/true descriptor 둘 다 설정하는 기존 성공 패턴으로 스크립트를 고쳤으며 실행 상한 뒤 추가 재실행은 root 판단 대기입니다. 390 및 curl 메시지 UI 반영/pause/reset/gap/429/private 실화면은 아직 미확인입니다. |
| 전체 회귀 | CI 한 곳에서 실행하며 로컬 전체 회귀는 반복하지 않습니다. 기존 public 100+50 load 결과를 재사용하고 부하를 재실행하지 않습니다. |

무거운 실행은 heavy_verify runner, session당1개·worker1, timeout을 사용합니다. 브라우저는 Playwright1.63/default headless shell/고정 TMPDIR/ulimit-c0를 사용하고 전용 포트·inspector0의 foreground child를 finally에서 회수합니다. fonts/images는 전체8초 deadline, 단계 로그와 실패 기록을 남깁니다. fullPage screenshot을 scroll assertion 사이에 사용하지 않습니다.

`scripts/public-ui-browser.cjs`의 assert에 위반을 심어 실제 검출하는 SELF_CHECK_DETECTS_FAILURE를 상설 스크립트에 둡니다. 실 curl 메시지/SQLite integration과 browser-boundary controlled reset/gap/429/pagination을 구분합니다. 촬영 전에 모든 secret 표시를 가상값으로 교체하고 창작 메시지만 사용합니다. 쿠키/nonce/grant/Authorization/원시 IP/메시지 본문을 증거 로그에 저장하지 않습니다. 실제 운영 계정이나 팀 자료는 사용하지 않습니다.

## UI와 소유권

기존 room/message/person/tab/toast/copy/focus/mobile full-width invite button을 공통 소유자로 그대로 사용합니다. 홈은 승인 시안 a78acce의 rooms-section/room-grid/room-card와 반응형 구조를 사용하고 catalog 내용만 넣습니다. 가짜 대화/참가자/접속수/typing/countdown을 추가하지 않습니다. 위험 확인은 기존 native dialog/form/time-options/full button 표면·여백·타입을 복원해 내용만 바꿉니다. 연결 버튼은 기존 .btn.full로 자체 행을 사용하고 위험본문은 기존 muted 문단의 아래 여백을 상속하며 body 크기만 상속합니다. 붙어 보인 링크와 pill은 기존 full modifier로 보정했으며 continuation-1440-clipboard-denied 화면에서 각각 자체 행으로 보이는 것을 직접 확인했습니다. 추가 치수는 없습니다. CSS 치수는 승인 시안의 기존 선언을 가져온 것이며 새 px 설계값은 없습니다. 공개 안내 본문은 기존 body/notice 역할, 기능 metadata는12px 이상입니다. textContent로 title/notice/user text를 넣고 self CSP·local fonts/assets만 사용합니다.

새 UI가 관련된 실제 호출 표면은 홈 catalog, 공개 room, native 위험 dialog, 관전/agent 공유, 기존 private room 다섯 가지입니다. 1440/390 캡처는 화면 프레임 전체를 포함하며 상세 증거에 좌표와 실제 비교 판정을 남깁니다. public mode의 작은 상태는 기존 controller/retry ownership 패턴을 재사용합니다. private read/expiry/cursor와 기존 public engine3파일/test/public-*는 수정하지 않습니다.

분석 캐시 보드 문서 생성 MCP가 timeout으로 실패했습니다. 중복 생성하지 않고 이 문서로 fallback합니다. 시스템 경로는 browser catalog/watchers/ack → src/public-browser.ts → PublicRoom RPC/fetch(RAM only) → JSON epoch/sequence page → public/public-demo-session.js → 기존 Common room DOM입니다. 비공개 경로는 기존 src/index.ts → Room → public/app.js 숫자 cursor 그대로입니다. 새 정책 진입/필드는 향후 DB 설정 소유 계약, worker wire, public client label을 함께 갱신해야 합니다. 본 PR은 최종 DB 설정 정본 이전으로 보지 않습니다.

최신 디자이너 확장은 design/prototype에만 진행 중입니다. email/OTP/invite/admin 전체옵션/DEMO·HOSTED/risk/persist의 최종 visual pass와 branch+INTEGRATION을 받은 뒤 후속 통합합니다. 이번 PR은 admin/auth 독자 배치나 visual system을 확정하지 않습니다.

## 허용된 targeted continuation 결과

root가 기존 성공 환경과 두 clipboard descriptor를 확인한 뒤 남은 범위에 한해 추가1실행군을 허용했습니다. `continuation-evidence.json`과 `continuation-*.png`를 별도로 저장했고 `evidence.json`/`initial-evidence.json`은 덮지 않았습니다. 이미 확인한1440 home/hero/dialog/focus/grant는 필요한 setup만 사용하고 재판정·재캡처하지 않았습니다.

| 범위 | 새로 관측한 결과 | 미확인 범위 |
| :-- | :-- | :-- |
| 1440 | clipboard state=denied, 실패 안내와 focus/URL 선택 가능을 assertion전에 기록했습니다. 독립curl 수락 메시지를 실제 DOM에서 확인했습니다. has_more 마지막 반영 cursor, pause/resume feedTop120·pageY25 유지,429 지연1179ms, gap/reset 안내와 제한 window 교체, watcher 재입장,fragment 제거·스토리지 없음,private read-only·만료 대표화면을 확인했습니다. | clipboard 성공 권한을 따로 부여하는 경로는 실행하지 않았습니다. |
| 390 | catalog와 hero의 원본 치수,관전,native 위험dialog의 body·미체크·Escape·초점복귀·scroll lock,실제201grant,clipboard state=denied·실패 안내·URL 선택을 확인했습니다. 독립curl participant/POST 수락은 수행했습니다. | 신규curl 메시지 실화면 반영 이후 pagination/pause/reset/gap/429/fragment/private 대표 검증은 중단되어 미판정입니다. |

390에서는 이전1440 메시지와 새 메시지의 본문이 같아 하니스의 `any bubble text` 조건이 이전sequence1에서 성립했습니다. 신규curl은sequence2를 수락했지만 화면cursor는1인 상태에서 controlled page3부터 주입해 SEQUENCE_GAP을 검출하고 cursor1로 재시도했습니다. raw의390 wait after=:1 반복과 continuation-390-curl-message에 이전 발신자 로컬1440만 보이는 것을 직접 확인했습니다. 이것은 신규반영 판정기의 실제 결함이며 제품cursor가 누락을 정상으로 수용한 증거가 아닙니다. 전체 continuation은14000ms timeout, exit1로 기록합니다.1440의 PASS를390 또는 전체PASS로 확대하지 않습니다.

판정기는 sequence와 본문을 함께 확인하는 `observesMessage`로 보정했습니다. 같은 본문/이전sequence를 거부하는 상설 verifier 테스트를 추가했으며,중단 이후 브라우저를 다시 실행하지 않았습니다. 새 테스트 실행은 최종integrationCI가 담당합니다. 진입 애니메이션 도중 촬영된390 메시지 프레임은 메시지 가독성·색상 합격 증거로 사용하지 않습니다.

원자료와 캡처는 워크스페이스 상대경로 `.local/artifacts/20261002-1342-toktok-public-ui/`에 있습니다.1440은 연결버튼과 HTTP 링크가 분리되고 나란한 conversation/sidebar 위쪽끝이 동일하며 기존private틀과 만료·관전표시가 유지되는 것을 눈으로 대조했습니다.390의 native dialog는 실제viewport에서 본문/체크/버튼이 겹치지 않고 버튼이 전폭이며 원본same-content dialog와 폭·여백·본문을 대조했습니다. 모바일 이후본문·스크롤 동작은 미판정입니다.

최종 integrationCI는 초기head0123ae63에서 SUCCESS를 직접 조회했습니다. 제품코드는 이후 변경하지 않았으며 continuation 하니스·판정기·검증 문서만 보완했습니다. 새headCI 결과는 PR checks에서 확인합니다.

## 좁은 mobile gate 보정 결과

root가 text-only 판정기 결함을 직접 대조한 뒤 아직 미검증인390 pagination/pause/reset/429/fragment/private 대표만1실행군을 허용했습니다. `TOKTOK_BROWSER_SCOPE=mobile-remaining`으로1440은 실행하지 않고390 home/hero/dialog/clipboard도 준비 동작만 사용했으며 재판정·재캡처하지 않았습니다. 별도 `mobile-remaining-evidence.json`과 `mobile-remaining-*.png`를 저장했습니다. 제품코드는 변경하지 않았습니다.

viewport별 창작본문과 response sent.sequence의 DOM 본문이 모두 맞아야 신규curl 반영으로 판정하도록 보정했습니다. 제어 페이지 설치 전에 expectedSequence=actualDOMSequence=1과 textMatches=true,그 메시지의 cursor를 다음 GET wait의 after에 사용한 관측을 JSON에 저장했습니다. 이후 pagination,has_more,pause/resume,429,gap/reset·watcher 재입장,fragment 제거·persistent storage 없음,private read-only·만료 대표화면을 확인했습니다. `390_PASS`와 `TOKTOK_PUBLIC_UI_BROWSER_PASS`,exit0입니다.이 PASS는 좁은 mobile gate만 뜻하며 앞선1440 gate는 별도 continuation 증거를 재사용합니다.

## 재개를 위한 보존 인계

| 항목 | 위치 또는 상태 |
| :-- | :-- |
| 브랜치/HEAD 정본 | `origin/feat/public-demo-ui`,PR #4 head입니다. 제품코드 기준은0123ae6300c2773c72d693fb2cab988a8c12ed2a이며 이후 커밋은 하니스·verifier·문서 보완입니다. 최종 보존 SHA는 PR commit 목록과 세션 보고에서 확인합니다. |
| managed WT | `.projects/toktok--feat-public-demo-ui-88d40ab1`,관리ID940e8bca-bdb3-4fcb-bce5-a9dd15cc3065입니다. 삭제하거나base checkout을 바꾸지 않습니다. |
| 완료gate | node계약6/실제DO통합2,CF-IP보정targeted1/5skipped,tsc 보정exit0,production dry-runexit0,1440및390 실제/controlled 범위 위 기록,독립 정적·보완프레임 검수입니다. 제품head0123 CI37016038605 SUCCESS를 직접 확인했습니다. |
| 실패gate와 보정 | 초기 Chromium page.goto crash→기존성공 모듈/TMPDIR로 해결,clipboard descriptor 하나 설정→false/true 두 개로 해결,text-only 신규curl 판정→sequence+고유본문 및 다음 GET after 관측으로 해결했습니다. 이전 원자료를 그대로 보존합니다. |
| mock QA 산출물 | `.local/artifacts/20261002-1342-toktok-public-ui/`의 initial/evidence/continuation/mobile-remaining JSON 및PNG입니다. secret표시는가상값,본문은창작이며 실제계정·원시credential을 저장하지 않았습니다. |
| 아직안한것 | merge,배포,운영edge BIC/WAF 통과,계정·DNS·secret 변경,실운영메일/OTP/admin발급,새DEM0/HOSTED 정책,DB정본설정·관리자UI,새private메모리계약,self-host 이식입니다. clipboard성공권한별도부여·실모델두개시험·물리TCP즉시회수도 주장하지 않습니다. |
| 후속필요입력 | root의typedDB 설정/인증소유계약,최종designer branch+INTEGRATION,email/OTP/invite/admin·2mode·risk/persist 최종화면,후속runtime/DB adapter 이식설계입니다. |

최신 사용자 추가목표는 Cloudflare 배포를 유지하며 self-host SQLite 기본과 기존Postgres DSN 설치를 지원하는 것입니다. runtime과DB adapter를 분리하고 DEMO/HOSTED·설정·OTP·초대·retention·cursor·throttle 계약을 동일하게 유지합니다. root가 별도 이식 설계를 정리하므로 이번 owned 파일을 재구조화하지 않았습니다.04KST 재개예약과잔여0% 안내에따라 허용foreground만 회수하고보존합니다. 새runtime/전체검증반복/환경설치는 수행하지 않습니다.
