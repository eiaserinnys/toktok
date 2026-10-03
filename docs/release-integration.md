# 통합 상태

Cloudflare와 Node는 `src/application.ts`의 같은 HTTP handler를 사용한다. 인증·관리자·예산은 ControlHttpPort, 공개방과 비공개방은 같은 memory/private core의 플랫폼 wrapper로 연결한다. 각 서버는 backend 하나만 초기화하며 기존 SQL namespace를 자동 변환하지 않는다.

## 현재 확인

- CF platform strict 타입 검사는 통합 보정 후 exit0이며, 신규 recovery fixture와 schema 수정 통합 뒤 후속 검사도 exit0이다. Node24 전체 타입 검사도 exit0이다.
- 실제 Workers HTTP는 초기 하니스 실패와 이후 보정을 구분해 보존했다. 공통 권한·private/public 왕복·메일 cap 뒤 claim 4 PASS, expiry/blank404/cheap-edge selected3 PASS, 남은 외부 계약6 PASS다. 원시 증거는 test/application-*에 있다.
- Node24 실제 HTTP/SQLite, 신규 bounded upload 취소, 설치·backup, 명시 v2 migration/startup restore, compiled HTTP→격리 TLS SMTP mock은 각 영향 gate에서 통과했다. PostgreSQL metadata restore는 B의 격리 컨테이너 신규 gate PASS다. 실제 이메일·사용자 DB는 사용하지 않았다.
- 관리자 recovery의 synthetic 64KiB/정확 HTML 경로 gate는 최초 PASS. 실제 CF schema500를 optional undefined 속성 생략으로 수정했고 기존 read5는200을 확인했다. QA는 기존503 fail closed 계약이며, 미도달 경계 continuation1 PASS에서 QA recovery0, email/invite/create429, CSRF 설정PUT·logout 및 폐기cookie401을 확인했다. 최초·보정 실패도 지우지 않았다.
- 413의 CF upstream producer 취소 전달은 별도 진단3회 FAIL이다. 로컬 reader unlock·handler/body0과 upstream 전달을 구분한다. 알려진 실패 fixture/raw를 독립 config로 보존했으며 추가 반복하지 않는다.
- 계정·인증·설정·budget·claim의 shared UI checkpoint를 통합했다. 실제 로컬 Node/SQLite에서도 로그인과 관리자 설정 저장·예산 조회·보호된 QA의 390/1440 화면을 확인했다. new-room도 후속 실제 Node browser로 확인했으며 private epoch/초대·audit/전체 검수면과 운영 배포 후 합격은 남는다.

## 연결과 적용

운영 entry는 새 CONTROL/PRIVATE_ROOMS namespace를 사용한다. legacy Room export는 migration history만 유지하며 기존 `/api/rooms` 생성 경로는 새 앱에서 열지 않는다. DB 설정 refresh 상한은 10초이고 역할·CSRF·소유권은 매 요청 domain에서 확인한다. public catalog/policy는 DB 설정을 읽어 RAM core에 revision으로 적용한다. private 생성 정책은 immutable snapshot으로 고정한다.

관리자 QA HTML/자산/API prefix는 DB role 검사 전에 Assets로 가지 않는다. 최종 CSP는 route 소유 정책으로 적용해 내부 secure()가 QA의 connect-src/form-action 제한을 덮어쓰지 못한다. 공개 shared code와 관리자 fixture/controller의 의존 방향을 분리한다.

최초 빈 DB만 demoInstallationProfile을 seed한다. 현재 후보는 공개2방 각10/10, private 동시2개, 제한된 생성/작업량이다. persisted private는 가입·entitlement·명시opt-in 확인이 필요하다. 숫자는 초기 설정이며 관리자 DB UI에서 안전 범위 내 변경한다. 수량과 참고 USD 추정은 같은 control transaction에서 집행한다. email preflight와 제한된 관리자 recovery를 연결했으며 실제 청구 계수·provider 가격은 추정 범위 밖이다. 어떤 설정도 Cloudflare invoice hard cap을 보장하지 않는다.

## 남은 수용 검증

후속 변경의 최종 타입·CI, 새 shared auth/admin/private 화면·registry·390/1440 실제 backend 브라우저, Cloudflare 배포 후 endpoint/HTTP 및 challenge 검증이 남는다. SMTP/Cloudflare 발신 설정은 인프라 권한과 분리하며 실제 발송 전 preview OFF 등 별도 승인·확인이 필요하다. 이 문서를 배포 완료나 전체 시각 합격으로 해석하지 않는다.

## 2026-10-03 공통 경로 추가 관측

- A 실제 Workers 통합 최초6개는 초기화 하니스 오류로 assertions 전에 실패했다. 보정은4 PASS/2 FAIL. 이후 빈 schema404 제품 보완과 expiry assertion/Response 소비 보정, 새 cheap-edge/admin 계수의 selected3 PASS/4 SKIP를 보존했다. 추가6개 외부 계약은 첫6 PASS이며 별개이다. 각 원시 JSON/log는 test/application-runtime-* 및 test/application-remaining-initial.*에 있다. remaining 전체 로그의 workerd request-stream 경고는2건이며 특정 요청으로 동적 귀속하지 않았다. 후속 조사가 남는다.
- Node24 SMTP adapter는 private config 파일, TLS 검증, 오류 비노출과 shared OTP template를 사용한다. 단위2 PASS 및 실제 compiled Node HTTP→격리 loopback TLS SMTP fixture1 PASS. 외부 메일은 발송하지 않았다. Node strict typecheck exit0은 이 SMTP 변경 시점이며 이후 통합 코드의 최종 확인은 별도이다.
- 새 Node 설치 fixture 처음은 esbuild 실행 방식과 옛 control seed 가정 때문에 실패했다. 보정 설치/backup1 PASS. Node HTTP는 새 unused body cancel이 Readable.toWeb과 경합해 ERR_INVALID_STATE 및 180초 runner timeout을 남겼다. root bounded request stream adapter 수정 후 신규 업로드 거절/다음 요청1 PASS(61ms), 영향받은 Node HTTP1 PASS(3169ms). 최초 결과를 삭제하거나 전체 Node gate 성공으로 쓰지 않는다.
- A28e12caf 추정 장부, B12047f3 close/delete, C893d4f3 shared auth/settings를 통합했다. 설치 seed는40/60/100 USD 경고/차단/목표이며 DB 기존 설정은 덮지 않는다. 추정 장부는 invoice가 아니며 Node 운영비를 계산하지 않는다.
- CI를 CF와 Node로 분리하는 중이다. 새 CF 전체 타입 첫 실행은 schema union, 새 fixture helper import 및 구형 Env 관측 타입 오류를 검출했다. 수정 후 결과는 별도 기록한다.

- 후속 CF platform strict 보정 exit0. Node v2 host 연결 새1 PASS(87ms): exact v1은 check/apply/start에서 MIGRATION_REQUIRED, 명시 migrate 후 prepare가 오래된 본문·중복행을 정리하고 ready503→200. B 읽기 전용 host delta 검수 PASS.

- GitHub가 workflow scope 없는 기존 PAT의 `.github/workflows/ci.yml` 변경 push를 거절했다. 권한 확대를 하지 않았고 변경안은 `development/ci-workflow-proposal.yml`에 보존한다. 원격 CI는 종전 Node22/단일 job이므로 제안된 Node24·PG·SMTP matrix가 실행됐다고 보고하지 않는다.

## 현재 원격 CI와 workflow 권한

제품 pin `8e371afc600840b47d78d435c20bccbd8fb05b73`의 [run37086166901](https://github.com/eiaserinnys/toktok/actions/runs/37086166901)은 기존 Node22 workflow에서 test/verdict/ui/public-ui/CF typecheck PASS, acceptance는 selfhost tsx 미설치로 FAIL, dry-run SKIPPED다. 새 Node24·SQLite/PG·SMTP job는 원격에서 실행되지 않았다. 정확한 proposal/pin/diff와 사용자 반영 절차는 [workflow 인계](development/ci-workflow-adoption.md)에 있다. 기존 연결의 workflow 권한을 임의 확대하거나 다른 credential로 우회하지 않는다.

로컬 production `pnpm dry-run`은 schema optional-property fix와 account shared UI 통합 뒤 exit0이다. Worker234.08KiB(gzip55.64KiB), Assets74파일 및 CONTROL/PRIVATE_ROOMS/PUBLIC_ROOMS binding을 확인했으며 실제 upload/운영 변경은 하지 않았다. 통과했던 HTTP·Node 설치 검사는 workflow 권한 문제만으로 재실행하지 않았다.

## 실제 관리자 브라우저 연결

로컬 Node24·SQLite와 실제 ControlCore/HTTP를 사용한 최초 실행은 로그인 및 데스크톱 설정 2 PASS, QA 자산 요청 한도 및 뒤따른 모바일 3 FAIL이었다. 미리보기마다 제품 CSS와 중복된 보호 CSS를 요청해 정상 검수 화면 자체가 요청 한도를 소진했다. C7e17a2d의 canonical stylesheet 단일 연결·준비 완료 관측을 통합했으며 요청 한도·권한·캐시 정책은 변경하지 않았다.

실패했던 세 구간만 보정 1회 실행하여 3 PASS/0 FAIL, exit0을 회수했다. 1440×1000과 390×844의 QA 각각 53 iframe이 CSS1개·Tok Sans·ready=true/error없음을 보였고 HTTP/CSP/page 오류0, API 호출 및 mutation0이었다. 모바일 설정은 검토 Escape로 초안을 유지하고 명시 저장 1회로 실제 DB revision+1, budget 조회를 확인했다. PNG를 직접 대조해 스타일 적용과 모바일 검토창의 여백·글자·버튼을 확인했다. 이는 전체 gallery/keyboard 검수 완료가 아니다.

테스트 OTP 발송은 메모리 fake sender만 사용했고 관리자 지정은 실제 OTP session 뒤 bootstrap API fixture로 수행했다. 실제 운영 계정·외부 메일·bootstrap UI 검증을 뜻하지 않는다. 브라우저·서버는 모두 종료했고 최초 실패와 보정 원자료는 덮지 않았다. [증거 색인](qa/20261003-actual-admin-browser.json)에 각 결과와 원본 PNG/JSON 해시를 보존한다.

후속 [CI run37087197519](https://github.com/eiaserinnys/toktok/actions/runs/37087197519)은 서버 test/verdict PASS, UI 70 PASS/1 FAIL이었다. account mock이 공유 session을 변경해 다음 사례를 오염시킨 원인이며 C7e17a2d에서 test getSession만 structuredClone으로 격리하고 영향 파일의 3개 사례가 통과했다. 이 수정의 새 원격 CI는 별도 확인하며 기존 workflow의 Node24 설치 누락도 여전히 구분한다.

보완 후 원격 `f7f7ba214ef6726f2432c65cc043ec8ffe127920`의 [run37088028128](https://github.com/eiaserinnys/toktok/actions/runs/37088028128)은 test/verdict/UI/public-UI/typecheck 모두 PASS다. acceptance는 Node22.23.3에서 selfhost tsx 미설치로 assertions 전에 ERR_MODULE_NOT_FOUND, dry-run SKIPPED다. 계정 fixture 오류는 해소됐으며 기존 workflow의 설치 누락을 제품 HTTP 실패와 구분한다. 승인되지 않은 workflow 권한 변경이나 대체 credential 사용은 없다.

## 실제 계정 연결·방 생성 브라우저

C5d6618e를 root e8d22be로 통합하고 `/about`·`/new-room`을 포함한 실제 HTTP HTML 목록과 shared route/renderer/fixture의 누락 검사 1 PASS를 회수했다. 관리자 HTML dispatch 목록을 명시했고 미등록 관리자 경로는 인가 뒤404로 닫는다. 복구용 설정8경로는 별도 목록으로 유지해 후속 초대·감사 화면에 예외가 넓어지지 않게 한다.

새 로컬 Node24/SQLite browser 첫 실행은 claim/account 1440·390 각 PASS, anonymous memory 생성1440 및 초대 계정 persist 생성390 각 PASS다. 실제 승인 후 agent 상태, 취소 다이얼로그 Escape·초점 복귀, 명시 revoke를 검증했다. 생성은 기본 OFF와 권한 없는 persist 차단, 명시 체크, context→grant→create201, 실제 metadata의 retention mode, owner DOM·storage0 및 생성 POST1회를 확인했다. 외부 메일0이며 테스트 sender만 사용했다. 이전 auth/admin/QA 성공 구간은 반복하지 않았다.

PNG에서 두 viewport의 claim 체크박스와 모바일 계정, 비보관·보관 생성 폼을 직접 확인했다. 모바일 full-page 생성 캡처에는 키보드 초점 뒤 skip-link overlay가 함께 찍혀 있어 시각 관측 범위로 남긴다. 이 실행은 전체 역할×viewport 조합이나 owner clipboard denied 검증이 아니다. C mock correction의 clipboard permission prompt/denied assertion 실패와 원자료는 그대로 유지한다. [증거 색인](qa/20261003-actual-identity-creation-browser.json)에 판정, 범위, PNG/원시 JSON 해시를 보존한다.
