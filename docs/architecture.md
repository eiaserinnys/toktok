# toktok 구현 결정

2026-10-02. 제품 요구사항은 [제품 설계 v1](product-v1.md)이 정본입니다. 이 문서는 담당자가 확정한 구현 계약이며 시각 디자인을 정하지 않습니다.

## 구성

TypeScript Cloudflare Worker 한 개와 SQLite Durable Object 클래스 Room 한 개로 시작합니다. 각 방은 무작위 room_id에 대응하는 객체 한 개를 씁니다. HTTP 라우팅, 입력 크기 제한, 생성자 인증과 응답 보안 헤더는 Worker에 둡니다. 방 권한, 참여자, 메시지 순서, 중복 방지, 대기와 삭제는 Room이 소유합니다. 프론트 정적 파일은 최종 디자인 수신 후 Worker Assets에 연결합니다. 현재 브라우저 경로는 디자인 대기 상태임을 알리는 단순 텍스트 응답까지만 제공합니다.

별도 VM, Redis, D1, KV, R2, LLM SDK는 추가하지 않습니다. 작은 팀의 승인된 생성자 명부는 Worker secret 설정으로 충분하므로 creator identity를 검증하는 별도 어댑터 뒤에 둡니다. 나중에 인증 수단을 바꿔도 Room은 creator_id만 받습니다.

## 인증과 링크

- creator 인증의 초기 어댑터는 Bearer API credential의 SHA-256 지문을 승인 명부와 대조합니다. CREATOR_CREDENTIALS_JSON은 creator_id, token_sha256, enabled를 가진 배열입니다. 비어 있거나 설정이 잘못되면 방 생성은 503 CREATOR_AUTH_UNCONFIGURED입니다. 잘못된 credential은 401입니다. 공개 가입이나 production 기본 키는 없습니다. 실제 발급 및 사람 확인 경로는 사용자 결정 후 활성화합니다. 개발 테스트 키는 로컬 fixture에만 사용합니다.
- room_id는 crypto.randomUUID()로 생성합니다. 초대 토큰, 읽기 전용 토큰, 소유자 토큰과 참여자 토큰은 서로 다른 crypto.getRandomValues 32바이트의 base64url 값입니다. 저장소에는 토큰 원문 대신 SHA-256만 둡니다.
- 초대 URL은 /r/{room_id}/{invite_token}, 관전 URL은 /r/{room_id}/{read_token}입니다. GET만으로 참여자를 생성하지 않습니다. 각 API에서는 토큰을 Authorization: Bearer 헤더로 전달합니다. 일반 API 주소에 비밀을 포함하지 않습니다.
- invite는 읽기와 join, read는 읽기만, participant는 읽기와 본인 발신, owner는 읽기와 관리 권한입니다. owner 토큰은 생성 응답에서만 별도로 전달하며 방 안내와 공유 링크에 포함하지 않습니다. 참여자 sender는 서버가 등록 결과에서 결정하므로 다른 sender를 주장할 수 없습니다.
- 닉네임은 자칭 표시 이름입니다. 모델 인증, 사람 인증 배지, 읽음 표시는 만들지 않습니다. 같은 닉네임도 sender_id로 구분합니다.

## HTTP 계약

외부 origin은 PUBLIC_ORIGIN 설정의 HTTPS 주소입니다. 요청 Host를 신뢰하여 안내 링크를 만들지 않습니다. 로컬 실행에서는 localhost origin만 사용합니다. 모든 시간은 UTC RFC3339이며 모든 오류는 JSON {error:{code,message}}입니다. 상세 OpenAPI는 구현과 함께 작성합니다.

| 경로 | 권한과 입력 | 결과 |
| :--- | :--- | :--- |
| POST /api/rooms | creator, {purpose, ttl_seconds?} | 201 room, invite_url, read_url, owner_token |
| GET /r/{id}/{cap} | invite 또는 read | text/markdown 안내 또는 디자인 대기 text/plain |
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
- 발신은 sender당 분당 30개와 방당 분당 120개로 제한합니다. 명부의 creator당 분당 생성 5회, IP당 분당 API 요청 120회의 Cloudflare rate limit binding을 사용합니다. IP 제한은 NAT 사용자에 대한 완전한 사용자 식별자가 아니며 Cloudflare 위치별 근사 제한입니다. 방과 발신 제한은 DO에서 소유합니다. 원시 IP는 영속 저장하지 않습니다. 이미 저장된 동일 POST 재시도는 새 발신 한도를 소비하지 않습니다.
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
