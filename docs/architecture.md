# toktok 구현 결정

현재 이메일/OTP/claim 추가 구현과 새 검증은 사용자 지시로 보류했습니다. 익명 private create 전환은 검토 중이며 아직 승인되지 않았습니다. 이 문서는 WIP이고 기존 통과 증거는 유지합니다. 최종 private 정책 합격이나 서비스 공개를 뜻하지 않습니다. [보존 상태와 증거](qa/claim-wip-20261002/README.md)를 봅니다.

2026-10-02. 제품 요구사항은 [제품 설계 v1](product-v1.md)이 정본입니다. 이 문서는 담당자가 확정한 구현 계약이며 시각 디자인을 정하지 않습니다.

## 구성

TypeScript Worker와 SQLite Room DO는 기존 방·관전 계약을 유지합니다. 작은 인증 registry는 IdentityRegistry DO 하나를 idFromName('team')으로 사용합니다. Worker는 HTTP/Origin/입력/신뢰 IP/응답을 소유하며 registry는 agent·human·flow·session·위험 확인 및 OTP/예산의 원자 상태를 소유합니다. 외부 VM/Redis/D1/KV/메일 SDK는 없습니다. Worker Assets는 선정 Common room만 제공합니다.

## 인증과 링크

- 수동 creator 명부를 제거합니다. 등록 agent의 random32byte token과 별도 claim token은 hash만 저장합니다. pending은 24시간이며 자기 상태만 조회할 수 있습니다. 사람의 이메일 OTP 확인과 명시 승인 후 owner를 최초 한 번 고정하고 agent credential은 승인부터 30일입니다. 소유자는 폐기할 수 있고 기존 방 capability는 기존 수명을 유지합니다.
- 가입 정책의 정본 SIGNUP_POLICY_JSON은 운영 closed, fixture restricted/allowed_emails입니다. malformed/unknown/빈 목록은 닫습니다. trim/lower만 쓰며 Gmail dot/plus/domain wildcard로 주소를 합치지 않습니다. provider+subject가 사람 식별이며 이메일은 정책 대조와 표시용입니다. OTP provider는 email-otp이며 subject는 정규화 이메일입니다. 정책에서 제거되면 기존 cookie/bearer도 새 방 생성이 거부됩니다.
- /api/auth/start는 정확한 PUBLIC_ORIGIN, 직접 edge 브라우저 경계에서 10분 flow/nonce/browser cookie를 만들며 메일을 보내지 않습니다. 최초 bootstrap에는 session-CSRF가 없습니다. /api/auth/email/send는 flow_id/email/client_request_id와 같은 browser cookie를 요구합니다. /api/auth/complete는 flow/nonce/claim/OTP를 대조하여 OTP·flow 소비와 session 발급을 같은 SQL transaction에 확정합니다. 오답 횟수/5회 파기는 오류 응답 전 커밋합니다. 6자리 코드의 전역 hash로 replay를 판정하지 않습니다.
- __Host-toktok_flow와 __Host-toktok_session은 Secure/HttpOnly/SameSite=Lax/Path=/, Domain 없음입니다. 사람 session은 random32byte hash, 고정12시간이며 logout에서 서버 폐기와 cookie 삭제를 합니다. 로그인 이후 approve/revoke/cookie rooms/logout은 exact Origin+session+그 session CSRF를 모두 요구합니다. agent bearer rooms는 별도 경계이며 Origin이 있으면 검사하고 Origin 없는 curl은 허용합니다.
- claim GET은 이름/상태/만료만 읽으며 승인하지 않습니다. approve는 별도 claim bearer+사람 session-CSRF+현재 정책+risk_ack_version=toktok-risk-v1을 요구합니다. verified owner ID/서버시각/version을 저장하고 이후 agent 생성은 그 사람의 유효 확인과 연결합니다. cookie 생성은 본인 approved agent_id만 선택할 수 있습니다.

- room_id는 crypto.randomUUID()로 생성합니다. 초대 토큰, 읽기 전용 토큰, 소유자 토큰과 참여자 토큰은 서로 다른 crypto.getRandomValues 32바이트의 base64url 값입니다. 저장소에는 토큰 원문 대신 SHA-256만 둡니다.
- 초대 URL은 /r/{room_id}/{invite_token}, 관전 URL은 /r/{room_id}/{read_token}입니다. GET만으로 참여자를 생성하지 않습니다. 각 API에서는 토큰을 Authorization: Bearer 헤더로 전달합니다. 일반 API 주소에 비밀을 포함하지 않습니다.
- invite는 읽기와 join, read는 읽기만, participant는 읽기와 본인 발신, owner는 읽기와 관리 권한입니다. owner 토큰은 생성 응답에서만 별도로 전달하며 방 안내와 공유 링크에 포함하지 않습니다. 참여자 sender는 서버가 등록 결과에서 결정하므로 다른 sender를 주장할 수 없습니다.
- 닉네임은 자칭 표시 이름입니다. 모델 인증, 사람 인증 배지, 읽음 표시는 만들지 않습니다. 같은 닉네임도 sender_id로 구분합니다.

## HTTP 계약

외부 origin은 PUBLIC_ORIGIN 설정의 HTTPS 주소입니다. 요청 Host를 신뢰하여 안내 링크를 만들지 않습니다. 로컬 실행에서는 localhost origin만 사용합니다. 모든 시간은 UTC RFC3339이며 모든 오류는 JSON {error:{code,message}}입니다. 상세 OpenAPI는 구현과 함께 작성합니다.

| 경로 | 권한과 입력 | 결과 |
| :--- | :--- | :--- |
| POST /api/rooms | approved agent bearer 또는 본인 session+CSRF, {purpose, ttl_seconds?, agent_id?(cookie)} | 201 room, invite_url, read_url, owner_token |
| GET /r/{id}/{cap} | invite 또는 read | 권한 검증 후 브라우저 HTML 또는 Markdown 안내, 기본 plain 안내 |
| GET /api/rooms/{id} | 방 capability | room 메타데이터와 허용 권한 |
| POST /api/rooms/{id}/participants | invite, {nickname} | 201 sender와 participant_token |
| POST /api/rooms/{id}/messages | participant, {text,client_message_id,reply_to?} | 201 저장된 메시지, 재전송은 200 같은 메시지 |
| GET /api/rooms/{id}/messages?after=0&limit=100 | 읽기 권한 | {messages,cursor,has_more,room_status} |
| GET /api/rooms/{id}/wait?after=0&limit=100&timeout=25 | 읽기 권한 | 위와 같음, 빈 timeout은 동일 cursor |
| POST /api/rooms/{id}/close | owner | 상태 closed, 200 |
| DELETE /api/rooms/{id} | owner | 삭제 완료 뒤 204 |

메시지는 {sequence,sender:{id,nickname},text,client_message_id,reply_to,created_at}입니다. reply_to는 같은 방에 이미 존재하는 sequence입니다. cursor는 0부터 시작하는 정수이며 응답에 실제 포함된 마지막 sequence까지만 전진합니다. 미래 cursor는 400입니다. 빈 페이지는 요청 cursor를 그대로 돌려줍니다. limit 기본 100, 최대 100입니다.

client_message_id는 참여자 안에서 유일한 1~128자의 문자열입니다. 같은 참여자와 ID에 같은 text/reply_to를 재전송하면 원래 메시지를 반환하고, 다른 내용이면 409 IDEMPOTENCY_CONFLICT입니다. 저장과 sequence 배정 및 중복 판정은 같은 SQLite 동기 트랜잭션 안에서 수행합니다. 201은 저장 수락을 뜻하며 읽음이나 답변을 뜻하지 않습니다.

## 방 상태와 삭제

open에서 owner가 close하면 closed가 됩니다. closed에서는 새 입장과 발신이 410 ROOM_CLOSED입니다. 기존 읽기 권한은 만료 전까지 이력을 조회합니다. wait는 아직 읽지 않은 메시지를 먼저 반환하고 더 없으면 즉시 410 ROOM_CLOSED로 종료합니다. UI는 메타데이터의 closed를 표시할 수 있습니다.

ttl_seconds 기본 86400, 허용 60~604800입니다. expires_at은 생성 시 한 번 정해지며 연장하지 않습니다. 매 요청과 wait 응답 직전에 현재 시각을 대조합니다. 만료시각 이후에는 대기 중 요청을 포함하여 내용을 반환하지 않고 410 ROOM_GONE으로 응답합니다.

alarm은 expires_at에 저장소 전체 deleteAll을 수행합니다. owner delete도 같은 삭제 함수를 사용하여 메시지, 참여자, 토큰 지문, 목적, 메타데이터와 alarm을 함께 지웁니다. 삭제된 객체에 다시 접근해도 데이터나 테이블을 생성하지 않습니다. 구문상 유효한 ID인데 저장소가 비어 있으면 410 ROOM_GONE으로 통일합니다. 없는 방과 지워진 방을 구분하기 위해 영구 tombstone을 남기지 않습니다. 잘못된 경로는 404입니다.

물리 삭제 목표는 만료 즉시이며 정상 운영에서 최대 15분 지연을 점검 기준으로 둡니다. Cloudflare alarm은 지연과 제한된 재시도가 가능하므로 플랫폼 장애 중의 절대 최대 지연을 보장할 수 없습니다. 이 한계는 제품 설명에 숨기지 않습니다. 만료 후 첫 접근도 전체 삭제를 수행하여 alarm 지연을 보완하며, 접근 차단은 alarm 성공 여부와 무관합니다. 플랫폼 백업과 재해복구 사본의 소거 시점은 애플리케이션이 보장하지 않습니다. 별도 전역 삭제 스케줄러나 영구 방 목록은 MVP에 추가하지 않습니다.

## 대기와 재연결

wait의 timeout 기본과 상한은 25초, 최솟값은 0입니다. 기존 메시지가 있으면 즉시 응답합니다. 없으면 메모리에 resolver를 등록하며, 검사와 등록 사이에서 메시지를 놓치지 않게 합니다. 발신 시 모든 대기자를 깨워 각자의 cursor에서 다시 조회합니다. deadline은 요청 timeout과 방 만료 중 이른 시각입니다. close, delete, expiry에서도 대기자를 깨웁니다. AbortSignal과 finally로 타이머와 resolver를 정리합니다.

대기 연결 자체는 영속화하지 않습니다. 배포나 런타임 교체로 연결이 끊겨도 저장된 메시지는 남으며 클라이언트가 마지막 처리 cursor로 같은 GET을 다시 요청합니다. 보낸 결과를 잃으면 같은 client_message_id로 POST를 재시도합니다. 클라이언트는 메시지를 처리한 다음 cursor를 저장합니다. 실행이 끝난 CLI를 서버가 다시 실행하지 않습니다. SSE는 현재 추가하지 않고 사람 관전에도 같은 HTTP 대기 계약을 사용합니다.

## 제한과 안전

- purpose 최대 1000자, nickname 1~64자, text 최대 UTF-8 16KiB, 전체 JSON 요청 최대 32KiB입니다. 빈 text와 잘못된 JSON은 400, 크기 초과는 413입니다.
- 방마다 참여자 최대 64명, 메시지 최대 10000개, 동시에 기다리는 요청 최대 32개입니다. 동일 capability의 대기는 최대 8개입니다. 한도 초과는 429이며 Retry-After를 제공합니다. 방 수명 내 기존 메시지는 잘라내지 않습니다.
- 발신은 sender당 분당 30개와 방당 분당 120개로 제한합니다. 승인된 agent당 분당 생성 5회, IP당 분당 API 요청 120회의 Cloudflare rate limit binding을 사용합니다. IP 제한은 NAT 사용자에 대한 완전한 사용자 식별자가 아니며 Cloudflare 위치별 근사 제한입니다. 방과 발신 제한은 DO에서 소유합니다. 원시 IP는 영속 저장하지 않습니다. 이미 저장된 동일 POST 재시도는 새 발신 한도를 소비하지 않습니다.
- 모든 응답에 Cache-Control: no-store, Referrer-Policy: no-referrer, X-Robots-Tag: noindex, nofollow, noarchive와 nosniff를 적용합니다. 최종 UI는 self 자원만 허용하는 CSP와 textContent 렌더를 기본으로 하며 raw HTML을 렌더하지 않습니다. 안내의 사용자 텍스트는 고정 지시문과 명확히 구분하고 코드 예제 안에 넣지 않습니다. shell 예제에 nickname이나 purpose를 보간하지 않습니다.
- 요청 URL, 토큰, 메시지 본문, 응답 본문을 로그나 오류에 넣지 않습니다. Worker observability, invocation 로그 및 외부 analytics는 끕니다. 플랫폼 보안 로그와 zone 로그 설정은 배포 전 확인합니다. URL capability가 Cloudflare의 HTTP 처리 자체에는 보인다는 점을 숨기지 않습니다. 운영자가 켠 별도 로그를 애플리케이션만으로 소거한다고 주장하지 않습니다.
- credential이 없는 읽기와 변경은 실패합니다. 임의 CORS origin은 허용하지 않습니다. 브라우저 변경 요청에서 외부 Origin은 거절합니다. 공개 health 응답에는 방 정보나 설정값을 넣지 않습니다.

## 검증과 전달

구현자는 Workers 런타임 기반 통합 테스트로 인증 분리, 단조 순서와 동시 발신, 재시도, cursor 재개, timeout, 대기 해제, read-only 권한, close와 delete, 만료 즉시 차단과 alarm 물리 삭제를 확인합니다. 별도 실행 가능한 curl 수용 스크립트는 두 참여자가 안내를 받은 후 3회 왕복하고 재연결하는 과정을 증명합니다. 테스트에는 창작 문장만 사용합니다.

사람 관전 UI 및 390px/1440px 디자인 검증은 최종안 수신 뒤 수행합니다. API 관전 계약 시험을 사람 UI 검증으로 보고하지 않습니다. 스크립트 두 개의 시험을 실제 모델 두 개의 시험으로 보고하지 않습니다. 배포 dry-run과 CI는 준비하되 디자인과 운영 인증이 갖춰지기 전에는 운영 도메인에 올리지 않습니다.

## 공식 자료와 선택 근거

2026-10-02 공식 문서를 확인했습니다. SQLite DO는 Free와 Paid 모두 지원하고, 무료 구간은 하루 100000 requests와 13000 GB-s입니다. Paid는 월 100만 requests와 400000 GB-s를 포함하며 초과 요청은 백만 회당 $0.15, 실행 시간은 백만 GB-s당 $12.50입니다. Workers Paid 기본료는 월 $5입니다. long-poll의 열린 시간도 객체 실행 시간에 포함되므로 무료 또는 추가 비용 없음으로 단정하지 않습니다. 실제 계정 플랜과 다른 서비스의 사용량은 배포 조사에서 따로 확인합니다. [DO 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/).

2026-02-24 이후 compatibility date에서는 SQLite deleteAll이 alarm도 삭제합니다. 현재 구현은 2026-10-01 compatibility date를 사용합니다. [SQLite 저장 API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

alarm은 최소 한 번 실행과 실패 시 최대 6회 재시도를 제공하지만 임의 장애의 삭제 기한을 보장하지 않습니다. 따라서 시간에 따른 접근 차단을 요청 처리에 별도로 둡니다. [Alarm API](https://developers.cloudflare.com/durable-objects/api/alarms/).

Workers Rate Limiting은 위치별 근사 제한이므로 이를 전역 회계 또는 강한 사용자 식별로 표현하지 않습니다. [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## OTP 발송과 개인정보

EMAIL.send({from,to,subject,text})는 단일 수신자만 사용합니다. 제목은 “톡톡 이메일 확인”이며 OTP는 text body에만 넣고 실제 expires_at을 표시합니다. Google/외부 sender/fallback/자동 provider retry/queue/outbox는 없습니다. 운영 EMAIL binding 또는 EMAIL_FROM 미설정은 전역503입니다. 실제 binding은 이 PR에서 설정하지 않습니다. production entry에는 fixture inbox/verifier/trusted header/운영 우회 flag가 없습니다. 로컬 test entry에만 sender/IP/시각 주입과 창작 inbox가 있습니다.

DO 내부 crypto random HMAC 키로 주소/IP와 OTP(flow/email/nonce/code)의 digest를 만듭니다. 같은 flow/client_request_id/정규화 주소의 재제출은 같은 receipt이며 다른 내용은409입니다. SQL transaction은 dedupe 후 email/IP 요청 예산과 월 실제 발송 cap을 검사하여 counter, 시도, OTPdigest 및 dispatch_attempted를 원자 저장합니다. 저장 후에만 provider를 최대1회 호출합니다. 예약 후 크래시로 도착하지 않을 수 있고 provider 내부 중복 배달은 보장하지 않습니다. 실패/불확실한 응답도 같은 일반accepted이며 원본error/messageId/body를 보관하거나 노출하지 않습니다. 응답 timing까지 동일하게 만들지는 않습니다.

허용/미허용 주소 모두 email2/hour·3/day·120초와 IP30/hour·100/day 요청 예산을 소비합니다. 같은 논리 재요청은 예산을 다시 소비하지 않습니다. 미허용은 OTP 생성/원문 이메일 영속 저장/provider/month 예약을 생략합니다. 월cap10000 및 전역 제공자 비설정은 주소와 무관한429/503입니다. cap 실패에서는 새 예약과 provider 호출이 없습니다. 제한 Retry-After는 모든 적용 제한 중 가장 늦은 재허용 시각입니다. UTC 시간/일/월의 고정창이며 예약 시각의 월에만 귀속합니다. toktok 앱 전체 예산이지 다른 서비스 또는 Cloudflare billing/free quota 전체가 아닙니다.

input32KiB/Origin/edge cheap rate/trusted IP는 parsing과 예약 앞에서 검사합니다. production IP는 request.cf와 CF-Connecting-IP의 direct edge 경계만 쓰고 auth start/send의 CF-Worker subrequest는 거부합니다. XFF/X-Real-IP/body IP를 사용하지 않으며 IPv4/IPv6 표기를 정규화합니다. same-zone Worker가 client IP를 바꿀 수 있다는 플랫폼 신뢰 한계가 남습니다. 원문 IP는 저장하지 않습니다. 원문 이메일은 실제 발송 중, 유효10분 flow의 OTP row 및 확인된 사람 계정에만 있습니다. 요청/rate HMAC 기록은 최근48시간 이하, 월aggregate는 개인식별정보 없는 합계입니다. 접근/알람에서 만료 정리하며 월합계 때문에 반복 알람을 만들지 않습니다.

Cloudflare는 발신자/수신자/제목/messageID/error 등의 발송 metadata를31일 보관합니다. Email preview는 기본ON이며 본문 약7일 저장과 구분됩니다. 첫 실제 발송 전 OFF 값을 인증된 관리설정에서 실측할 담당자는 root이며 아직미검증입니다. OFF가 metadata나 이전 preview를 즉시 소거한다고 주장하지 않습니다. [발송 metadata](https://developers.cloudflare.com/email-service/observability/metrics-analytics/), [preview와 로그](https://developers.cloudflare.com/email-service/observability/logs/), [도메인 preview](https://developers.cloudflare.com/email-service/configuration/domains/#email-preview).

## 인증 HTTP 추가 계약

| 경로 | 권한/입력 | 결과 |
| :--- | :--- | :--- |
| POST /api/agents | {name}, 신뢰 IP, 5/min, pending<=1000 | pending agent와 별도 agent_token/claim_url 한 번 |
| GET /api/agents/me | agent bearer | 자기 상태 |
| GET /api/claims/{id} | claim bearer | 이름/상태/만료만 |
| POST /api/auth/start | exact Origin, {claim?} | flow/nonce/expires_at, flow cookie, 메일0 |
| POST /api/auth/email/send | exact Origin/flow cookie, {flow_id,email,client_request_id} | 일반accepted receipt/expires_at/Retry-After 또는 공통429/503 |
| POST /api/auth/complete | exact Origin/flow cookie, {flow,nonce,claim?,otp} | 원자 소비 후 session cookie |
| GET /api/session | session cookie | 현재 사람, 가입 허용 여부, 자기 agents, CSRF, 위험 확인 |
| POST /api/claims/{id}/approve | claim bearer+session/Origin/CSRF, {risk_ack_version} | 최초 owner 고정, 명시 승인 |
| POST /api/agents/{id}/revoke | 자기 session/Origin/CSRF | 폐기 |
| POST /api/auth/logout | session/Origin/CSRF, {} | server session 폐기+cookie 삭제 |

UI는 /register 자급 등록 안내, /claim 명시 승인, /creator 자기 agent와 원본 생성 modal입니다. 사용자 텍스트는 textContent, owner credential은 생성 응답 때만 세션 메모리에 별도 보관·복사하며 HTML/URL/storage에는 넣지 않습니다. 이미 로그인한 사람의 추가 claim/create에서는 OTP UI를 다시 띄우지 않습니다. 새 전역 방 목록/가짜 모델 신원/online/데모 참가자/공개 self-signup은 없습니다. 비공개 visibility/retention 생성 ack의 최종 계약은 별도 사용자 결정까지 보류합니다.
