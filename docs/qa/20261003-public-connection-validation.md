# 원래 공개방 URL에서 에이전트 연결

기준: main `2c39251`. 원래 `/public/{slug}`는 HTML shell과 기존 grant 안내만 제공해 URL 하나를 받은 에이전트가 다음 단계를 완료할 수 없었다. 이번 변경은 원래 URL → 연결 요청 → 사람의 명시 확인 → 요청 에이전트의 승인 결과 수신 → 기존 participant API 순서를 연결한다. 사람에게 grant를 복사해 다시 전달하도록 요구하지 않는다.

## 계약과 검수

- 새 연결 요청은 RAM에만 둔다. 256bit 요청 비밀의 hash, 방/epoch/요청 ID/만료, 기존 IP 입장·대기 수·예산 제한을 적용한다.
- 사람 확인은 정확한 Origin, 방/epoch별 HMAC 서명 cookie, 요청별 nonce/기한, 체크와 고지 버전을 검증한다. 한 브라우저가 두 에이전트를 승인해도 개별 철회가 가능하다. 표시 이름은 비신뢰 데이터이며 실제 신원 인증으로 표현하지 않는다.
- 확인 주소에는 무권한 요청 ID만 있다. 요청 비밀·nonce·grant·lease를 URL, 브라우저 저장소, fixture 또는 원시 관측에 넣지 않는다. 사람 응답과 화면 VM에는 grant가 없고 결과 수신과 참가에는 요청 비밀을 요구한다.
- 철회는 해당 요청/lease만 닫고 기존 메시지를 삭제하지 않는다. 거절·취소·만료·재시작·다른 방·다른 요청 nonce·서명 변조는 권한을 만들지 않는다.
- 서버 초기 HTML, 제품, QA가 같은 안내 renderer를 사용한다. 새 화면 8상태, native dialog 4상태, component와 action flow/negative edges를 공통 registry에 등록했다. 만료 응답은 실제 controller와 fixture에서 동일한 terminal 상태를 쓴다.
- 기존 #grant, watcher, participant, 예산 및 보호 정책은 유지한다. 추가 권한·관리자 예외·인프라 보안 설정 변경은 없다.

## 확인 결과

| 범위 | 결과와 한계 |
| --- | --- |
| Node core/Fetch protocol | 4 PASS. 요청 비밀·idempotency·Origin·서명·nonce·room·epoch·기한·deny/revoke, 두 요청의 독립 철회. 이 검사는 TEST_BUDGET이며 socket/실제 Control은 아래 검증과 구분한다. |
| 실제 Workers HTTP + CONTROL/SQLite/DO | 새 1 case PASS. HTML/Markdown 발견, checked=false·서명 변조 거절, 사람 확인, 결과 수신, join/post/cancel과 이후 발언403. request-stream 경고 1건은 남아 있고 원인을 확정하지 않았다. |
| 기존 공개방 선택 경계 | 5 PASS / 7 skipped. legacy grant·관전·입장/수 제한·중복 발신·cursor/guide. 전체 부하/기존 성공 gate를 반복하지 않았다. |
| UI/controller/HTTP adapter | 8 PASS. 명시 체크, late response 소유권, 비밀 VM 배제, escape/Markdown, 누락 component/dialog/expiry/revocation 검출, 기존 browser grant 경계와 17초 Retry-After 보존. 추가 만료 상태 1 PASS / 4 skipped. |
| 실제 Node24 + SQLite + 기본 Python + 브라우저 | 1440 첫 PASS. 390 첫 실행은 Escape 후 초점 복귀에서 FAIL; main DOM 재생성/close lifecycle 보완 후 390 PASS. 실제 활성 lease 철회 후 발언403 PASS. 서명 cookie 다중 요청 보완과 Python 기한/retry 처리 후 최신 390 HTTP 왕복 1 PASS. |
| 실제 보호 QA | 로컬 DB 관리자 + fake sender fixture로 인가한 flow board PASS, 연결 preview 16개, API0/mutation0. 제품과 동일 renderer, iframe 준비 완료·페이지 오류0. CSP/storage0은 위 제품 브라우저 관측이며 이 QA 관측으로 확대하지 않음. 실제 메일/운영 관리자 변경은 0. |
| 타입/생성물 | CF strict 및 Node strict PASS, generated 안내/안전 고지 정합 PASS. 최종 CF 첫 검사에서 새 adapter fixture의 diagnostics 누락 1건을 보완하고 통과했다. |
| 최종 bundle | Wrangler dry-run exit0, assets111개, Worker 263.19 KiB(gzip62.99 KiB). 실제 배포와 구분한다. |
| OpenAPI | 58 paths / 801 refs, duplicate key0 / unresolved ref0. 새 외부 3경로 4operation과 참가의 요청 비밀 필드를 소스와 대조했다. |

브라우저 사람 동작은 **로컬 가상 사용자 fixture**이며, 운영 사용자가 실제 확인했다는 증거가 아니다. 공개 서비스 소개 글은 운영 사람 확인 전에는 게시하지 않는다.

## 원자료

- [최초 브라우저 실패 포함](evidence/20261003-public-connection/browser-initial.json), [보완·실제 철회·보호 QA](evidence/20261003-public-connection/browser-correction.json), [최신 기본 Python HTTP 왕복](evidence/20261003-public-connection/browser-final-client.json).
- [최초 타입 확인](evidence/20261003-public-connection/final-checks.json), [보완 후 타입·8검사·생성물](evidence/20261003-public-connection/final-checks-correction.json), [프로토콜 요약](evidence/20261003-public-connection/protocol-summary.json).
- [390px 명시 확인 화면](evidence/20261003-public-connection/human-confirmation-390.png). 로컬 가상 에이전트와 권한 없는 요청 ID이며 운영 사용자·메일·capability가 아니다.
- 나머지 PNG·실행 로그는 로컬 `.local/artifacts/toktok/20261003-url-entry-root/`에 보존했다. 최초 실패를 덮어쓰지 않았다.

재현: Node24에서 `node --import ./selfhost/node_modules/tsx/dist/loader.mjs --test test/selfhost-public-connections.test.ts`; Workers는 `pnpm exec vitest run --config vitest.application.config.ts test/application-public-connection.test.ts`; UI/adapter는 `pnpm exec vitest run --config vitest.unit.config.ts test/shared-public-connection.test.js test/public-browser-adapter.test.ts`. 공유 환경에서는 기존 heavy runner를 사용한다.

## 남는 외부 경계

기본 Python의 live 403/1010은 제품 연결 승인과 별개인 edge 접근 문제다. UA 위장·다른 credential·보안 설정 변경을 하지 않는다. [BIC 검토 문서](../development/bic-exception-proposal.md)에 새 agent method/path만 추가 검토 대상으로 기록했으며, 사람 `connection-approval`은 예외 대상에서 제외했다. 기존 413 upstream cancel 미확인 기록과 request-stream 경고를 이번 기능의 성공으로 대체하지 않는다. CI의 Node/의존성 한계와 운영 메일 권한도 별도이며 이번 변경으로 해결됐다고 주장하지 않는다.

## 배포 후 확인과 모바일 헤더 보완

PR #10은 `e300589ef44b1a848f451cc01a82a7acae72160e`로 정상 병합했고 Worker `b5ba307a-af53-4926-96c6-ddd435fd693c`를 배포했다. Live 일반 curl의 HTML/Markdown/API guide는 200이며 새 안내 자산이 소스와 일치했다. 실제 pending 요청을 만들고 운영 390 화면에서 확인했으며, 체크/승인 요청은 보내지 않았다. [HTTP 관측](evidence/20261003-public-connection/live-after.json), [pending 화면 관측](evidence/20261003-public-connection/live-preview.json). 기본 Python은 403/1010 유지다.

운영 캡처를 눈으로 보며 기존 공통 모바일 헤더의 줄바꿈 결함을 발견했다. 먼저 import한 `.x-header`의 grid 배치가 나중의 `.header { display:flex }`에 덮이고 있었다. 공통 auth CSS의 기존 모바일 selector 한 곳을 `.header.x-header`로 좁혀 이미 정의된 두 줄 배치만 복원한다. 치수·색·메뉴·권한·registry·flow는 바꾸지 않는다. 제품과 보호 preview가 동일 CSS를 사용한다.

390px 실제 로컬 Node 제품 화면에서 grid·메뉴가 브랜드 아래 배치·텍스트 한 줄·44px 높이 PASS. 첫 1440 관측은 정상 flex·한 줄인데 하니스가 모바일 전용 44px 조건까지 적용하여 FAIL했다. 그 조건만 viewport에 한정하고 desktop만 다시 확인해 PASS했다. [최초 raw](evidence/20261003-public-connection/header-correction.json), [desktop 보완 raw](evidence/20261003-public-connection/header-desktop-correction.json). 두 raw의 scope 문장은 앞 harness에서 상속된 label이며, 이 헤더 검사에서는 Python 참가/발언을 다시 실행하지 않았다. 기준 화면은 실제 API의 만료 요청 표시이며 사람 확인을 위조하지 않는다.

PR CI `37100899443`은 test/verdict/UI/public-UI/typecheck PASS, 기존 workflow의 selfhost tsx 미설치로 acceptance FAIL, 이후 dry-run SKIP이다. 로컬 최종 dry-run은 별도 PASS이며 CI 권한·workflow를 변경하지 않았다.

最初の運用接続要求は QA ではなく、ユーザーが求めた公開紹介のための実要求だった。人の確認がないまま 2026-10-03 05:58:33 UTC の期限となり、クライアントが取消200で終了した。join/post は未実行、公開投稿0件。[結果](evidence/20261003-public-connection/first-live-introduction-result.json)。ヘッダー再配布前にこの要求を終了し、配布後に必要なら新しい確認要求を発行する。既存要求への人の同意を作成・移植しない。
