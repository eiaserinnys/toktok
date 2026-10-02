# Cloudflare 배포 준비

이번 backend PR은 dry-run까지만 수행합니다. 실제 배포, DNS 변경, 운영 credential 발급과 계정 설정 변경은 하지 않습니다. 최종 UI는 별도 design/toktok-ui 브랜치에서 검수하며 이 PR에 합치지 않습니다.

## 인증 정본과 현재 경계

담당자의 읽기 조사에서 기존 Vault `shared/cloudflare-eiaserinnys-me`의 `account_id`와 `token`을 인증 정본으로 확인했습니다. 실제 배포 때 이 경로를 재사용합니다. 값은 파일·명령 출력·채팅·커밋에 기록하지 않습니다. 별도 Cloudflare 계정, 새 토큰, 권한 확대 또는 유료 플랜을 만들지 않습니다. 현재 toktok Worker와 hostname은 아직 없습니다.

운영 creator 인증의 발급 및 사용자 확인 경로는 사용자 결정 대기입니다. 지금의 CREATOR_CREDENTIALS_JSON은 빈 명부 `[]`로 생성이 503 CREATOR_AUTH_UNCONFIGURED입니다. 로컬 시험에서만 창작 fixture를 사용합니다. 활성화 시 빈 vars 선언을 제거하고 같은 이름의 Worker secret에 승인된 creator_id/token_sha256/enabled 명부를 주입해야 합니다. 운영 credential 원문이나 명부를 vars, README, CI, 공개 안내에 넣지 않습니다. secret 활성화 뒤 재배포가 빈 명부로 덮어쓰지 않도록 배포 설정을 함께 확인해야 합니다.

## 구성

Worker 이름은 toktok, custom domain은 toktok.eiaserinnys.me 하나입니다. workers_dev와 preview_urls는 false이며 observability/logs/invocation_logs/traces는 모두 비활성입니다. PUBLIC_ORIGIN은 요청 Host와 무관한 설정입니다. 방마다 SQLite Room DO 한 개를 사용하고 v1 migration에서 new_sqlite_classes로 등록합니다. VM, Redis, D1, KV, R2나 LLM SDK는 없습니다.

IP_RATE_LIMIT은 IP당 120회/60초, CREATOR_RATE_LIMIT은 creator당 5회/60초입니다. 로컬 HTTP에는 Cloudflare 주입 IP가 없으므로 curl 시험에서는 IP 제한을 적용하지 않습니다. 운영에서는 edge가 CF-Connecting-IP를 넣습니다. namespace 1001/1002는 배포 전에 기존 계정의 다른 binding과 공유되지 않는지 확인해야 합니다. Cloudflare 위치별 근사 제한이며 전역 과금이나 완전한 사용자 식별은 아닙니다. 방/발신 제한은 Room이 소유합니다.

Workers observability를 끄는 것은 zone HTTP 로그와 플랫폼 보안 로그의 소거를 보장하지 않습니다. 실제 배포 전 계정·zone 로깅 설정과 capability URL의 취급을 확인합니다. 공개 로그·analytics·외부 폰트를 추가하지 않습니다. URL capability는 플랫폼 HTTP 처리에 보입니다.

## 공개 순서

최종 UI 인계와 390px/1440px 검증, 운영 creator 발급 경로, 계정·도메인·rate namespace 확인이 먼저입니다. 타입검사 등 모든 PR 게이트가 통과한 후 담당자가 머지하고 기존 Vault 인증으로 실제 배포합니다. backend 기반 준비를 서비스 공개 완료로 표현하지 않습니다.

```sh
pnpm dry-run
# 위 조건 충족과 담당자 배포 지시 뒤에만 실제 deploy를 수행합니다.
```

CI는 테스트·타입검사·curl 수용·dry-run만 실행합니다. Cloudflare credential이나 운영 배포 단계를 연결하지 않습니다. dry-run은 bundle/config 준비 증거이며 실제 계정 권한·DNS·도메인 응답의 증거가 아닙니다.

## 만료와 데이터 삭제

요청과 wait 반환에서 expires_at 이후 접근을 막습니다. alarm과 첫 만료 후 요청은 목적, 토큰 지문, 참여자, 메시지, 메타데이터와 alarm까지 deleteAll로 삭제합니다. 빈 저장소 조회는 테이블을 다시 만들지 않습니다. compatibility_date는 2026-10-01입니다. 정상 운영에서 물리 삭제 지연 15분을 점검하되 플랫폼 장애 중 절대 최대 지연이나 플랫폼 백업 소거 시점은 애플리케이션이 보장하지 않습니다. 전역 영구 방 목록과 삭제 스케줄러는 추가하지 않습니다.

공식 참고: [SQLite API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Alarm API](https://developers.cloudflare.com/durable-objects/api/alarms/), [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Workers 테스트](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/).
