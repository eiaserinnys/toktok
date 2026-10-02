# Control plane: CF milestone과 공통 Repository 이식

기존 OTP WIP와 같은 `feat/claim-foundation`에서 DB settings/admin/invite/admission/entitlement를 구현했습니다. 현재 CF SQL milestone은 실제 Workers SQLite 15개 targeted 계약과 strict 타입검사를 통과했습니다. 공통 Repository 이식과 최종 Worker/UI/방 엔진 wiring은 후속이며 서비스 전체 완료나 통합 CI 통과를 뜻하지 않습니다.

## 소유와 보존

- 기존 WIP `d0470bfd`는 OTP/claim/UI 준비와 당시 QA를 포함합니다. 기준 main은 `2f666d68`이며 현재 워크트리는 `.projects/toktok--feat-claim-foundation-0ac9c22f`입니다.
- 이번 추가 구현은 `identity-*`, `otp-store`, `email`, `admission`, `settings-*`, `control-*`, `admin-http`, `invitations`와 control 전용 테스트입니다. 기존 index/contracts/wrangler/package/public/Room에는 추가 수정을 하지 않았습니다.
- B의 `src/storage/repository.ts` 단독 정본 `35d005a`를 exact cherry-pick한 로컬 commit은 `cd3a8f2`입니다. B 소유 포트는 추가 편집하지 않습니다.
- root 문서 정본 `ffb608b`의 AGENTS/UI review/agent safety 계약을 읽었습니다. 실제 UI 및 관리자 QA renderer/route registry는 C 소유이며 서버의 DB admin role을 사용해야 합니다.
- 최종 wiring, 기존 fixture 이관과 전체 회귀 CI, merge/배포/워크트리 정리는 root 소유입니다. 실제 admin 이메일/계정/메일/DNS/secret은 설정하지 않았습니다.

## 구현 정본

`settings-schema.ts`는 schema_version=1의 metadata와 typed validation, `settings-store.ts`는 최초 seed/CAS/audit/readiness/원자 budget 예약, `invitations.ts`는 초대와 검증 증표, `identity-registry.ts`는 DB account/OTP/session/claim transaction을 소유합니다. `control-policy.ts`의 settings/admission/entitlement/TTL/retention/budget 판정은 플랫폼 비의존 순수 함수입니다. `control-contracts.ts`는 UI DTO type 정본입니다.

첫 seed는 DEMO+invite+deployment.enabled=false입니다. DB 설정은 restart/request마다 env로 덮지 않으며 손상한 설정은 503 SETTINGS_INVALID로 닫습니다. 실제 runtime policy refresh/active room 예약은 아직 연결하지 않았습니다. trusted budget/lifecycle readiness는 일반 settings payload에 없고 미연결 상태에서 enable 또는 mode 전환을 거부합니다.

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
| PUT /api/admin/settings | expected_revision/settings → settings envelope+effect_summary | exact Origin+session-CSRF+DB admin role |
| GET /api/admin/audit | audit 배열, limit 기본/최대50 | 실제 session+DB admin role |
| GET /api/admin/invitations | invitations 배열 id/expires_at/status, limit 기본/최대50 | 실제 session+DB admin role, code/hash 미반환 |
| POST /api/admin/invitations | ttl_seconds? → id/expires_at/status/code 201 | exact Origin+session-CSRF+DB admin role; code 1회 반환 |
| POST /api/admin/invitations/:id/revoke | 빈 object → id/status | exact Origin+session-CSRF+DB admin role |
| POST /api/admin/bootstrap | confirm=true → bootstrapped=true | exact Origin+session-CSRF+정확 사전 지정 이메일, 최초 1회 |

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

이 checker는 익명 생성 승인 자체가 아닙니다. 익명 human ack/nonce, create lifecycle/global active 예약, Room snapshot/저장/삭제 연결은 root 후속 계약입니다. 이 milestone에서 실제 새 방 생성/retention enforcement를 통과했다고 보고하지 않습니다.

## Budget

typed cap 6종 및 provisional 숫자는 modes-settings 문서와 schema가 정본입니다. `reserve(operation_id,kind,amount)`는 trusted server operation 전용이며 공개 HTTP request body로 호출하지 않습니다. 서버 clock의 UTC day+month를 한 transaction에서 모두 검사·증가하며 실패 시 전부 rollback합니다. 재시도는 최초 예약 창에 귀속하고 내용 변경은409입니다. 실패/불확실 처리에 환불하거나 자동 재예약하지 않습니다.

operation ID는 서버 발급 시각/고정 작업 만료/UUID를 포함합니다. 일반 내부 operation은 최대60초, email_attempts는 최대 flow 상한600초이며 만료 ID는 기록 정리 뒤에도410으로 거부합니다. 이는 외부 공개 토큰이 아닙니다. cap 축소는 기존 usage를 보존합니다. readiness는 false이며 실제 engine/response/admission workload enforcing path와 OTP typed budget 연결은 root 최종 wiring 후 확인합니다. 기존 OTP 전역 월10000 예약은 계속 별도 실제 게이트입니다. 금액/typed cap가 실제 청구 상한을 보장하지 않습니다.

## 검증과 남은 작업

- 신규 control RED는 4 failed였습니다: admin route/session projection/설정 저장소/invite validate 미구현을 확인했습니다.
- 첫 실제 Workers SQLite targeted 실행은 15 passed / 0 failed, exit0입니다. 원시 JSON은 `../test/control-runtime-initial.json`이며 테스트명/status/errorcode를 포함하고 실제 credential/OTP/email/provider error는 dump하지 않습니다.
- 실행 명령은 `heavy_verify.py --timeout 300 -- node node_modules/vitest/vitest.mjs run --config test/control-vitest.config.ts --root <WT> --reporter=default --reporter=json --outputFile=<WT>/test/control-runtime-initial.json`입니다. worker1, 실제 SQLite, DI clock와 controlled edge, fake sender이며 실제메일0입니다.
- strict 실행 `heavy_verify.py --timeout 300 -- node node_modules/typescript/bin/tsc --noEmit --project <WT>/tsconfig.json`은 exit0입니다. runtime와 typecheck는 반복하지 않았습니다.
- 15개는 seed 재초기화 유지/손상 닫힘, admin role/Origin/CSRF/CAS/audit, readiness/drain fixture, bootstrap1회, invite browser/flow/email/동시소비/만료/폐기/오입력/기존회원, DB persist checker, cap 축소 후 OTP/session/claim, UTC budget 경합/월경계/dedupe/만료를 확인합니다. seed 증거는 같은 DB 새 Store init이며 프로세스 재시작 시험으로 확대하지 않습니다.
- firstWindow 최대300초와 batch2000..10000ms는 첫15개 실행 뒤 root 지시에 따라 검증 schema만 좁게 정정했습니다. 같은 Worker pool에서 이 경계만 선택해 1 passed / 15 skipped, exit0을 확인했습니다(`../test/control-bounds-targeted.json`). responseBytes는 admin schema min=max=65536, byteBurst>=responseBytes, waits<=handlers, responseBurst>=1, batchMs<=waitMs를 확정했습니다. 이전15개 전체는 반복하지 않았습니다.
- 기존 OTP 13개/2215 browser 증거는 `qa/claim-wip-20261002`에 보존됩니다. 새 admin/auth UI나 Repository/selfhost 통과로 확대하지 않습니다. 새 browser/메일/설치/배포는 실행하지 않았습니다.
- 기존 auth/OTP 테스트 fixture는 옛 start payload/cookie/allowlist/session DTO를 사용하므로 최종 통합 시 새 DB admission fixture로 이관해야 합니다. 전체 회귀와 최종 OpenAPI/production dispatcher wiring은 root 책임이며 이번 targeted 결과가 그 회귀 통과를 뜻하지 않습니다.
- 동일 domain을 async RepositoryPort(control scope)로 이식합니다. B CloudflareRepository의 tok_records/tok_migrations schema는 기존 SQL DO에 바로 적용하지 않고 신규 ControlPlane namespace에 주입합니다. 운영 계정/방이 아직 없으며 old WIP 자동변환은 하지 않습니다. B SQLite/PG/CF adapter와 같은 core를 사용하고 callback 안에 외부메일/HTTP/longpoll을 넣지 않습니다.
- 실제 초기 admin provisioning, sender binding/DNS/preview OFF 실측/실제메일, UI renderer/registry, lifecycle/budget enforcement 및 최종 통합 CI는 남았습니다.
