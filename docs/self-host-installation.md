# Selfhost 기반 설치와 검증

현재는 단일 Node24 runtime/storage 기반입니다. 공개 catalogue, SQLite/Postgres repository, HTTP bridge와 private mock 계약은 확인했지만 root control/auth/admin/router와 실제 SMTP 연결은 미완료입니다. 운영에 사용 가능한 전체 제품 완료로 해석하지 마세요.

## 실행 선택

Node24.21.0과 해당 공식 bookworm-slim digest를 selfhost/Dockerfile에 고정했습니다. 호스트 Node22는 바꾸지 않았습니다. SQLite는 node:sqlite DatabaseSync/backup을 사용하며 호스트에 별도 SQLite/PG 서비스를 요구하지 않습니다. Postgres는 WITH_POSTGRES=true 이미지에서만 optional pg8.16.3을 설치·동적 초기화합니다. selfhost/package.json과 lock은 top-level 의존성에서 격리합니다.

설치 시 backend 하나만 선택하며 시작 후 product settings로 전환하지 않습니다. 기본 compose SQLite volume은 /data이고 nonroot node 사용, flock -n -F가 동일 volume의 두 번째 앱을 거절합니다. PG는 schema별 session owner lock으로 같은 DB/schema의 두 번째 앱을 거절합니다. replica/dual-write/NFS/DB pubsub body 공유는 지원하지 않습니다. D1은 사용자 답 대기입니다.

## 명시 작업

아래는 installer 사용 형식이며 이번 검증은 격리 mock volume/DB만 사용했습니다. check는 준비 상태를 조사하고 apply는 식별된 빈 DB/schema에만 초기 marker를 만듭니다. start는 apply를 자동 수행하지 않습니다. DROP/TRUNCATE/reset/down migration은 없습니다.

```sh
docker compose -f selfhost/compose.yaml build
docker compose -f selfhost/compose.yaml run --rm app check
docker compose -f selfhost/compose.yaml run --rm app apply
docker compose -f selfhost/compose.yaml up app
```

PUBLIC_ORIGIN은 실제 HTTPS origin으로 운영자가 명시해야 합니다. DSN은 argv에 넣지 말고 환경변수 또는 TOKTOK_DSN_FILE의0600 secret file로 전달합니다. PG 선택 시 TOKTOK_PG_SCHEMA와 read-only secret mount를 로컬 compose override에서 제공합니다. DSN/email/OTP/body를 compose 출력이나 로그에 넣지 마세요. 프로그램은 고정 오류 code만 출력합니다. 역할/DB 계정을 자동 생성하지 않습니다.

## 백업·업데이트

SQLite backup 명령은 node:sqlite backup API로 일관 snapshot을 만듭니다. 살아 있는 WAL DB 파일 하나만 복사하지 않습니다. local volume의 sidecar/owner file도 같은 filesystem에 두세요. 예를 들어 TOKTOK_BACKUP_FILE을 명시하여 app backup을 실행하며 설치 fixture에서는 먼저 serving을 정상 종료하고 backup/integrity_check를 확인했습니다. backup 파일과 DSN/SMTP secret은 별도 보호가 필요합니다.

PG의 consistent backup/restore는 사용자 운영 절차입니다. 자동 pg_dump/restore나 사용자 DB 변경을 수행하지 않았습니다. 업데이트 전에 backup과 migration marker/version/checksum 호환성을 확인하고 검증된 backup+이전 app으로 rollback합니다. 자동 destructive rollback은 제공하지 않습니다. body memory는 어떤 backup에도 덤프하지 않습니다.

## 현재 미연결

root 공통 router/ControlPlane 설정·예산·auth/admin bootstrap, startup overdue private scan, SMTP 실제 transport/template/secret 설정과 숨김 TTY 설치 UX는 후속입니다. /ready의 현재 foundation 성공은 그 제품 기능 완료를 뜻하지 않습니다. 실제 이메일/사용자 DB/계정/운영 config/Cloudflare 배포는0건입니다.

공식 참고: [Node24 SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [SQLite WAL](https://www.sqlite.org/wal.html), [consistent backup](https://www.sqlite.org/backup.html), [PG locking](https://www.postgresql.org/docs/current/explicit-locking.html), [node-postgres transaction client](https://node-postgres.com/features/transactions).
