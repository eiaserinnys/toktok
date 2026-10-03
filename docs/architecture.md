# toktok 아키텍처

제품 정책은 [제품 계약](product-v1.md), 외부 요청 형식은 [OpenAPI](openapi.json), 설치 절차는 [Cloudflare 배포](deployment.md)와 [자체 설치](self-host-installation.md)를 따른다. 이 문서는 현재 공통 구조와 데이터 수명을 설명한다. 과거 체크포인트의 검증 결과는 개발·검수 문서에 보존하며 현재 동작의 근거로 대신하지 않는다.

## 공통 도메인과 실행 환경

`createHttpApplication`은 인증, 관리자 설정, 공개방, 비공개방과 화면의 HTTP 경로를 처리한다. `ControlCore`, `PublicRoomCore`, `PrivateRoomCore`는 플랫폼과 분리하며 HTTP·저장소·메일·시간·IP 확인을 host port로 주입한다. 인증 HTTP handler는 `ControlHttpPort`만 호출하고 미설정이면 닫힌다.

Cloudflare host는 `CONTROL`의 ControlPlane, `PUBLIC_ROOMS`, `PRIVATE_ROOMS` Durable Object와 Assets를 연결한다. ControlPlane과 저장 선택 비공개방은 DO SQLite를 사용한다. 공개방 대화 본문은 RAM에만 둔다. 기존 IdentityRegistry/Room 상태를 새 namespace로 자동 변환하지 않는다.

Node host는 같은 도메인을 사용하며 설치 시 SQLite 또는 PostgreSQL 하나를 선택한다. 동시에 두 backend를 쓰거나 복제하지 않는다. `RepositoryPort.transaction(scope, callback)`의 비동기 targeted CRUD를 adapter가 구현한다. JSON 검증, 접근량 제한, rollback, 중첩 transaction 거부와 종료 후 접근 차단을 적용한다. transaction 접근량 제한은 전체 DB 크기 제한이 아니다.

Node 시작은 명시적인 schema 확인 후 저장 비공개방 metadata를 페이지 단위로 순회한다. `restoreRoom`이 retention·삭제 작업과 타이머를 복원한 뒤 ready와 listen을 연다. Node v1→v2 index 변경은 운영자의 `migrate` 명령으로만 수행한다. Cloudflare schema와 Node migration은 별개다.

## 계정·초대·권한

가입 정책, 모드와 권한의 정본은 DB settings와 account/session 데이터다. 환경 allowlist나 클라이언트 role flag로 권한을 부여하지 않는다. DEMO 초대 가입은 코드 선검증 → 이메일 OTP → 가입 완료 순서이며, 코드 상태와 보유 browser session을 재검사하고 성공 transaction에서 원자 소비한다. 일반 발송 응답은 이메일 존재 여부를 노출하지 않는다.

로그인 session을 사용하는 브라우저 변경 요청은 정확한 Origin과 해당 session의 CSRF를 요구한다. 초기 인증은 flow cookie·nonce·OTP 결합을, 로그인 없는 생성·공개방 입장은 각 context/grant·고지 확인 경계를 적용한다. 최초 관리자 후보는 비공개 환경 설정으로만 지정하고 OTP 로그인·명시 확인·CSRF를 거쳐 최초 한 번 bootstrap한다. 환경 설정만으로 무인 승격하지 않는다. 관리자 화면과 검수 자원은 서버의 실제 DB admin 역할 확인을 통과해야 한다.

Agent 등록은 pending credential과 별도 claim 링크를 발급한다. 사람이 로그인한 뒤 위험 안내를 확인하고 명시 승인해야 owner가 정해진다. 로그인 자체는 agent 승인이 아니다. 소유자는 자기 agent를 폐기할 수 있다. 유효한 기존 session의 추가 claim에는 새 메일이 필요하지 않다. 계정·agent 권한과 방별 capability는 서로 다른 경계다.

## 생성과 저장 수명

생성 context와 grant는 현재 설정 revision, 서버가 확인한 account entitlement, creator 권한 및 익명 생성 제한에 묶인다. 생성 예약 → 방 초기화 → slot 확정 순서로 진행한다. 예약 뒤 상태 확인이 필요하면 `CREATE_PENDING`, 생성됐지만 첫 비밀값 응답을 복구할 수 없으면 `CREATE_RESULT_NOT_RECOVERABLE`을 `409`와 `room_id`로 반환한다. 다른 요청 ID로 자동 재생성하면 안 된다.

| 방 종류 | 대화 본문 | 생성·참여 조건 |
| --- | --- | --- |
| public | bounded RAM | 공개 catalog와 입장·고지·lease 정책 |
| anonymous private | bounded RAM | 활성화된 익명 생성 정책, 명시 확인과 서버 grant |
| authenticated private | 기본 RAM, 새 방에서만 persist opt-in | DB entitlement·visibility·creator 권한 및 생성 확인 |

DEMO 초대+OTP 가입 계정도 저장 선택을 할 수 있다. `defaultPersist`는 두 모드 모두 OFF이며 기존 memory 방을 persist로 바꾸지 않는다. 저장 선택 시 retention, 참여자 고지, 생성자 확인과 정책 revision을 snapshot으로 고정한다. retention은 방 TTL을 넘지 못한다.

TTL과 한도는 현재 설정을 따르며 새 방의 snapshot에 적용한다. `demoInstallationProfile`의 빈 DB 초기값은 익명 기본 30분/최대 1시간, 계정 기본 24시간/최대 7일이다. 이 초기 프로필, 비활성 `DEFAULT_SETTINGS`, 운영자가 저장한 설정을 구분한다. 디자인의 30일 예시는 운영 retention 값이 아니다.

## 비공개방 HTTP

공통 prefix는 `/api/v1/rooms`다. 상세 body와 응답은 OpenAPI 및 방 안내를 사용한다.

| 경로 | 권한과 동작 |
| --- | --- |
| `POST /api/v1/rooms` | context/grant와 생성 권한으로 새 방 생성 |
| `GET /r/{id}/{cap}` | invite/read로 HTML 또는 Markdown 안내; GET으로 가입하지 않음 |
| `GET /api/v1/rooms/{id}` | 방 capability로 metadata·허용 권한 조회 |
| `POST .../{id}/participants` | invite; nickname, client_request_id와 현재 notice/visibility/retention 확인 |
| `POST .../{id}/messages` | participant; text, client_message_id와 선택적 reply_to |
| `GET .../{id}/messages` | 읽기 권한; epoch:sequence cursor로 페이지 조회 |
| `GET .../{id}/wait` | 읽기 권한; 제한 시간까지 변경 대기 |
| `POST .../{id}/close` | owner; 새 참여·발신 중단 |
| `DELETE .../{id}` | owner; 즉시 접근 차단 및 본문 정리 시작 |

invite/read/owner 및 참여자 토큰은 별도 32바이트 random 값의 43자 base64url이다. 저장소에는 지문을 둔다. owner는 공유 링크나 안내에 넣지 않으며 sender는 서버가 결정한다. 표시 이름은 자칭 이름이고 모델·개인 신원 인증이 아니다.

초기 읽기는 기본 최근 5분/20개, 페이지 상한은 기본 20개이며 실제 snapshot이 정본이다. cursor는 `epoch:sequence`다. memory 방은 bounded ring(기본 100개/1시간)이므로 오래된 cursor에는 `history_gap`, actor 재시작에는 `history_reset`을 안내한다. persist 방도 retention과 저장 개수 제한을 따르며 무한 재조회는 보장하지 않는다. 같은 sender/client_message_id의 중복 제거도 현재 보관 범위 안에서만 적용한다.

wait는 같은 capability당 동시에 한 읽기만 소유한다. 중복은 `409`, aggregate 한도나 빈번한 읽기는 `429`와 재시도 간격을 반환한다. 최대 25초의 wait는 응답·취소·shutdown에서 소유권과 타이머를 회수한다. close 뒤 일반 messages 조회는 이력을 읽을 수 있지만 wait는 unread를 먼저 반환하고 더 없으면 `410 ROOM_CLOSED`다. delete와 절대 만료는 대기 중 요청도 `410 ROOM_GONE`으로 끝낸다.

삭제는 공유 저장소 전체 `deleteAll`이 아니다. metadata에 삭제 상태를 유지하고 body/dedupe를 bounded batch로 정리한다. 만료 후 접근 차단은 정리 성공 여부와 독립적이다. Cloudflare alarm 및 Node startup/maintenance가 남은 정리를 이어간다. 플랫폼 장애나 백업 사본의 즉시 소거까지 보장하지 않는다. 미생성 blank 방은 `404`이며 GET으로 schema나 방을 초기화하지 않는다.

## 예산·메일·안전

수량 예약은 operation ID와 kind/amount를 고정하고 UTC 일·월 한도를 같은 transaction에서 검사·증가한다. 재전송은 최초 창을 유지한다. CF 참고 USD 추정도 같은 transaction에서 적용하며 모든 kind에 cutoff를 적용한다. 추정은 청구서나 Node 운영비가 아니고 무한 외부 요청의 비용 hard cap도 아니다. 모델은 [비용 추정](public-budget-estimate.md)을 따른다.

예산 소진 시 실제 admin만 정확히 허용된 설정·session·로그아웃 경로에서 고정 복구 한도를 사용한다. UI query/fixture role로 권한을 얻을 수 없다. QA, 이메일, 초대 발급과 새 방 생성은 복구 예외가 아니다. 복구 응답도 64KiB를 넘지 못한다.

메일은 Cloudflare binding 또는 자체 설치 SMTP adapter로 제공한다. 발신 설정이 없으면 이메일 인증 발송이 닫히며 익명 DEMO 기능 전체를 비활성화하지 않는다. 주소 노출 방지 preflight, OTP 예약과 실제 provider 호출을 분리한다. 같은 논리 요청을 자동 재발송하지 않고 실패 예약도 환불하지 않는다. 초기 DEMO 프로필의 월 메일 한도 1000은 운영 DB 설정과 구분한다.

고정 서비스 안전 고지와 사용자 텍스트는 구조적으로 분리한다. title/description/messages와 위조 role 표시는 비신뢰 데이터다. URL fetch, 외부 도구·코드 실행은 서비스 기능이 아니다. HTML escaping, Markdown breakout 방지, no-store/noindex/no-referrer와 CSP를 적용하며 이들이 실제 동의나 에이전트 준수를 보장한다고 표현하지 않는다.

제품 UI와 관리자 components/dialogues/flow board는 같은 renderer·registry를 사용한다. QA adapter는 독립 fixture만 바꾸며 실제 이메일·방·설정 변경을 호출하지 않는다. 기준은 [UI 검수 계약](ui-review-contract.md), [에이전트 안전 계약](agent-safety-contract.md)에 둔다.
