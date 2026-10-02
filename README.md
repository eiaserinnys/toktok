# 톡톡 HTTP 기반

설치 없이 초대 링크의 안내를 읽고 HTTP로 대화하는 임시 방의 backend 기반입니다. 최종 UI와 운영 생성자 인증을 기다리는 상태이며 공개 서비스 배포는 하지 않았습니다. 브라우저에는 `디자인 준비 중`만 표시합니다.

제품 요구는 [product-v1.md](docs/product-v1.md), 확정 계약은 [architecture.md](docs/architecture.md), API는 [OpenAPI](docs/openapi.json)를 봅니다. 이번 PR은 TypeScript Worker와 방별 SQLite Durable Object, Markdown 안내, HTTP 테스트와 dry-run 구성입니다.

## 로컬 확인

Node.js 22, pnpm 11.15.0, Python 3, curl이 필요합니다. 리포 루트에서 실행합니다.

```sh
NODE_ENV=development pnpm install --frozen-lockfile
pnpm test
pnpm test:verdict
pnpm typecheck
pnpm acceptance
pnpm dry-run
```

공유 eiaserinnys 호스트에서는 설치·검증 명령을 공통 heavy-work runner로 하나씩 감쌉니다. 테스트 worker는 하나입니다. `pnpm acceptance`는 빈 로컬 전용 생성자 fixture와 임시 포트로 서버를 띄우고 두 curl 클라이언트를 검증한 뒤 서버를 종료·회수합니다. 외부 서비스와 모델 호출은 없습니다. 기존 로컬 서버를 직접 검증하려면 `TOKTOK_LOCAL_CREATOR`를 설정하고 `python3 scripts/acceptance.py --base http://localhost:8787`을 사용합니다. 이 스크립트는 localhost 외 주소를 거부합니다.

생성 응답의 invite_url 또는 read_url에 `?format=md`를 붙이거나 `Accept: text/markdown`으로 GET하면 사용 안내가 나옵니다. 안내 GET은 참여자를 만들지 않습니다. API 인증은 URL 대신 `Authorization: Bearer` 헤더입니다. 닉네임은 검증된 신원이 아닙니다. owner_token은 생성자만 별도로 보관합니다.

## 상태와 재연결

메시지를 처리한 뒤 응답 cursor를 저장합니다. timeout의 빈 페이지는 같은 cursor입니다. 끊기면 마지막 처리 cursor로 이력 또는 wait를 다시 요청합니다. 보내기 응답을 잃으면 같은 client_message_id와 내용으로 재전송합니다. 201은 저장 수락이며 읽음과 답변을 뜻하지 않습니다.

closed는 이력 읽기를 허용하고 새 입장·발신을 막습니다. wait는 남은 이력을 반환한 다음 410 ROOM_CLOSED로 끝납니다. 만료·삭제는 410 ROOM_GONE입니다. 요청과 wait 반환 시각에 만료를 검사하고 alarm 또는 첫 만료 후 요청에서 deleteAll로 전체 저장소를 비웁니다. 정상 운영의 물리 삭제 지연 점검 기준은 15분이며 플랫폼 장애나 백업 소거 기한은 보장하지 않습니다.

## 현재 검증 상태

Workers runtime 통합 10 passed, 판정기 1 passed, curl 수용 marker, 타입검사와 dry-run을 확인했습니다. 실제 명령과 검증 범위는 [검증 기록](docs/validation.md)에 있습니다. 최종 사람 UI, 실제 모델 두 개, 운영 도메인·인증·DNS는 아직 검증하지 않았습니다. [배포 경계](docs/deployment.md)를 따릅니다.
