# 자체 설치 후속 설계 v1

상태: **설계 확정 / 구현 미착수**. root 결정, 2026-10-02입니다. 이 문서는 전달받은 설계 정본을 보존하며 기존 PR #3 엔진을 이식했다는 보고가 아닙니다. 새 runtime 구현은 최종 settings 계약과 엔진 분리 후 별도 PR/managed WT에서 진행합니다. 현재 공용/UI/auth 파일은 수정하지 않습니다.

## 목적과 기본 선택

- 기존 Cloudflare Worker+DO 배포를 유지하고 같은 HTTP 계약의 자체 설치도 제공합니다.
- 권장 실행은 Docker Compose의 단일 Node 24 LTS 앱 컨테이너입니다. 현재 리포는 작은 TypeScript ESM이며 별도 대형 프레임워크/Redis/메시지브로커를 도입하지 않습니다. Node 24의 정확한 지원 SQLite API와 버전은 이식 구현 착수 때 공식 v24 문서/컨테이너에서 확인하여 pin합니다. 호스트 Node 22는 업그레이드하지 않습니다.
- self-host 기본 DB는 SQLite 로컬 파일 volume(`/data`)입니다. Postgres는 사용자가 가진 서버에 연결하는 선택 adapter이며 Postgres 선택이 다중 앱 인스턴스 지원을 의미하지 않습니다.
- DEMO는 모든 body memory only이고 공개방은 HOSTED에서도 body memory only입니다. HOSTED private의 명시 persist만 DB에 기록합니다. 설정/계정/초대/권한/최소 남용 메타는 DB에 둡니다. 본문을 PostgreSQL NOTIFY/queue/outbox/WAL/로그에 넣어 공유하지 않습니다.

## 설치·시작 시 backend 선택

- 서버 인스턴스는 설치/시작 시 backend 하나를 선택합니다. 현재 지원 예정 선택은 **Cloudflare DO SQLite**, **self-host SQLite**, **self-host PostgreSQL**입니다.
- D1 지원/전환은 사용자 답 대기이며 확정된 지원 범위가 아닙니다. D1과 DO SQLite는 같은 것으로 취급하지 않으며 이 명확화를 위해 현재 엔진을 재작성하지 않습니다.
- backend 선택은 인프라 시작 설정입니다. 시작 후 관리자 product settings로 backend를 바꾸지 않습니다. 공통 core와 RepositoryPort 계약은 유지합니다.
- 선택된 adapter/driver만 초기화합니다. 선택하지 않은 DB의 driver/service/credential을 실행 필수 의존성으로 요구하지 않습니다.
- 동시에 여러 DB에 연결하는 구성, dual-write, replication/sync, 이주용 다중 DB는 요구 범위 밖이며 구현하지 않습니다.

## 구조와 동일 계약

- 도메인 상태 전이/HTTP Request-Response/검증/cursor/throttle은 공통 core로 둡니다. 플랫폼은 `RuntimePort(clock, crypto, room serialization, wait/cancel, scheduler, trusted IP)`, 저장은 `RepositoryPort(atomic settings revision, invite+OTP redemption, budget reservation, private metadata, optional private body)`로 분리합니다.
- SQLite SQL을 Postgres에 문자열 치환하는 가짜 호환층이나 DO API 전체 모방 대신 명시된 repository 연산을 각 adapter가 구현합니다. 저장 연산은 await 가능한 포트이며 DB transaction 동안 외부 메일/longpoll await는 금지합니다. 메일은 원자 예약 commit 후 같은 attempt 1회만 보내고 불확실 응답은 재발송하지 않는 기존 계약을 유지합니다.
- CF DO는 방 actor wrapper, Node는 room id별 직렬 queue입니다. 메시지 수락/sequence/idempotency/quota 판정은 동일 임계구역에서 끝내고 longpoll 대기와 응답 전송은 queue/DB lock 밖으로 뺍니다.
- RAM ring/lease/waiter는 소유 프로세스에만 존재하며 재시작 때 새 epoch입니다. public 초기5분/max20, delta/page bytes/has_more/gap/reset, 30초 발언, fanout 한도, typed DB settings를 동일하게 적용합니다.
- alarm은 Node에서 DB의 `expires_at`/maintenance due를 읽는 bounded 만료 스케줄러와 시작 시 overdue 청소로 대체합니다. 모든 request에서 absolute expiry를 먼저 검사하여 timer 지연 중 접근을 허용하지 않습니다.
- clean shutdown은 readiness를 내리고 신규 요청을 거절합니다. waiters는 재접속 가능한 고정 오류/동일 cursor로 끝내고 timer를 회수한 뒤 DB를 닫습니다. shutdown에 메모리 body를 덤프하지 않습니다.

## SQLite

- 한 앱 프로세스만 허용합니다. WAL+busy timeout+foreign keys를 적용하고 quota/초대/revision은 `BEGIN IMMEDIATE` 등 실제 transaction으로 원자 검증합니다. DB 파일/sidecar는 같은 로컬 volume에 두며 NFS 지원을 주장하지 않습니다.
- Compose entrypoint는 Linux advisory file lock(`flock`)을 잡고 단일 Node를 실행하여 두 번째 동일 volume 앱을 거부합니다. 크래시 후 영구 막힘을 만드는 별도 JSON lockfile 방식은 피합니다.
- 살아 있는 WAL DB를 파일 하나만 `cp`해서 백업하지 않습니다. SQLite backup API 또는 안전한 일관 snapshot 경로를 사용하고 파일/volume과 설정 비밀은 별도 보관임을 설명합니다.

## Postgres

- 기본 전개는 단일 앱입니다. 전용 connection에서 deployment/schema 식별자에 대한 session advisory lock을 잡아 같은 DB/schema의 두 번째 앱을 fail closed합니다. 연결 상실 시 serving을 중지하며 자동 재연결로 소유권 없이 serving하지 않습니다.
- atomic quota는 조건부 `UPDATE ... WHERE used+delta<=limit RETURNING` 또는 잠근 행 transaction으로 처리합니다. invite/OTP/admission/session은 같은 DB transaction, settings revision은 compare-and-swap입니다. node-postgres transaction 전체는 같은 client를 사용합니다. 쿼리는 parameterization하며 오류 원문으로 DSN/password를 노출하지 않습니다.
- 다중 replica는 이번 지원 범위가 아닙니다. 이후 지원하려면 room affinity/fenced owner routing과 memory-only 수명 계약이 필요합니다. 단순 round-robin 또는 DB pubsub로 대화를 공유하지 않습니다. Postgres DB 일관성과 프로세스 RAM 일관성을 혼동하지 않습니다.

## 설치·업데이트·보호

- `docker compose`, `Dockerfile`, `env.sample`, `scripts/selfhost-setup`을 준비합니다. sample은 placeholder만 사용합니다. 이미지/의존성 버전을 pin하고 nonroot, SQLite volume, readiness/healthcheck를 둡니다.
- DSN은 `--dsn-file`/환경변수 또는 숨김 TTY 입력에서 `0600` secret file로 받습니다. argv/echo/로그/보고서/compose 출력에 넣지 않습니다. Postgres 권한은 사용자 제공 범위만 사용하며 role/DB 계정을 자동 생성하지 않습니다.
- setup check는 연결/빈 DB·기존 schema·migration marker/version/checksum·권한 충돌을 조사합니다. 기존 무관 테이블/schema를 덮지 않으며 toktok 전용 schema 또는 식별된 SQLite 파일만 사용합니다. init/migrate apply는 명시 실행 단계이고 자동 DROP/TRUNCATE/reset/기존 DB 변경은 금지합니다. 실제 실행은 로컬 fixture에서만 합니다.
- 정상 시작은 schema 준비 확인 후 수행하며 migration은 명시 명령으로 분리합니다. update 전 backup/호환 version 확인을 하고 rollback은 검증된 backup 복원과 이전 app 조합으로 문서화합니다. 자동 down/reset은 제공하지 않습니다.
- `/health`는 프로세스 생존을, `/ready`는 DB 연결/schema/단일 owner/서비스 종료 상태를 확인합니다. DSN/secret/email은 출력하지 않습니다. admin bootstrap은 승인된 정확 email+OTP+일회 DB role 계약을 재사용하며 최초 방문자를 admin으로 만들지 않습니다.
- `EmailSender` port는 CF native와 self-host SMTP로 분리합니다. API 추가 provider는 요구가 있을 때만 도입합니다. template/limits/reservation은 공통입니다. self-host 발송 미설정 시 auth만 닫히고 허용된 익명 데모는 정책에 따라 동작합니다. SMTP credential은 secret file이며 actual 발송은 하지 않습니다. 제공자별 메일 retention 고지는 CF 31일과 구별하고 unknown을 숨기지 않습니다.
- Node IP는 기본 socket peer입니다. forwarding header는 기본 무시하며 명시 신뢰 proxy 범위/hop 설정이 있을 때만 사용합니다. Node에서 임의 `CF-Connecting-IP`를 믿지 않습니다. HTTPS `PUBLIC_ORIGIN`/Secure cookies/Origin-CSRF/CSP/no-store/noindex/secret URL 로그 금지를 유지합니다.
- 전역 앱 예산은 같은 atomic repository 예약으로 적용합니다. CF billing estimate와 self-host 호스트 비용은 cost profile로 분리하며 같은 달러 가격을 자동 대입하지 않습니다.

## 합격 계획 — 아직 실행하지 않음

- 동일 curl 계약의 2클라이언트 3왕복/재접속/cursor/idempotency/expiry/limits를 CF와 Node에 적용합니다.
- Node+SQLite 로컬 임시 volume 재시작에서 settings/invite/session 유지, memory body 불존재/new epoch, HOSTED opted-in private body만 유지되는지 확인합니다. 동시 quota/invite 경합/다른 앱 기동 거부/graceful 25초 이하 wait 회수를 확인합니다.
- Postgres는 사용자 DB 대신 격리 local container에서 transaction/2connection quota/invite 경합/두 번째 app 거부/기존 무관 schema 충돌 보존을 확인합니다.
- setup blank DB/check/apply/update/backup-restore는 fixture만 사용합니다. stderr/로그에 임의 DSN secret/OTP/body가 없는지 확인하고 destructive/reset 경로가 없음을 확인합니다.
- 기존 통과 gate는 반복하지 않습니다. portability 변경으로 무효화된 공통 gate와 신규 adapter gate만 1회+실패 보정 1회 수행하며 전체 매트릭스를 무작정 확대하지 않습니다.
- 구현 순서는 settings/control 계약과 기존 공개 UI checkpoint → shared pure memory core 추출/CF adapter 회귀 → Node SQLite runtime+installer → PG adapter+동일 계약 → 최종 디자인/admin/auth와 합친 cross-runtime 검증입니다. 설치 문서만으로 실제 지원 완료를 선언하지 않습니다.

## 참고 정본과 후속 입력

root가 지정한 참고 정본은 [SQLite WAL](https://www.sqlite.org/wal.html), [SQLite backup](https://www.sqlite.org/backup.html), [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), [node-postgres transactions](https://node-postgres.com/features/transactions), [Node releases](https://nodejs.org/en/about/previous-releases)입니다. 이 문서 추가 시 런타임 API/컨테이너 버전 검증, 환경 설치, DB 연결 또는 새 gate를 실행하지 않았습니다.

최종 settings/control 및 budget/private metadata 계약이 아직 후속 입력입니다. [현재 공개 엔진 인계](public-validation.md)와 [비용 비교](public-cost-comparison.md)는 Cloudflare 엔진의 기존 결과이며 self-host 결과로 재사용하지 않습니다.
