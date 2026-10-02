# 서버 control plane 계약과 재개 지점

2026-10-02. 기존 claim/OTP WIP를 보존하고 DEMO/HOSTED의 DB 설정, 관리자 bootstrap, 가입 초대 계약을 확인했습니다. 이번 control-plane 소스 구현과 새 검증은 아직 시작하지 않았습니다. self-host SQLite 기본 설치 및 기존 PostgreSQL DSN 지원 요구가 추가되었으며 runtime/DB adapter의 이식 설계는 root가 확정합니다. 현재 identity 코드를 즉석 분리하거나 새 DB 환경을 설치하지 않습니다.

## 보존 경계

| 항목 | 현재 사실 |
| --- | --- |
| 브랜치 | `feat/claim-foundation` |
| 워크트리 | `.projects/toktok--feat-claim-foundation-0ac9c22f` |
| 기존 코드 WIP | `d0470bfd8fd01a1fe19f0c42018743faa289aab6` |
| 기준 main | `2f666d689ac0dfd6f2a34c565a12a844d14ec8da` |
| 이번 추가 | 이 문서와 `modes-settings.md`만 추가합니다. |
| 현재 foreground | 이번 재개에서는 서버·브라우저·테스트 프로세스를 시작하지 않았습니다. 이전 2215 실행은 정상 회수 보고를 받았습니다. |
| 원격 보존 | 이 문서를 포함한 WIP를 같은 브랜치로 푸시합니다. 최종 HEAD와 clean 여부는 커밋·푸시 뒤 보고합니다. |

기존 WIP, 이번 추가, 미연결 후속을 분리합니다. 아직 draft PR, 단계 3 검수, 최종 head CI는 없습니다. 소스 구현 전체나 control-plane 합격을 선언하지 않습니다. 이전 OTP 보류 때 작성한 [WIP 기록](qa/claim-wip-20261002/README.md)은 당시 검증 이력이며 출시 정책은 아래 최신 두 모드 계약으로 대체되었습니다.

## 파일 소유

이번 후속의 소스 소유는 `identity-*`, `otp-store.ts`, `email.ts`, `admission.ts`, 새 `settings-schema.ts`, `settings-store.ts`, `admin-http.ts`, `invitations.ts`, 관련 `control-*` 및 auth targeted 테스트입니다. identity Env 확장은 identity 전용 타입에 둡니다. test worker에서만 새 경계를 연결합니다.

`index.ts`, `contracts.ts`, `wrangler.jsonc`, `package.json`, `public/*`, Room/PublicRoom 엔진은 이번 추가 변경 대상이 아닙니다. 기존 WIP 변경은 보존합니다. 다른 세션의 UI·공개방 워크트리는 읽기만 하며 stage하지 않습니다. root가 최종 wiring과 통합 회귀 CI, 머지·배포·워크트리 정리를 맡습니다. 실제 계정·관리자 이메일·API 키·DNS·메일 binding·실제 메일 전송은 승인되지 않았습니다.

## 설정과 저장소

Cloudflare 경로는 IdentityRegistry singleton SQLite에 설정, 관리자 role, 가입 초대, 감사 기록, human admission을 둡니다. OTP 성공과 초대 소비, 신규 human admission, flow 소비, session 발급은 같은 `transactionSync`에서 확정합니다. self-host adapter에서도 이 원자 경계를 유지해야 하며 별도 데이터베이스로 분산하지 않습니다. 구체 adapter 인터페이스와 이식 경계는 root 설계를 기다립니다.

설정 레코드는 `schema_version=1`, 정수 `revision`, `updated_at`, `updated_by`를 가집니다. DB가 처음 만들어질 때만 DEFAULT_SETTINGS를 seed합니다. 요청·재시작·재배포 때 env/default로 덮지 않습니다. 손상된 설정은 fail closed하며 조용히 초기화하지 않습니다. 알 수 없는 키, 잘못된 타입, NaN·무한·비정수, 범위와 교차 필드 모순을 거부합니다. 공개 schema metadata와 seed·적용 시점은 [모드 설정 계약](modes-settings.md)에 정리했습니다.

예산과 lifecycle readiness는 신뢰된 서버 연결 상태입니다. 일반 settings PUT으로 바꿀 수 없습니다. 예산 readiness=false일 때 deployment.enabled의 false→true를 거부합니다. 모드 변경은 lifecycle readiness=true이며 active private rooms=0일 때만 허용합니다. 이번 검증에서는 내부 저장소 fixture로만 readiness와 active_count를 설정하며 실제 계측·엔진 연결로 주장하지 않습니다.

## 관리자 API

| API | 계약 |
| --- | --- |
| `GET /api/admin/settings` | DB admin role로 현재 revision/config를 읽습니다. |
| `GET /api/admin/settings/schema` | DB admin role로 비밀 없는 typed schema metadata를 읽습니다. |
| `PUT /api/admin/settings` | `{expected_revision,settings}` 전체 payload를 검증하고 원자 revision 비교·증가를 수행합니다. 충돌은 409입니다. 성공은 새 revision/config/effect summary를 반환합니다. |
| `GET /api/admin/audit` | 최대 50개를 읽습니다. |
| `POST /api/admin/invitations` | 새 일회성 가입 초대를 만듭니다. 원문 token은 이 응답에서만 반환합니다. |
| `POST /api/admin/invitations/:id/revoke` | 미사용 초대를 폐기합니다. |
| `GET /api/admin/invitations` | 최대 50개의 id·만료·상태만 읽습니다. |
| `POST /api/admin/bootstrap` | 아래 일회 bootstrap 계약을 적용합니다. |

모든 mutation은 정확한 PUBLIC_ORIGIN, 유효 사람 session, 그 session에 결합된 CSRF, DB admin role을 요구합니다. bootstrap만 기존 admin role 대신 지정 이메일과 최초 승격 조건을 요구합니다. 읽기도 admin role이 필요합니다. `adminRoute`를 별도로 export하며 운영 연결은 후속입니다. `GET /api/config`용 안전 projection 함수/export는 공개 소비 계약이며 이번에는 test worker만 연결합니다.

감사는 actor의 opaque id, 서버 시각, action, revision, 바뀐 설정 key와 허용된 비밀 없는 값, invite id/status만 기록합니다. 이메일 기반 owner 식별자를 그대로 감사 actor로 출력하지 않습니다. token/hash/OTP/claim capability/이메일/IP/session 값과 provider 원본 오류를 감사·로그·일반 응답에 넣지 않습니다. schema에도 bootstrap 이메일, EMAIL_FROM, binding credential을 노출하지 않습니다. no-store/noindex/no-referrer/CSP-self 정책을 유지합니다.

## 최초 관리자 bootstrap

ADMIN_BOOTSTRAP_EMAIL은 UI 설정이 아닌 별도 승인된 infra 입력이며 현재 실제 값은 미설정입니다. 최초 방문자나 최초 가입자를 자동 admin으로 만들지 않습니다. 값이 없거나 잘못되면 경로가 닫힙니다.

DB bootstrap_consumed=false이고 사전 지정한 정확한 한 이메일만 OTP 발송·가입 자격의 bootstrap 예외가 됩니다. 정상 OTP/flow/browser/nonce 검증 후 받은 session의 본인이 `{confirm:true}`와 Origin·CSRF로 명시 bootstrap을 호출해야 합니다. 현재 admin 수=0, consumed=false, 이메일 일치를 같은 transaction에서 확인하고 role과 consumed를 기록합니다. 동시 요청은 하나만 성공합니다. 재배포·logout·env 유지로 consumed를 초기화하지 않습니다. 임의 승격/회복 endpoint나 지속 admin API 키는 만들지 않습니다.

## 가입 초대와 admission

초대 secret은 crypto random 32바이트의 URLsafe 43자 token이며 DB에는 SHA256 hash만 둡니다. UUID는 관리 id이며 secret을 대신하지 않습니다. 기본 7일, 설정 상한 30일, 1회 사용, 폐기 가능입니다. 목록·감사에는 원문이나 hash를 넣지 않습니다. 초대는 가입 자격만 제공하며 admin role이나 agent ownership을 주지 않습니다.

auth start에서 invite hash를 flow에 결합합니다. send 단계에서는 정규화 이메일을 고정하여 claim/nonce/browser와 함께 묶으며 주소 변경은 새 flow가 필요합니다. 미허용 주소의 고정을 위해 원문 이메일을 영속 보관하지 않습니다. send 시 초대를 소비하지 않습니다. OTP complete 성공 transaction에서 유효·미사용·미폐기 초대를 확인하고 초대 소비, admitted human 생성, flow 소비, session 발급을 함께 수행합니다. 두 flow가 같은 초대를 경쟁하면 신규 가입은 하나만 성립합니다. 오입력과 메일 실패는 초대를 소진하지 않습니다.

기존 admitted member의 로그인은 새 초대가 필요 없습니다. 유효 session의 새 agent claim은 추가 OTP를 요구하지 않으며 명시 위험 확인·승인은 별도입니다. admission과 identity 검증, ownership, risk ack를 구분합니다. 과거 env allowlist를 운영 정본으로 유지하지 않고 DB admission과 signup policy로 옮깁니다. 기존 WIP의 `SIGNUP_POLICY_JSON` 기반 판단은 아직 남아 있으므로 재개 후 교체가 필요합니다.

invalid/expired/used/revoked invite와 미허용 이메일의 send 응답은 일반 accepted입니다. 허용 여부와 무관하게 동일 HMAC 이메일/IP 요청 예산과 전역 월 상태를 검사합니다. 자격 있는 요청만 OTP 생성·provider 호출·월 발송 예약을 합니다. 기존 가입자는 closed/invite 정책에서도 로그인할 수 있으나 전체 서비스/provider 준비 상태를 우회하지 않습니다. 실제 정책 적용 순서와 bootstrap 예외는 focused 테스트로 확인해야 합니다.

## OTP 불변 경계

기본 제한은 이메일 2/UTC시간·3/UTC일·120초 간격, IP 30/UTC시간·100/UTC일, 서비스 배포 전체 UTC월 10000회입니다. 초기 발송과 명시 재발송 모두 집계합니다. 중복 logical request는 제한·OTP·provider 호출을 다시 소비하지 않습니다. 예약 이후 실패/불확실 응답에 차감 환불하거나 자동 재전송하지 않습니다. 앱 호출 최대 1회이며 provider 내부 중복 배달 보장은 아닙니다.

OTP 최대 수명 600초·최대 오입력 5회, flow는 시작부터 고정 600초가 상한입니다. 실제 만료는 min(flow.expires_at,sent_at+OTP lifetime)입니다. 재발송으로 flow를 연장하거나 만료 flow를 복원하지 않습니다. 월 한도를 이미 사용한 수 아래로 줄이면 새 send만 막고 발급된 OTP·session·claim·기존 방은 유지합니다.

subject는 고정 일반 문구이며 OTP는 메일 본문에만 둡니다. Cloudflare 발송 metadata 보관 31일과 Email preview의 본문 보관을 구분합니다. 첫 실제 메일 이전 sending domain의 preview OFF를 인증된 설정/API/dashboard에서 직접 확인하고 시각·도메인·OFF 증거를 남겨야 합니다. 현재 미검증이며 실제 발송은 승인되지 않았습니다. OFF가 기존 preview의 즉시 삭제나 metadata 삭제를 보장한다고 쓰지 않습니다.

## 기존 증거와 새 게이트

| 범위 | 보존된 결과와 제한 |
| --- | --- |
| 기존 OTP 초기화 보정 | [2157 JSON](qa/claim-wip-20261002/20261002-2157-otp-targeted.json): 6 passed / 4 failed / 2 skipped. 원래 실패 errorcode가 없어 edge 원인으로 확정하지 않습니다. |
| 기존 OTP controlled edge | [2206 JSON](qa/claim-wip-20261002/20261002-2206-otp-controlled-edge.json): 5 passed / 8 skipped / 0 failed, success=true. 실제 Workers SQLite OTP와 DI edge binding 시험입니다. |
| 기존 OTP 전체 계약 | 분리된 focused 실행으로 13개 계약의 통과 이력을 보존했습니다. 새 DB admission/settings/invite 변경 뒤에도 그대로 유효하다고 주장하지 않습니다. |
| 기존 strict typecheck | OTP 소스 당시 exit0 보고가 있습니다. 이후 harness와 새 control 계약의 최종 typecheck는 아직 없습니다. |
| 기존 2215 브라우저 | [JSON](qa/claim-wip-20261002/20261002-2215-otp-claim-ui-evidence.json) 및 viewport PNG. 기존 OTP UI 1440/390 회수 결과입니다. 새 admin UI·두 모드·invite UI의 증거가 아닙니다. |
| 새 control-plane | 소스·RED·Workers SQLite targeted·typecheck·review·PR·CI 모두 미착수입니다. 이번 재개에서 기존 gate를 반복하지 않았습니다. |

재개 후 새 runtime gate는 seed 재시작 유지, revision 동시 충돌, nonadmin/Origin/CSRF, client mode/persist spoof, budget readiness와 mode drain, bootstrap 정확 이메일/OTP/1회 경합/미설정, invite 두 flow 소비/만료/폐기/오입력 미소비/기존 회원 로그인, DEMO 가입자 저장 불허, email cap 축소 뒤 기존 session 유지를 확인합니다. 각 케이스는 local alarm/storage reset 또는 독립 namespace를 쓰고 DI clock과 edge를 분리합니다. 실패 전에 status/errorcode와 비밀 없는 원시 상태를 보존합니다.

runtime targeted와 strict tsc는 각각 최초 1회+실패 보정 1회 상한입니다. 통과한 기존 gate는 새 변경이 무효화한 범위만 선택합니다. UI browser·전체 회귀·새 환경 설치는 이번 checkpoint에서 실행하지 않습니다. 최종 통합 CI는 root 책임입니다. 무거운 명령은 heavy-work-verify runner로 하나씩, worker 최대 2개를 유지합니다.

## 재개에 필요한 입력

- root의 self-host runtime/DB adapter 설계와 SQLite·기존 PostgreSQL DSN 설치 경계를 기다립니다. 같은 OTP/invite/setting revision transaction 및 cursor/throttle/retention 계약을 유지해야 합니다.
- budget typed workload cap의 최종 key·단위·수치·원자 예약/enforcing path가 필요합니다. seed=[]와 readiness=false는 unlimited가 아닙니다.
- 엔진 lifecycle/policy revision wiring과 공개 UI 연결은 다른 소유 세션 및 root의 통합 대상입니다.
- 실제 초기 admin 이메일, EMAIL sender/binding/DNS/secret, preview OFF 실측, 실제 메일·배포는 별도 승인 대상입니다.
- 기존 WIP OpenAPI/최종 validation·PR 본문·코드 검수·최종 CI는 미완성입니다. 새 control-plane 소스가 아직 없어 완성 PR로 제출하지 않습니다.
