# 안내 위계 개편 검증

2026-10-03 사용자 승인, 구현/검증 10월 3–4일(KST). 기준 main `4b3f49c7b3f3a2d3552eaec7b727bc71c25598de`.

## 적용 범위

사용자가 전문으로 전달한 [인계](../../design/notice-hierarchy/HANDOFF.md), [변경표](../../design/notice-hierarchy/notice-map.json), [catalog 계약](../../design/notice-hierarchy/catalog-contract.json), [참조 renderer](../../design/notice-hierarchy/notice-primitives.mjs), [HTML](../../design/notice-hierarchy/toktok-notice-preview.html)을 저장했다. 실제 HTML을 네트워크 없이 Chromium 390/1440으로 열고 비교했다. 참조 HTML의 중복 `approve` id 때문에 최초 캡처 선택자를 section으로 한정했다. 전달된 원본은 수정하지 않았다. 원래 인계에 없는 source-manifest를 있는 것으로 주장하지 않으며 별도 [구현 기준 SHA256](../../design/notice-hierarchy/implementation-baseline.json)을 남겼다.

소개 → 사용 설명 두 항목 → 공개 목록의 기존 IA를 유지하고, 보관/안전 설명을 footer의 native details로 이동했다. 목록, 새 방과 생성 결과, 공개/비공개 관전·연결, 로그인/가입, 소유자 확인, 내 계정, 공개 승인, 설정/예산, 관리자 초대/기록에 같은 renderer를 적용했다. 12px 설명과 14px 이상의 공개 범위·실행 위험·필수 체크·관리 키 분실·초안 손실·철회 결과를 구분한다. 오류/미지원/불확실 결과와 다음 행동은 펼침 밖에 남는다.

실제 snapshot의 보관 모드·개수·bytes·시간을 사용한다. 더 작은 서버 한도, legacy memory, persisted, unavailable을 구분한다. 새 방 입력/metadata/인증 실패/공개 승인 재렌더에서 열린 details와 필요한 입력 초점을 유지한다. 화면·방 전환에는 상태를 공유하지 않는다. 펼침은 동의를 만들지 않는다. 소개와 공개 안내의 고정 원문, machine notice/version, Markdown/HTTP, 서버 정책/권한/예산/TTL/nonce는 바꾸지 않았다. `src/`, 설치 설정, generated notice 원본의 diff는 없다.

## 실행 결과와 실패 보존

- 최초 좁은 단위 검사 27 PASS. 영향 통합 단위 검사는 126 PASS / 3 FAIL. 실패는 이동된 목록 설명 기대값 1건, 새 disclosure의 문구 형태 기대값 1건, 신규 DOM 접점을 빠뜨린 client reset test double 1건이었다. 기존 reset/cursor 검증을 유지한 채 두 파일을 보정하여 4 PASS. 전체 129개 중 실패 3건이 해소된 증거이며 전체를 다시 실행한 129 PASS라고 주장하지 않는다.
- 실제 공유 renderer 화면 **24종 × 2폭**, 다이얼로그 **9종 × 2폭**에서 넘침·summary 44px·보조 안내 12px·중요 정보 14px 이상을 확인했다. DEMO/HOSTED, 익명/회원/관리자, recent/persisted/legacy, pending/unavailable/error/gap/uncertain 상태를 포함한다. 모든 조합의 곱을 브라우저로 실행한 것은 아니다. role/mode 조합과 누락 component/transition 음성 대조는 registry 단위 검사로 분리했다.
- 200% 상당 reflow는 390/1440의 CSS viewport를 **195/720px**로 줄인 6화면 × 2폭이다. 브라우저 메뉴의 native zoom 조작으로 표현하지 않는다. 최초 CSS zoom 하니스와 좁은 화면의 실제 overflow를 분리하고, 최소폭·줄바꿈·320px 이하 header 배치를 보완했다. 최종 reflow 2 PASS.
- native Enter/Space, Tab/Shift-Tab/Escape, checkbox와 펼침의 분리, 새 방 재렌더/선택범위, 공개 승인 실패 뒤 체크 초기화·열림 유지·초점 복귀, 첫 이메일 start 성공/send 실패 뒤 열림 유지 및 다른 화면 초기화를 확인했다. 검수 스크립트의 `__name` 변환 helper, 이메일 input name, queued native close event 관측 오류는 원자료를 남기고 각각 교정했다.
- 실제 **로컬 Node24/SQLite HTTP** 비공개 생성·참가·메시지·관전·cleanup 두 폭을 통과했다. 공개 관전은 정식 watcher → metadata → history 경로에서 snapshot 안내 한 번만 표시, private footer 0, 공개 범위 14px, 연결 안내를 확인했다. 이 로컬 fixture 계정/승인을 실제 사용자 동의·운영 성공으로 해석하지 않는다. 메일 호출/운영 쓰기는 없다.
- 독립 읽기 리뷰가 실제 public route VM 누락으로 안내가 중복되는 문제, 공개 범위 12px, 첫 이메일 실패 시 flow key 변화로 펼침이 닫히는 문제를 찾았다. 세 제품 보완 후 읽기 delta에서 추가 P1/P2 없음. 실제 public/auth 후속 검사로 확인했다.
- 보호된 실제 `/admin/design/dialogues`, `/admin/design/flows`에서 native product dialog의 summary 키보드 이동·Escape 복귀와 새 action flow의 열린 details, iframe canonical stylesheet 1개/ready를 두 폭에서 확인했다. 무세션 HTML/자산 거부, fixture API mutation 0, page error 0. 연속 QA 페이지가 기존 120req/min 자산 제한에 걸린 실패를 보존했다. 제한/인가를 변경하지 않고 최초 불필요 components 로딩을 제외하고 다음 검수 페이지 전 **실제 61초**를 기다린 격리 검수가 2 PASS였다. 이 rate-limit 실패를 성공이나 단순 selector 오류로 바꾸지 않는다.
- root TypeScript, selfhost TypeScript, generated notices check, Wrangler dry-run, diff check 통과. 소스 정책에 영향 없는 UI 변경이므로 기존 부하·메일·운영 인증·413 upstream 취소 검사를 재실행하지 않았다.

[검증 요약 JSON](evidence/20261003-notice-hierarchy/verification.json)에 실행별 원시 결과와 실패 범위를 보존했다. `browser-*.log`, `*-raw.json`, 단위 JSON도 같은 폴더에 있다. full-page 캡처는 top으로 이동 후 촬영하도록 보완했다. 이전 스크롤된 full-page 캡처에서 화면 밖 skip link가 문서 중간에 합성된 것은 실제 viewport 표시 증거로 사용하지 않는다. 최종 캡처는 fictional fixture이며 운영 대화/주소/권한키가 아니다.

## 재현

`test/notice-hierarchy-browser.ts`는 Node24 + SQLite + Playwright가 필요하다. `TOKTOK_PLAYWRIGHT_MODULE`로 설치된 `@playwright/test` 경로, `TOKTOK_BROWSER_OUTPUT`으로 결과 폴더를 지정한다. `TOKTOK_NOTICE_CASES`로 `surfaces,dialogs,zoom,newroom-continuity,public-dialog-continuity,auth-error-continuity,actual-private,actual-public,actual-qa`를 나누어 실행할 수 있다. `final-captures`는 최종 시각 기록용이다. 검수는 공통 heavy runner/worker1을 사용했다. QA 페이지 간 실제 rate-limit 창 대기를 포함하므로 전체 한 번 실행보다 영향 구간 선택을 권장한다.

운영 배포/PR/CI 결과는 릴리스 후 별도로 기록한다.

## 최종 화면 (가상 데이터)

| 화면 | 390px | 1440px |
| --- | --- | --- |
| 소개 | [보기](evidence/20261003-notice-hierarchy/intro-390.png) | [보기](evidence/20261003-notice-hierarchy/intro-1440.png) |
| 새 방 | [보기](evidence/20261003-notice-hierarchy/newroom-member-390.png) | [보기](evidence/20261003-notice-hierarchy/newroom-member-1440.png) |
| 관전 / gap | [보기](evidence/20261003-notice-hierarchy/public-history-gap-390.png) | [보기](evidence/20261003-notice-hierarchy/public-history-gap-1440.png) |
| 로그인 | [보기](evidence/20261003-notice-hierarchy/auth-login-390.png) | [보기](evidence/20261003-notice-hierarchy/auth-login-1440.png) |
| 연결 확인 | [보기](evidence/20261003-notice-hierarchy/public-connection-390.png) | [보기](evidence/20261003-notice-hierarchy/public-connection-1440.png) |
| 실제 보호 QA dialog | [보기](evidence/20261003-notice-hierarchy/qa-dialog-390.png) | [보기](evidence/20261003-notice-hierarchy/qa-dialog-1440.png) |
| 실제 보호 QA action flow | [보기](evidence/20261003-notice-hierarchy/qa-flow-390.png) | [보기](evidence/20261003-notice-hierarchy/qa-flow-1440.png) |

[예산 화면](evidence/20261003-notice-hierarchy/budget-1440.png). 이전 성공 화면 전체 재실행 없이 최종 시각 기록 7화면 × 2폭을 추가했다. 이 추가 캡처를 별도 기능 성공 수로 합산하지 않는다.
