# Control plane: CF milestone과 공통 Repository 이식

기존 OTP WIP와 같은 `feat/claim-foundation`에서 DB settings/admin/invite/admission/entitlement를 구현했습니다. CF SQL milestone은 실제 Workers SQLite 15개 targeted 계약과 strict 타입검사를 통과해 `81f56ff`에 보존했습니다. 현재 동일 도메인을 async RepositoryPort로 이식하고 private 생성 확인·예약을 추가했습니다. 이식 검증과 최종 Worker/UI/방 엔진 wiring의 완료 여부는 아래 검증 기록과 구분하며 서비스 전체 완료나 통합 CI 통과를 뜻하지 않습니다.

## 소유와 보존

- 기존 WIP `d0470bfd`는 OTP/claim/UI 준비와 당시 QA를 포함합니다. 기준 main은 `2f666d68`이며 현재 워크트리는 `.projects/toktok--feat-claim-foundation-0ac9c22f`입니다.
- 이번 추가 구현은 `identity-*`, `otp-store`, `email`, `admission`, `settings-*`, `control-*`, `admin-http`, `invitations`와 control 전용 테스트입니다. 기존 index/contracts/wrangler/package/public/Room에는 추가 수정을 하지 않았습니다.
- B의 `src/storage/repository.ts` 단독 정본 `35d005a`를 exact cherry-pick한 로컬 commit은 `cd3a8f2`입니다. B 소유 포트는 추가 편집하지 않습니다.
- root 문서 정본 `ffb608b`의 AGENTS/UI review/agent safety 계약을 읽었습니다. 실제 UI 및 관리자 QA renderer/route registry는 C 소유이며 서버의 DB admin role을 사용해야 합니다.
- 최종 wiring, 기존 fixture 이관과 전체 회귀 CI, merge/배포/워크트리 정리는 root 소유입니다. 실제 admin 이메일/계정/메일/DNS/secret은 설정하지 않았습니다.

## 구현 정본

`settings-schema.ts`는 schema_version=1의 metadata와 typed validation, `settings-store.ts`는 최초 seed/CAS/audit/readiness/원자 budget 예약, `invitations.ts`는 초대와 검증 증표를 소유합니다. 플랫폼 비의존 `ControlCore(repository,options)`가 account/OTP/session/claim과 생성 예약의 transaction을 소유하고 하위 helper는 같은 transaction을 사용합니다. `control-policy.ts`의 admission/entitlement/TTL/retention/budget 판정은 순수 함수입니다. `control-contracts.ts`는 UI DTO type 정본입니다.

`control-runtime.ts`는 신규 SQLite ControlPlane DO용 wrapper이며 `createControlPlane(optionsFactory)`로 trusted 설치 profile/enforcement를 주입할 수 있습니다. 기본은 enabled=false/readiness=false입니다. `identity-registry.ts`의 이름 호환 export는 기존 소스 타입 연결을 위한 것이며 과거 SQL namespace로 배포하거나 자동 변환하지 않습니다. 최종 namespace는 root가 연결합니다. B 소유 Repository/CF adapter/private contract는 승인된 단독 커밋만 가져왔습니다. 메일/HTTP/longpoll은 Repository transaction 안에서 실행하지 않습니다.

첫 seed는 DEMO+invite+deployment.enabled=false입니다. DB 설정은 restart/request마다 env로 덮지 않으며 손상한 설정은 503 SETTINGS_INVALID로 닫습니다. 설치 profile은 빈 domain DB 최초 transaction에서만 검증·적용하며 기존 config/admin/account/HMAC 키를 덮지 않습니다. enabled=true 초기 profile은 버전1의 신뢰된 enforcement와 준비된 Repository가 없으면503입니다. readiness는 client/일반 settings PUT 필드가 아니며 seed에 admin 승격 필드도 없습니다. 실제 runtime 정책 갱신과 방 initializer 연결은 root 후속입니다.

## HTTP DTO와 권한

성공 응답은 아래 계약입니다. 오류는 `{error:{code,message}}`이며 429는 초 단위 Retry-After를 포함합니다. 모든 외부 응답은 root dispatcher에서 기존 no-store/noindex/no-referrer/CSP 정책을 적용해야 합니다. 현재 local test dispatcher에서도 적용합니다.

| Route | 입력 / 성공 응답 | 권한 |
| --- | --- | --- |
| GET /api/config | 안전 projection: schema_version/revision/mode/enabled/signup/public/private | 공개 읽기, secret/role grant 없음 |
| GET /api/session | authenticated/role/entitlements/csrf_token/owner_ack, 인증 시 본인 agents | 익명도 200; email/owner ID 미반환 |
| POST /api/auth/invitations/validate | code → valid=true/invite_validation_id/expires_at ISO | exact Origin+edge; browser cookie 결합 |
| POST /api/auth/start | purpose login/signup/claim, invitation_validation_id?, claim_id?, claim_token? → flow/nonce/provider_configured/expires_at ISO | exact Origin+edge; 기존 session-CSRF 불필요 |
| POST /api/auth/email/send | flow_id/email/client_request_id → receipt/state=attempted/retry_after/expires_at/message | exact Origin+flow browser; generic accepted |
| POST /api/auth/complete | flow/nonce/claim_id?/claim_token?/otp → verified=true+session cookie | exact Origin+flow/nonce/browser/claim/OTP |
| POST /api/auth/logout | 빈 object → logged_out=true | exact Origin+session-CSRF |
| POST /api/claims/:id/approve | risk_ack_version → agent | claim bearer+session-CSRF+DB admission |
| GET /api/admin/settings | schema_version/revision/settings/updated_at/updated_by | 실제 session+DB admin role |
| GET /api/admin/settings/schema | schema_version/schema metadata | 실제 session+DB admin role |
| GET /api/admin/budget | windows/usage/estimate/thresholds/model | 실제 session+DB admin role, 공개 config에 usage 비노출 |
| PUT /api/admin/settings | expected_revision/settings → settings envelope+effect_summary | exact Origin+session-CSRF+DB admin role |
| GET /api/admin/audit | audit 배열, limit 기본/최대50 | 실제 session+DB admin role |
| GET /api/admin/invitations | invitations 배열 id/expires_at/status, limit 기본/최대50 | 실제 session+DB admin role, code/hash 미반환 |
| POST /api/admin/invitations | ttl_seconds? → id/expires_at/status/code 201 | exact Origin+session-CSRF+DB admin role; code 1회 반환 |
| POST /api/admin/invitations/:id/revoke | 빈 object → id/status | exact Origin+session-CSRF+DB admin role |
| POST /api/admin/bootstrap | confirm=true → bootstrapped=true | exact Origin+session-CSRF+정확 사전 지정 이메일, 최초 1회 |
| POST /api/private/create-context | 빈 object → nonce/expires_at ISO/notice_version/authenticated/can_persist_private | exact Origin+edge; session이 있으면 CSRF, 별도 __Host create cookie |
| POST /api/private/create-grants | nonce/risk_ack=true/risk_ack_version → creation_grant/expires_at ISO/notice_version | cookie+nonce+명시 확인, session이 있으면 CSRF |

Session role/query role/fixtureRole은 클라이언트가 권한으로 만들 수 없습니다. 관리자 UI/QA HTML/API 진입은 `requireAdmin()` DB guard를 재사용합니다. session mutation의 CSRF는 해당 session에 결합되고 bearer agent creator 권한과 혼합하지 않습니다. __Host flow/session cookie는 Secure/HttpOnly/Lax/Path=/, Domain 없음입니다. owner_ack는 version과 서버 confirmed_at(ms)만 공개합니다.

| HTTP | 주요 error code |
| --- | --- |
| 400 | INVALID_INPUT, INVALID_INVITATION, RISK_ACK_REQUIRED |
| 401 | SESSION_REQUIRED, OTP_INVALID, AGENT_REQUIRED |
| 403 | ORIGIN_DENIED, CSRF_DENIED, ADMIN_REQUIRED, AUTH_FLOW_DENIED, ADMISSION_DENIED, SIGNUP_CLOSED, BOOTSTRAP_DENIED, OWNER_DENIED, AGENT_NOT_APPROVED |
| 409 | REVISION_CONFLICT, AUTH_FLOW_USED, AUTH_EMAIL_BOUND, CLAIM_PROCESSED, IDEMPOTENCY_CONFLICT, BUDGET_NOT_READY, MODE_DRAIN_REQUIRED |
| 410 | CLAIM_GONE, OPERATION_EXPIRED |
| 422 | RETENTION_EXCEEDS_TTL |
| 429 | RATE_LIMITED, EMAIL_RATE_LIMITED, BUDGET_EXCEEDED |
| 503 | SETTINGS_INVALID, AUTH_PROVIDER_UNCONFIGURED, TRUSTED_IP_REQUIRED |

## 가입과 일회성

초대는 random32byte URLsafe43 secret이며 DB에는 SHA256 hash만 둡니다. 관리 UUID는 secret이 아닙니다. validate 증표는 10분/초대 만료 중 짧은 시각까지 유효하며 browser와 결합하고 한 flow에만 연결합니다. validate/send는 초대를 소비하지 않습니다. flow는 purpose/초대/browser/nonce/claim을 고정하고 첫 send에서 정규화 이메일 HMAC를 고정합니다.

OTP 성공 transaction은 초대 재검사/일회 소비, 신규 account admission/entitlement, flow 소비, session 발급을 함께 처리합니다. 두 flow의 경쟁은 한 계정만 가입시킵니다. 기존 회원의 signup flow는 초대를 소비하거나 권한을 추가하지 않습니다. 기존 admitted account 로그인과 session 유지 중 추가 claim은 새 초대나 메일을 강제하지 않습니다.

bootstrap은 정확한 사전 지정 ADMIN_BOOTSTRAP_EMAIL의 정상 OTP session 이후 별도 confirm+CSRF로 한 번만 admin role을 부여합니다. 최초 방문/가입을 자동 승격하지 않으며 소비 상태는 logout/restart 이후에도 유지됩니다. 운영 값은 미설정입니다.

DB account는 opaque UUID, role, admission kind invited/hosted/bootstrap 및 create/persist entitlement를 소유합니다. env allowlist는 새 admission 정본이 아닙니다. 계정 entitlement 및 settings는 session/claim/creator 때 재평가합니다. 클라이언트 persist/entitlement 플래그는 권한을 만들지 않습니다.

## 방 생성 검사와 미연결 경계

순수 checker는 private visibility, authenticated creator authority, DB entitlement, owner risk ack와 persistenceAllowed를 함께 검사합니다. DEMO의 완료된 invited/bootstrap 계정도 새 private persist opt-in이 가능하며 기본 OFF입니다. public/anonymous private는 항상 memory only입니다.

익명 TTL은 기본3600/최대86400초, 인증 계정은 기본86400/최대604800초입니다. persist retention은 기본86400/최대604800초이며 room TTL을 넘으면422입니다. 30일은 허용하지 않습니다. 생성 snapshot은 mode/visibility/persist/TTL/retention/notice_version이며 memory→persist 업데이트 API는 없습니다.

이 checker 단독으로 익명 생성을 승인하지 않습니다. `create-admission.ts`가 10분 cookie/nonce context와 5분 1회 grant를 확인하고, 발급 IP/요청 IP의 HMAC별 시간·활성 제한과 전역 일 생성·pending/active slot·private_creates 예산을 한 transaction에서 예약합니다. 익명 ack는 신원 확인이 아닌 선언이고 owner_account_id=null입니다. account는 매 생성 화면의 명시 확인 시 DB ack를 갱신하고 agent 생성은 기존 owner ack 시각을 재사용합니다.

root의 기존 POST /api/v1/rooms dispatcher가 `reserveCreation()`과 실제 B PrivateRoom initialize 및 `commitSlot()`을 연결해야 합니다. 생성 body는 purpose/ttl_seconds?/persist?/retention_seconds?/client_request_id/creation_grant?이며 mode/visibility/entitlement는 body에서 받지 않습니다. grant 전달은 생성 권한 위임이며 발급 IP와 요청 IP의 한도를 모두 검사합니다. 동일 ID 입력 변경409, pending은 CREATE_PENDING/Retry-After2+room_id, 최초 결과 유실은 CREATE_RESULT_NOT_RECOVERABLE+room_id입니다. raw capability는 DB에 저장하지 않으며 재시도에 다른 방/새 secret을 발급하지 않습니다. root 공통 오류 wrapper는 `controlErrorResponse()`를 사용해 room_id를 보존해야 합니다.

pending은 확인된 initialize 이후에만 active가 되고, 종료/미초기화 확인 또는 절대 만료 때만 slot을 반환합니다. 알 수 없는 초기화 결과는 slot을 유지합니다. 실제 Room 초기화/retention/body 저장·삭제·최종 HTTP 왕복은 이 control 검증의 범위 밖입니다.

## Budget

typed cap 6종 및 provisional 숫자는 modes-settings 문서와 schema가 정본입니다. `reserve(operation_id,kind,amount)`는 trusted server operation 전용이며 공개 HTTP request body로 호출하지 않습니다. 서버 clock의 UTC day+month를 한 transaction에서 모두 검사·증가하며 실패 시 전부 rollback합니다. 재시도는 최초 예약 창에 귀속하고 내용 변경은409입니다. 실패/불확실 처리에 환불하거나 자동 재예약하지 않습니다.

`control-budget.ts`의 `CF-reference-v1` 추정 모델은 같은 reserve transaction에서 수량과 추정 microUSD의 일·월 합계를 함께 저장합니다. 월 고정 25,000,000 microUSD를 포함한 projected 값이 현재 cutoffUsd를 넘으면 `ESTIMATED_BUDGET_EXCEEDED` 429와 UTC 다음 월까지의 Retry-After를 반환하며 수량·추정값·operation 기록 모두 증가하지 않습니다. 정확히 cutoff와 같은 값은 허용합니다. warning 도달은 관리자 DTO에 계산된 상태로 표시하고, replay는 원래 창에서 추가 비용 0입니다. 이 값은 실제 청구량, Cloudflare invoice cap 또는 Node 운영비가 아닙니다. 포함 무료 사용량은 0으로 가정하고 이메일은 시도당 1cent 계획값을 사용합니다. 현재 settings의 threshold나 기존 DB 설정은 모델 추가로 덮어쓰지 않습니다.

추정 모델 신규 검증은 실제 Workers SQLite에서 6종 비용, 동시 cutoff winner1, 부분쓰기 rollback, 월 경계 replay·conflict·expiry, 수량 한도 실패와 response 비용, 실제 admin HTTP 권한·공개 config 비노출을 다루는 5개 targeted 케이스입니다. RED와 최소 구현 뒤 GREEN **5 passed / 0 failed, exit0**의 기록은 `test/control-budget-estimate-red`와 `test/control-budget-estimate-green`의 JSON/log에 보존합니다. 기존 core8/auth22/전체 회귀·타입검사는 반복하지 않았으며, 이 신규 비용 계약을 이전 통과 결과로 대신하지 않습니다. root 공통 router와 recovery headroom의 최종 연결 검증은 별도입니다.

이메일 preflight는 주소 자격 조회 전 같은 control transaction에서 수량과 추정액을 검사하며 실제 예약과 같은 순수 판정 함수를 사용합니다. 거절 시 허용·미허용 주소의 status/code/Retry-After가 같고 OTP·예약 기록을 추가하지 않습니다. 허용된 실제 발송만 수량·추정액을 예약하며 미허용 일반 receipt는 발송 예약을 만들지 않습니다. 신규 국소 Workers SQLite gate는 3 passed이며 원래 임계 잔량 응답 차이 RED와 보완 GREEN을 test/control-email-preflight-{red,green}.json에 보존했습니다. 관리자 recovery headroom과 최종 통합 타입·회귀 검증은 별도 범위입니다.

operation ID는 서버 발급 시각/고정 작업 만료/UUID를 포함합니다. 일반 내부 operation은 최대60초, email_attempts는 최대 flow 상한600초이며 만료 ID는 기록 정리 뒤에도410으로 거부합니다. 종류별 새 ID를 한 번 발급하고 같은 reservation 재시도에만 원래 ID를 유지합니다. 이는 외부 공개 토큰이 아닙니다. cap 축소는 기존 usage를 보존합니다. OTP 실제 발송 예약은 동일 email_attempts UTC day/month aggregate를 같은 transaction에서 사용하고 IP/이메일 요청 예산과 별도로 검사합니다. private_creates도 생성 slot transaction 안에서 예약하며 중첩 budget transaction을 열지 않습니다. 방 내부 admission/response/body write/duration은 B, control/config/auth/admin router admission/response 연결은 root 후속입니다. 금액/typed cap가 실제 청구 상한을 보장하지 않습니다.

## 검증과 남은 작업

- 신규 control RED는 4 failed였습니다: admin route/session projection/설정 저장소/invite validate 미구현을 확인했습니다.
- 첫 실제 Workers SQLite targeted 실행은 15 passed / 0 failed, exit0입니다. 원시 JSON은 `../test/control-runtime-initial.json`이며 테스트명/status/errorcode를 포함하고 실제 credential/OTP/email/provider error는 dump하지 않습니다.
- 실행 명령은 `heavy_verify.py --timeout 300 -- node node_modules/vitest/vitest.mjs run --config test/control-vitest.config.ts --root <WT> --reporter=default --reporter=json --outputFile=<WT>/test/control-runtime-initial.json`입니다. worker1, 실제 SQLite, DI clock와 controlled edge, fake sender이며 실제메일0입니다.
- strict 실행 `heavy_verify.py --timeout 300 -- node node_modules/typescript/bin/tsc --noEmit --project <WT>/tsconfig.json`은 exit0입니다. runtime와 typecheck는 반복하지 않았습니다.
- 15개는 seed 재초기화 유지/손상 닫힘, admin role/Origin/CSRF/CAS/audit, readiness/drain fixture, bootstrap1회, invite browser/flow/email/동시소비/만료/폐기/오입력/기존회원, DB persist checker, cap 축소 후 OTP/session/claim, UTC budget 경합/월경계/dedupe/만료를 확인합니다. seed 증거는 같은 DB 새 Store init이며 프로세스 재시작 시험으로 확대하지 않습니다.
- firstWindow 최대300초와 batch2000..10000ms는 첫15개 실행 뒤 root 지시에 따라 검증 schema만 좁게 정정했습니다. 같은 Worker pool에서 이 경계만 선택해 1 passed / 15 skipped, exit0을 확인했습니다(`../test/control-bounds-targeted.json`). responseBytes는 admin schema min=max=65536, byteBurst>=responseBytes, waits<=handlers, responseBurst>=1, batchMs<=waitMs를 확정했습니다. 이전15개 전체는 반복하지 않았습니다.
- 기존 OTP 13개/2215 browser 증거는 `qa/claim-wip-20261002`에 보존됩니다. 새 admin/auth UI나 Repository/selfhost 통과로 확대하지 않습니다. 새 browser/메일/설치/배포는 실행하지 않았습니다.
- 기존 auth/OTP fixture는 아래 HTTP port 후속에서 새 DB admission으로 이관했습니다. foundation/routing의 실제 Room fixture 이관, 전체 회귀와 최종 OpenAPI/production dispatcher wiring은 root 책임이며 이 targeted 결과가 그 회귀 통과를 뜻하지 않습니다.
- 동일 domain을 async RepositoryPort(control scope)로 이식합니다. B CloudflareRepository의 tok_records/tok_migrations schema는 기존 SQL DO에 바로 적용하지 않고 신규 ControlPlane namespace에 주입합니다. 운영 계정/방이 아직 없으며 old WIP 자동변환은 하지 않습니다. B SQLite/PG/CF adapter와 같은 core를 사용하고 callback 안에 외부메일/HTTP/longpoll을 넣지 않습니다.
- 실제 초기 admin provisioning, sender binding/DNS/preview OFF 실측/실제메일, UI renderer/registry, lifecycle/budget enforcement 및 최종 통합 CI는 남았습니다.

## Repository 이식 gate 진행 기록

- CF milestone 당시 control test/config/worker는 `.milestone.txt`로 보존했습니다. 기존 결과를 취소한 것이 아니며 이식 후 runtime fixture와 구분합니다.
- 새 pool은 `test/control-port-vitest.config.ts`/`control-port-wrangler.jsonc`/`control-port-worker.ts`입니다. 실제 Workers SQLite Repository, controlled edge, DI clock, fake sender만 사용하고 운영 메일0입니다.
- 첫 이식 runtime 시도는 잘못 지정된 fixture entry가 ControlPlane을 export하지 않아 초기화 단계에서 실패했습니다. domain assertion은 실행되지 않았습니다. entry와 B adapter 정본 보정 후 허용된 실행 1회가 8 passed / 0 failed / exit0으로 끝났습니다. `test/control-port-runtime.json`에 테스트별 판정, `test/control-port-runtime.log`에 비밀을 제외한 status/errorcode/Retry-After 원시 결과가 있습니다.
- 첫 이식 타입검사는 B CF storage exec generic과 설치 Workers 타입의 제약 차이로 TS2345 6건을 냈습니다. B 단독 generic checkpoint f55ae735를 반영하고 같은 tsc --noEmit 보정 실행 1회가 exit0으로 끝났습니다. strict 설정/any/ts-ignore를 완화하지 않았습니다.
- B alarm checkpoint e013eb3는 정확한 __cf_kv/_cf_METADATA만 제외하며 임의 사용자 테이블은 계속 닫습니다. 이후 통과한 신규 domain gate는 seed/HMAC 보존과 무인 admin 생성0, enabled seed 음성 조건, bootstrap/CAS/DB admin-CSRF, invite 동시소비/OTP dedupe/browser/nonce/5오입력, 로그인 중 추가 claim 메일0, agent 기존 ack 시각, UTC day+month budget 경합/내용충돌/만료/월경계, 익명 persist 거부, account DB persist snapshot/retention422, grant 1회·전역 slot 경합·결과 유실409·close/절대 만료 slot 반환을 확인합니다. PrivateRoom 자체 initialize/본문 저장은 호출하지 않았습니다. 기존 전체 회귀나 browser를 반복하지 않았습니다.
- 실제 실행 명령은 `heavy_verify.py --timeout 300 -- node node_modules/vitest/vitest.mjs run --config test/control-port-vitest.config.ts --reporter=default --reporter=json --outputFile=test/control-port-runtime.json`입니다. worker1, nodejs_als, 실제 SQLite targeted Repository, controlled edge/DI clock/fake sender이며 remote binding/실제메일0입니다. foreground는 exit0으로 회수했습니다.
- 단계3 독립 읽기전용 reviewer는 새 core/create/seed 구현을 정적 검수해 추가 blocker 없이 통과했습니다. runtime 결과나 B adapter/최종 root wiring 검증을 대신하지 않습니다.
- draft PR #5의 head52e3a5d CI run37079104598은 pnpm test에서 34 failed/1 passed로 실패했습니다. 원문은 기존 OTP fixture의 purpose 없는 start 입력400 INVALID_INPUT, 기존 agent fixture의 humans SQL 테이블 참조 실패 등을 포함합니다. 옛 fixture의 DB/payload 이관과 final wiring을 root에 넘겼으며 뒤의 타입검사/acceptance/dry-run은 skipped입니다. 이 실패를 통합 성공으로 표기하거나 로컬 gate를 반복하지 않았습니다.

## 공통 HTTP port 및 auth fixture 이관

`ControlHttpPort.execute(action,input):Promise<unknown>`를 최소 `IdentityEnv.controlPort`로 주입합니다. HTTP handler Env는 PUBLIC_ORIGIN/IP limiter/control port/optional mail만 요구하며 DO namespace를 알지 않습니다. 옛 root 소스 타입 호환을 위해 optional이지만 누락은 CONTROL_UNCONFIGURED503이고 DO fallback은 없습니다. CF host는 `responseControlPort(send)` callback에서 실제 CONTROL.fetch를 주입하고 Node는 같은 ControlCore를 직접 주입합니다. Response adapter는 domain status/code/Retry-After와 creation409 room_id를 보존합니다. auth/admin/create handler나 domain을 복제하지 않습니다.

trusted `get-runtime-config` action은 `{settings,revision,readiness}`를 반환합니다. 공개 GET /api/config는 기존 안전 projection만 반환합니다. budget-reserve는 trusted control port의 operation_id/kind/amount 입력이며 HTTP 공개 body로 dispatch하지 않습니다. root가 control/auth/config/admin router 비용 예약과 방 정책 revision 갱신에 연결합니다.

`test/control-auth-host.ts`는 같은 identity/admin/private HTTP handler에 포트를 주입하고 실제 Workers SQLite Repository를 사용합니다. 실제 메일0, edge binding controlled, clock/IP/provider만 test DI입니다. 기존 OTP 13개와 claim 9개를 새 purpose/DB admission/session DTO/row storage로 이관했고 의미를 삭제하거나 skip해서 통과시키지 않았습니다. 이메일 월9999 경합/10000차단/늦은 전월 결과, 1회 발송·재시작 지문 replay·주소/IP 제한·동시오입력·native template 개인정보, claim owner 경쟁/Origin/CSRF/철회/만료/등록한도를 검증합니다.

첫 이관 실행은 21 passed / 1 failed였습니다. 만료 물리정리 case의 원인은 거부 HTTP transaction에서 정리가 rollback되는 데 독립 maintenance 호출을 fixture가 누락한 것입니다. test-only DI clock으로 실제 ControlCore.maintain을 호출해 실패1개만 1 passed / 21 skipped로 보정했습니다. 이는 domain maintenance 검사이며 실제 CF alarm dispatch/실시간 clock 검증으로 확대하지 않습니다. `test/control-auth-runtime.json/.log`와 `test/control-auth-maintenance-targeted.json/.log`에 최초/보정 원문을 함께 보존합니다. productsource 수리나 통과21개 반복은 하지 않았습니다.

실행은 `heavy_verify.py --timeout 300 -- node node_modules/vitest/vitest.mjs run --config test/control-auth-vitest.config.ts`이며 실패1개 보정은 `-t "rejects expired and logged-out sessions"`를 추가했습니다. 각 worker1, foreground exit 회수, secret/메일주소/원문 OTP는 증거에 넣지 않았습니다. HTTP port 변경 strict tsc는 test harness 타입2건을 국소 보정해 exit0이었고 이후 maintenance helper만 추가했습니다. 최종 strict/전체 CI는 root 통합 경로에서 확인합니다. 변경 HTTP 접점의 독립 읽기전용 검수도 blocker 없이 통과했습니다.

OTP cap 이후 실제 Room 왕복과 기존 room capability의 철회 후 계속 접근은 새 PrivateRoom/dispatcher 의존입니다. A는 cap 이후 session/claim/creator authority와 mail 추가0까지만 검증하고 실제 Room 메시지/링크를 root cross-runtime HTTP gate에 넘깁니다. register/guide 실제 페이지, QA shared renderer/coverage, 기존 foundation/routing fixture와 final bindings/CI도 미완료 경계입니다.

## Public settings 정합 후속

B 정본 4e8ad3c의 public-contracts/public-policy 두 파일은 내용 변경 없이 별도 import commit으로 보존했습니다. A 설정은 B seed/validator를 직접 재사용하고 `runtimePublicPolicy(settings)`가 초→ms 변환과 최초 읽기 개수의 직접 mapping을 제공합니다. `public.firstWindowMessages`는 1..20/default20이며 안전 공개 config에도 포함합니다. ipMemoryMs metadata는 엔진의 최소300000/최대3600000ms와 맞췄고 기존 더 좁은 catalog/lease 범위는 확대하지 않았습니다. C에 DTO를 전달했으며 root의 실제 runtime mapping 연결은 별도 통합입니다.

새 순수 설정 gate만 실행했습니다. RED는 1 passed/2 failed로 누락 옵션과 역방향 IP 범위를 확인했고, 보정 후 3 passed/0 failed/exit0입니다. `test/control-public-settings-red.json/.log`와 `test/control-public-settings-green.json/.log`에 원문을 보존합니다. 명령은 `heavy_verify.py --timeout 300 -- node node_modules/vitest/vitest.mjs run --config test/control-public-settings-vitest.config.ts --reporter=default --reporter=json --outputFile=test/control-public-settings-green.json`이며 worker1인 Node Vitest입니다. Workers SQLite/core/auth/strict/browser/전체 회귀를 반복하지 않았습니다. 새 필드 없는 기존 DB config는 조용한 seed 덮어쓰기 없이 검증 실패하며 운영 DB 자동 migration은 추가하지 않았습니다.

## 관리자 복구 한도

trusted transport의 `admin-recovery-reserve`는 `{session_hash,csrf?,mutation:boolean,operation_id,now}`를 받습니다. 공개 dispatcher는 없으며 실제 DB admin role과 현재 유효 세션을 다시 검사하고 mutation=true면 session CSRF도 필수입니다. 서버가 발급한 operation은 60초 이내 작업만 허용하며 재시도는 같은 세션/읽기·변경/CSRF 결합과 최초 UTC 창을 유지합니다. 결합 변경은 409, 만료는 410입니다.

고정 recovery headroom은 전체 관리자 요청 합계로 UTC 분 10회·일 100회·월 1000회이며 일반 수량·추정 USD 예산과 별도로 같은 control transaction에서 세 창을 모두 검사·증가합니다. 어느 창이든 초과하면 429 ADMIN_RECOVERY_LIMITED와 가장 늦은 차단 해제 Retry-After를 반환하고 추가 기록은 없습니다. 중복 replay는 추가 0이며 반환값은 `{response_bytes_limit:65536}`입니다. 이 상한은 관리자 UI에서 끄거나 늘리는 설정이 아닙니다. 저장된 session/hash/CSRF와 binding 값은 DTO·감사에 노출하지 않습니다.

`GET /api/admin/budget`의 실제 admin 전용 DTO는 `recovery:{bounds:{minute:10,day:100,month:1000},usage:{minute,day,month},response_bytes_limit:65536,next_minute_at,next_day_at,next_month_at}`를 함께 제공합니다. 시각은 UTC ISO 문자열이며 public config에는 이 usage가 없습니다.

host 후속 경계: 일반 budget 계열 429일 때만 root가 제한된 관리자 HTML 7개, GET session/settings/schema/budget, PUT settings, POST logout에서 fallback을 호출하고 exact method/path·cheap edge·응답 64KiB를 지킵니다. QA·초대·이메일·방 생성·권한 확대는 예외가 없습니다. 이 문서는 control action의 구현과 실제 Workers SQLite 신규 4 passed를 기록하며 아직 연결하지 않은 host fallback까지 완료했다고 주장하지 않습니다. RED/GREEN 증거는 test/control-recovery-{red,green}.json과 log에 있습니다. 기존 core/auth/estimate 성공 게이트는 반복하지 않았습니다.
