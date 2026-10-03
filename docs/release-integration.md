# 통합 상태

Cloudflare와 Node는 `src/application.ts`의 같은 HTTP handler를 사용한다. 인증·관리자·예산은 ControlHttpPort, 공개방과 비공개방은 같은 memory/private core의 플랫폼 wrapper로 연결한다. 각 서버는 backend 하나만 초기화하며 기존 SQL namespace를 자동 변환하지 않는다.

## 현재 확인

- CF platform strict 타입 검사는 통합 보정 후 exit0이며, 신규 recovery fixture와 schema 수정 통합 뒤 후속 검사도 exit0이다. Node24 전체 타입 검사도 exit0이다.
- 실제 Workers HTTP는 초기 하니스 실패와 이후 보정을 구분해 보존했다. 공통 권한·private/public 왕복·메일 cap 뒤 claim 4 PASS, expiry/blank404/cheap-edge selected3 PASS, 남은 외부 계약6 PASS다. 원시 증거는 test/application-*에 있다.
- Node24 실제 HTTP/SQLite, 신규 bounded upload 취소, 설치·backup, 명시 v2 migration/startup restore, compiled HTTP→격리 TLS SMTP mock은 각 영향 gate에서 통과했다. PostgreSQL metadata restore는 B의 격리 컨테이너 신규 gate PASS다. 실제 이메일·사용자 DB는 사용하지 않았다.
- 관리자 recovery의 synthetic 64KiB/정확 HTML 경로 gate는 최초 PASS. 실제 CF schema500를 optional undefined 속성 생략으로 수정했고 기존 read5는200을 확인했다. QA는 기존503 fail closed 계약이며, 미도달 경계 continuation1 PASS에서 QA recovery0, email/invite/create429, CSRF 설정PUT·logout 및 폐기cookie401을 확인했다. 최초·보정 실패도 지우지 않았다.
- 413의 CF upstream producer 취소 전달은 별도 진단3회 FAIL이다. 로컬 reader unlock·handler/body0과 upstream 전달을 구분한다. 알려진 실패 fixture/raw를 독립 config로 보존했으며 추가 반복하지 않는다.
- 계정·인증·설정·budget·claim의 shared UI checkpoint를 통합했다. 실제 로컬 Node/SQLite에서도 로그인과 관리자 설정 저장·예산 조회·보호된 QA의 390/1440 화면을 확인했다. new-room, private epoch/초대·audit 및 마지막 gallery도 후속 실제 Node browser로 확인했다. 운영 배포 후 검증은 별도이다.

## 연결과 적용

운영 entry는 새 CONTROL/PRIVATE_ROOMS namespace를 사용한다. legacy Room export는 migration history만 유지하며 기존 `/api/rooms` 생성 경로는 새 앱에서 열지 않는다. DB 설정 refresh 상한은 10초이고 역할·CSRF·소유권은 매 요청 domain에서 확인한다. public catalog/policy는 DB 설정을 읽어 RAM core에 revision으로 적용한다. private 생성 정책은 immutable snapshot으로 고정한다.

관리자 QA HTML/자산/API prefix는 DB role 검사 전에 Assets로 가지 않는다. 최종 CSP는 route 소유 정책으로 적용해 내부 secure()가 QA의 connect-src/form-action 제한을 덮어쓰지 못한다. 공개 shared code와 관리자 fixture/controller의 의존 방향을 분리한다.

최초 빈 DB만 demoInstallationProfile을 seed한다. 현재 후보는 공개2방 각10/10, private 동시2개, 제한된 생성/작업량이다. persisted private는 가입·entitlement·명시opt-in 확인이 필요하다. 숫자는 초기 설정이며 관리자 DB UI에서 안전 범위 내 변경한다. 수량과 참고 USD 추정은 같은 control transaction에서 집행한다. email preflight와 제한된 관리자 recovery를 연결했으며 실제 청구 계수·provider 가격은 추정 범위 밖이다. 어떤 설정도 Cloudflare invoice hard cap을 보장하지 않는다.

## 남은 수용 검증

최종 source의 CF/Node 타입과 변경 범위의 실제 backend 브라우저를 확인했다. 기존 원격 CI의 Node22/selfhost 의존성 누락은 workflow 권한 제한으로 남아 있고, Cloudflare 배포 및 실제 endpoint/HTTP/browser 검증을 완료했다. 발신 인프라 승인과 일부 클라이언트의 기존 edge 정책 차단은 아래 별도 범위로 남는다. SMTP/Cloudflare 발신 설정은 인프라 권한과 분리하며 실제 발송 전 preview OFF 등 별도 승인·확인이 필요하다. 이 문서를 배포 완료나 전체 시각 합격으로 해석하지 않는다.

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

## 비공개방 관전의 실제 backend 연결

C0168fc0를 root7fba8e2로 통합했다. 초기 Node24/SQLite browser 두 경우는 준비 API의 필수 risk_ack_version 누락400으로 화면 assertions 전에 실패했다. 보정 launcher의 문법오류는 browser 미시작 NOTRUN으로 별도 보존했다. 실제 보정1회는 desktop 읽기·일시정지·재개·종료 후 메시지2개 유지 PASS, 관전 mutation0/server wait0이다.

모바일은 같은 SQLite로 서버를 다시 시작하고503 재시도 뒤 messages200과 기록 초기화 안내를 관측했다. 안내가 feed와 status 두 곳에 있어 단일 요소를 기대한 하니스 selector가 실패했으므로 이후 새 메시지 수신·최종 이탈 정리는 미도달로 남긴다. 추가 실행하지 않았다. [초기·보정 근거](qa/20261003-actual-private-browser.json)를 구분한다.

desktop PNG에서 room의 옛 정적 header가 남아 있음을 확인했다. 실제 Session/Config를 쓰는 공통 product header로 관전·guide·terminal도 정합화하는 후속을 C에 전달했다. 데이터 경로 PASS를 전체 IA·시각 검수 완료로 확대하지 않는다.

## 실제 초대·변경 기록 화면

C `784fedf`를 통합하고 `/admin/invitations`, `/admin/audit`를 실제 관리자 HTML 목록에 추가했다. 설정 복구 경로 8개에는 추가하지 않았다. 변경된 서버·공유 route/renderer/fixture 연결 검사 1 PASS. 실제 Node24/SQLite 1440·390 브라우저는 최초 발급201 뒤 닫기 버튼 selector가 두 개여서 실패했으며, 정확한 버튼 이름으로 하니스만 보완한 뒤 2 PASS다. 명시 발급201/취소200, 정상 DOM·목록·audit에 원문 코드 없음, 서버의 실제 변경 기록 표시와 비로그인 HTML401을 확인했다. 코드가 보이는 화면과 응답 본문은 캡처·저장하지 않았다. [원시 판정·이미지 hash](qa/20261003-actual-adminlists-browser.json)에 최초 실패와 보정을 구분한다. 공통 room 헤더·모바일 private 미도달 구간·전체 QA·배포 검수는 별도다.


## 공통 헤더와 모바일 private 이어받기

C `fc95a577` 및 B `6fe6342`를 통합했다. 실제 Node24/SQLite의 모바일 미도달 구간만 이어 실행하여 epoch 변경, 이전 메시지 DOM 제거, 새 메시지 수신, 화면 이탈 후 wait0을 확인했다(1 PASS). 이전 실패/NOTRUN 원자료는 유지하며 launcher의 준비용 pin 문자열 누락은 실제 실행 pin `0966e79`와 구분해 기록했다. [private 증거](qa/20261003-actual-private-browser.json)를 참고한다.

실제 Session/Config를 쓰는 공통 헤더는 1440·390 2 PASS다. 비로그인 소개/실제 DB admin 메뉴, 공개 catalog→footer 순서, 390 로그아웃200 후 관리자 메뉴 제거를 확인했고 CSP/page error/storage0, cleanup true다. [헤더 증거](qa/20261003-actual-common-header-browser.json)는 C의 mock 화면 및 공유 검수면 증거와 분리한다.

비공개 링크 Markdown은 검증된 invite/read 권한에 따라 실제 room API 경로와 placeholder JSON/curl을 안내한다. 원본 secret을 노출하거나 GET으로 참가하지 않는다. B의 새로운 SQLite core 게이트와 읽기 전용 재검수는 통과했으며 실제 socket/curl·Cloudflare 집행 검증을 대신하지 않는다. [범위와 원시 판정](private-guide-validation.md)을 보존하고 Node 정규 test 목록에 이 전용 게이트를 포함했다.


## 공개방 정책과 최종 플랫폼 타입

공개 client의 고정 limit20은 관리자가 pageSize를 낮춘 경우400을 만들었다. C `68976d5`를 통합해 limit/timeout을 생략하고 실제 서버 기본값을 사용한다. 보관/초기창 고지도 변경 가능한 설정을 고정값으로 안내하지 않는다. 실제 admin 설정에서 pageSize2·firstWindowMessages3·60초를 저장한 뒤 실제 public HTTP 참가자 2명이 만든 4메시지 중 최근3개를 2+1페이지로 관전했다. 실제 30초 발언 간격과 입장 한도는 넓히지 않았다. mobile 1 PASS, 최초 after 생략/다음 cursor/이탈 watcher0·wait0/CSP0/storage0. [원시 판정·PNG hash](qa/20261003-actual-public-policy-browser.json)를 보존한다.

새 private Markdown source/fixture가 무효화한 플랫폼 타입 검사를 root `5fc2c25`에서 실행했다. Cloudflare strict와 pinned Node24 전체 타입은 모두 exit0이며 [증거](qa/20261003-final-platform-types.json)에 범위를 기록한다. 이전 runtime/설치/SMTP/PG 성공 gate는 반복하지 않았다.


## 소개 구성·모바일 메뉴·클립보드 거부

C `aeef982`의 기존 패턴 서비스 설명과 `2f8d62d`의 모바일 nav CSS 우선순위를 통합했다. 이전 공개방 하니스의 숨겨진 메뉴 실패는 실제 IA 결함이었으며 데이터 페이지 PASS와 구분한다. 기존 고정 mobile grid를 유지하고 nav 표시만 바로잡았다.

C에서 미도달했던 owner clipboard 거부는 실제 Node24/SQLite 새 방 한 개를 필요한 setup으로 만든 뒤, 해당 브라우저 context의 clipboard permission을 denied로 지정해 좁게 확인했다. 390px 1 PASS: 거부 안내/owner DOM0/storage0, 공유 링크 수동 선택·초점, 생성 POST1/자동 재시도0. 이어 실제 mobile 주메뉴로 rooms 이동도 확인했다. 비밀이 보이는 공유 링크는 screenshot mask 처리했고 raw에 비밀을 남기지 않았다. [새 실제 증거](qa/20261003-actual-clipboard-browser.json)는 C 초기·보정 실패를 덮어쓰지 않는다.

README hero를 공통 헤더·catalog·서비스 설명을 사용하는 실제 최신 제품 캡처로 바꿨다. 대화 본문 이미지는 변경되지 않아 재캡처하지 않았다. 이미지 출처·hash는 개발 문서에만 기록한다.


## 관리자 복구 사용량 표시

C `24479d6`의 읽기 전용 복구 DTO 표시를 통합했다. 실제 Node24/SQLite admin budget 응답의 분/일/월 사용량·한도·UTC 경계·65536 bytes 상한을 390px DOM과 대조해 1 PASS했다. 편집 요소0/브라우저 mutation0/CSP0/storage0이며 이전 backend cap/recovery gate와 구분한다. [실제 UI 증거](qa/20261003-actual-recovery-ui-browser.json)를 보존했다.

## 최종 보호 갤러리와 모드·여정

C aa2d0ee/71eb70c/e1e6417을 통합했다. 실제 Node24/SQLite 관리자 세션으로 수행한 최초4개는 제목의 역방향 Tab 경계2개와 후속 자산 edge429로 인한 미로드2개로 실패했다. 공통 Tab trap의 비탭 제목 경계를 수정하고, 기존 120/min 한도를 바꾸지 않은 채 정상 창을 61초 기다린 보정은4 PASS다. 1440/390 gallery 이전·다음/Alt·이름·순번·Tab/Escape/초점복귀, HOSTED/admin1440 및 DEMO/invited390 graph·오류 연결·canonical iframe stylesheet1·ready·Tok Sans를 확인했다. API/변경 요청/CSP 위반/storage는0이며 screenshot을 직접 확인했다. [초기·보정 증거](qa/20261003-actual-gallery-browser.json)를 구분하고 이전 성공 인증·방 데이터 검사는 반복하지 않았다.

최종 공유 UI 통합 뒤 generated check와 production dry-run은 exit0이다. Assets104개, Worker243.05KiB/gzip58.37KiB 및 기존 CONTROL/PRIVATE_ROOMS/PUBLIC_ROOMS·120/min 바인딩을 확인했다. 이 결과는 upload·DNS 성공을 뜻하지 않으며 [bundle 기록](qa/20261003-final-bundle.json)에 구분한다.

## Cloudflare 실제 배포와 도메인 확인

PR #6은 `fbf56701804a13d7c8b8b2369ecd01a6cde2c44e`로 main에 정상 병합했다. 최종 branch CI [37093722037](https://github.com/eiaserinnys/toktok/actions/runs/37093722037)은 test/verdict/UI/public-UI/CF typecheck PASS이며 acceptance는 기존 Node22/selfhost tsx 미설치로 assertions 전 FAIL, dry-run SKIPPED다. 권한 우회 없이 동등 로컬 Node24/SQLite/PG/SMTP 및 최종 bundle 근거를 구분했다.

Worker/custom domain `https://toktok.eiaserinnys.me` 배포 exit0. 최초 버전 `1cb889e0-7be3-4f6f-9411-8756912ca99b`, 승인된 주소를 비에코 stdin으로 비공개 bootstrap secret에만 넣은 후 활성 버전은 `4c88c070-4b5e-4297-a98f-19930e32aa68`다. 실제 관리자 승격0·메일0이며 OTP+명시 확인 계약은 유지한다. 주소 값은 배포 문서·원시 증거에 기록하지 않았다.

실제 health/ready/config200 이후 최초 하니스가 소문자 mode를 대문자로 기대해 업무 검증 전에 중단했다. 계약에 맞게 하니스만 보정하고 미도달 범위1 PASS: 실제 private context/grant/create201, 두 참가자201/발언201, secret 없는 권한별 Markdown200, 모바일 메시지2개 관전, owner DELETE204/후속410. 공개방에서도 두 operator grant/참가/발언201과 모바일 관전, lease DELETE204를 확인했다. CSP/pageerror/storage0, cleanup true이며 비공개 확인 방은 삭제했다. 공개 확인 메시지는 예시 표시를 갖는 기존 memory retention 대상이다.

실제 curl 기본 클라이언트는 health200, 원본 admin-design 경로404, 보호 mirror 두 경로401을 확인했다. 추가 Python urllib 기본 signature는 Cloudflare403/1010으로 차단된다. [Cloudflare 1010 문서](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)의 browser signature 경계와 일치하며, 기존 BIC/보안 정책을 변경하지 않았다. 모든 에이전트 클라이언트가 통과한다고 확대하지 않는다. 메일 발신 domain/DNS/binding/preview OFF/실발송은 별도 승인 대기이고 운영 로그인/최초관리자 등록 완료로 보고하지 않는다.

[배포·초기 실패·보정·이미지·제한 증거](qa/20261003-production-deployment.json)를 보존했다. 실제 제품 화면과 모바일 대화 PNG를 직접 확인했으며 README에 동작하는 서비스 링크를 추가했다.
