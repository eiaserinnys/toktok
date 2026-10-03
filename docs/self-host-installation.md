# 자체 설치

톡톡은 Cloudflare 없이 Node.js 24에서 실행할 수 있습니다. 저장소는 SQLite 또는 기존 PostgreSQL 중 하나만 선택합니다. 같은 서버에서 여러 DB를 동시에 연결하거나 동기화하지 않습니다.

## SQLite로 시작

Docker Compose와 Git이 필요합니다. `selfhost/Dockerfile`은 Node24.21.0 공식 이미지 digest를 고정합니다. SQLite는 Node의 내장 `node:sqlite`를 사용하므로 별도 DB 서버가 필요하지 않습니다.

```sh
cd selfhost
cp env.sample .env
# PUBLIC_ORIGIN을 사용자가 접속할 HTTPS origin으로 설정합니다.
docker compose build
docker compose run --rm app check
# check가 빈 DB로 확인되었을 때만 실행합니다.
docker compose run --rm app apply
docker compose up -d
```

`data` 볼륨의 `/data/toktok.sqlite`에 설정·인증·방 metadata와 저장을 선택한 비공개방 본문을 보관합니다. 공개방과 비저장 비공개방의 본문은 DB에 기록하지 않습니다. `.env`와 비공개 설정 파일은 커밋하지 마세요.

컨테이너는 nonroot `node` 사용자로 실행합니다. SQLite 볼륨에는 한 앱 instance만 연결할 수 있습니다. 같은 파일의 두 번째 앱은 owner lock을 얻지 못하면 시작하지 않습니다. SQLite 파일과 WAL·owner 파일은 같은 로컬 파일시스템에 두며 NFS나 여러 replica에 공유하지 않습니다.

외부 HTTPS reverse proxy가 없다면 기본 포트는 `127.0.0.1:8080`에서만 열립니다. HTTPS 종료와 공개 주소를 운영 환경에 맞게 구성하세요. 프록시의 실제 CIDR을 `TOKTOK_TRUSTED_PROXY_CIDRS`에 명시한 경우에만 전달 IP를 신뢰합니다. 외부 클라이언트가 보낸 Cloudflare/IP 헤더 자체는 신뢰하지 않습니다.

## 기존 PostgreSQL 연결

SQLite 대신 `TOKTOK_BACKEND=postgres`, `TOKTOK_WITH_POSTGRES=true`, `TOKTOK_PG_SCHEMA=toktok`을 설정합니다. 선택한 이미지에만 PostgreSQL driver가 설치되며 SQLite 파일은 열지 않습니다. PostgreSQL은 독립적인 앱 하나가 DB/schema owner lock을 소유합니다. 여러 앱의 memory 방을 DB pubsub로 공유하는 구성은 지원하지 않습니다.

DSN을 명령행 인자로 전달하지 마세요. 로컬 TTY에서 다음 스크립트로 입력을 숨긴 비공개 파일을 준비할 수 있습니다. 이 스크립트는 DB에 접속하지 않습니다.

```sh
./scripts/prepare-postgres-secret ./secrets/postgres-dsn
```

로컬 Compose override에서 이 파일을 읽기 전용으로 mount하고 `TOKTOK_DSN_FILE=/run/secrets/postgres-dsn`으로 지정합니다. 파일은 컨테이너의 node 사용자만 읽을 수 있도록 소유권과 `0600` 권한을 설정하세요. 대상 DB/schema의 사용 권한은 운영자가 직접 준비합니다. 앱은 DB 사용자나 비밀번호를 자동 생성하지 않습니다.

`check`는 schema marker와 충돌 여부를 확인합니다. `apply`는 빈 대상 schema만 초기화하며, 기존 다른 테이블이나 알 수 없는 schema version/checksum을 덮어쓰지 않습니다. 기존 데이터가 있는 경우 자동 reset이나 이주를 실행하지 마세요. DSN을 `docker compose config` 출력이나 로그에 노출하지 않도록 파일 mount를 사용하세요.

## 이메일 OTP와 최초 관리자

기본 상태에서는 메일 전송기를 연결하지 않습니다. 익명 기능을 사용하면서 메일 설정을 나중에 할 수 있습니다. 이메일 가입·로그인을 사용하려면 `TOKTOK_SMTP_CONFIG_FILE`이 가리키는 `0600` JSON 파일을 읽기 전용으로 mount합니다.

```json
{
  "host": "smtp.example.invalid",
  "port": 587,
  "secure": false,
  "from": "login@example.invalid",
  "user": "REPLACE_IN_PRIVATE_FILE",
  "password": "REPLACE_IN_PRIVATE_FILE"
}
```

이 예시는 실제 자격증명이 아닙니다. `secure: false`에서도 STARTTLS가 필수이며 인증서 검증을 끌 수 없습니다. 포트465 등 처음부터 TLS를 사용하는 서버는 `secure: true`를 지정합니다. IP로 접속한다면 인증서 이름을 `servername`으로 지정할 수 있습니다. 앱은 시작할 때 시험 메일을 보내지 않습니다. 실제 요청에서만 공유 OTP template을 사용하며, 전송 결과가 불확실해도 자동 재발송하지 않습니다. SMTP 원문 오류·수신자·OTP를 로그에 기록하지 않습니다.

최초 관리자 이메일은 비공개 배포 환경의 `ADMIN_BOOTSTRAP_EMAIL`로 지정합니다. 주소를 리포·공개 문서·스크린샷에 남기지 마세요. 지정된 사람이 OTP 로그인한 뒤 명시적 확인과 CSRF 검증을 거쳐 한 번만 관리자가 됩니다. 환경변수만으로 계정을 만들거나 관리자 역할을 자동 부여하지 않습니다.

Cloudflare native email binding과 자체 설치 SMTP는 전송 adapter만 다릅니다. 설정·초대·OTP·계정 권한·월 예산 예약은 같은 core에서 검증합니다. SMTP 제공자의 보관·가격·발송 도메인 설정은 별도 운영 정책이며 Cloudflare의 보관 안내를 자체 SMTP에 그대로 적용하지 않습니다.

## 준비 상태와 종료

`/health`는 프로세스 생존, `/ready`는 저장소 소유권과 앱 연결 상태를 반환합니다. 비밀은 포함하지 않습니다. PostgreSQL owner 연결을 잃으면 준비 상태를 닫고 자동으로 다른 주인과 경쟁하지 않습니다.

SIGTERM/SIGINT 또는 `docker compose stop`은 신규 작업을 닫고 대기 요청과 timer를 회수합니다. 앱 종료 유예시간을 임의로0으로 줄이지 마세요. `/ready`가 성공해도 실제 SMTP delivery나 외부 DNS·HTTPS 구성을 검증한 것은 아닙니다.

## 업데이트·백업·복원

업데이트 전 서비스를 정상 종료하고 백업을 만드세요. SQLite backup은 `node:sqlite`의 일관 snapshot API를 사용합니다. 살아 있는 WAL 데이터베이스의 파일 하나만 복사하지 마세요.

```sh
docker compose stop app
docker compose run --rm -e TOKTOK_BACKUP_FILE=/data/toktok-backup.sqlite app backup
```

백업에는 저장을 선택한 대화와 인증 metadata가 포함될 수 있으므로 비공개로 보호합니다. memory 본문은 백업에 덤프하지 않습니다. PostgreSQL은 운영자의 consistent backup/restore 절차를 사용합니다.

새 버전의 schema marker/version/checksum 호환성을 확인한 뒤 업데이트합니다. 자동 destructive migration·DROP·TRUNCATE·down migration은 제공하지 않습니다. 롤백은 이전 앱 버전과 검증된 백업으로 운영자가 명시적으로 수행하며, 다른 서비스의 DB를 덮어쓰지 않습니다.

## Node 직접 실행

Node24.21.0, npm과 `flock`을 준비합니다. PostgreSQL을 사용하지 않는다면 optional driver를 설치할 필요가 없습니다.

```sh
cd selfhost
npm ci --omit=optional
npm run build
# 필요한 비공개 환경변수와 파일을 준비한 뒤 명시적으로 실행합니다.
./scripts/selfhost-setup check
./scripts/selfhost-setup apply
./scripts/entrypoint.sh start
```

구현·포트 구조는 [portable runtime 계약](portable-runtime.md), 개발 검증 기록은 [별도 검증 문서](portable-validation.md)에 있습니다.

## Node schema v2 업데이트

새 SQLite/PostgreSQL 설치의 apply는 v2 marker와 private metadata 순회 index를 만듭니다. 기존 v1은 `MIGRATION_REQUIRED`로 시작을 닫고 자동 변경하지 않습니다. 업데이트 전에 이전 앱의 consistent backup 명령 또는 PostgreSQL의 일관 backup 절차로 복구 자료를 만든 뒤 앱을 정상 종료하세요. 살아 있는 WAL 파일 하나만 복사하지 마세요.

명시적 adapter 접점은 `migrateSQLite(path)`와 `PostgresRepository.migrate()`입니다. 기존 marker/checksum/columns를 확인하고 index와 v2 marker를 같은 transaction에서 전환합니다. SQLite는 같은 volume의 flock entrypoint 아래, PostgreSQL은 serving owner가 없는 상태에서 실행합니다. CLI에서는 앱을 중지한 상태에서 `docker compose run --rm app migrate` 또는 `./scripts/selfhost-setup migrate`를 명시적으로 실행한 뒤 `check`로 확인합니다. 정상 시작과 apply에서는 자동으로 실행하지 않습니다.

업데이트 후 check는 실제 v2 index도 확인합니다. 시작 호스트는 metadata-only ID 페이지와 restore를 완료한 뒤 요청을 받아야 합니다. 실패하면 serving을 시작하지 않습니다. 이전 버전으로 되돌릴 때는 검증된 v1 backup과 이전 앱을 함께 복원합니다. 자동 down/reset은 제공하지 않습니다. Backup은 보관을 선택한 본문의 복구 사본을 포함할 수 있습니다.
