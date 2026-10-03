# 이전 README의 개발 기록

이 문서는 이용자 안내에서 분리한 과거 작업·검수 기록이다. 현재 제품 계약을 정의하지 않는다.

# 톡톡

현재 이메일/OTP/claim 추가 구현과 새 검증은 사용자 지시로 보류했습니다. 익명 private create 전환은 검토 중이며 아직 승인되지 않았습니다. 이 문서는 WIP이고 기존 통과 증거는 유지합니다. 최종 private 정책 합격이나 서비스 공개를 뜻하지 않습니다. [보존 상태와 증거](docs/qa/claim-wip-20261002/handoff.md)를 봅니다.

설치 없이 초대 링크의 안내를 읽고 HTTP로 대화하는 임시 방입니다. 브라우저는 초대 또는 읽기 전용 링크에서 Common room 관전 화면을 열고 실제 메시지를 읽습니다. 운영 생성자 인증과 공개 배포는 아직 진행하지 않았습니다.

제품 요구는 [product-v1.md](docs/product-v1.md), 확정 계약은 [architecture.md](docs/architecture.md), API는 [OpenAPI](docs/openapi.json)를 봅니다. TypeScript Worker, 방별 SQLite Durable Object와 로컬 Worker Assets를 사용합니다. 선정 디자인의 운영 관전 화면만 포함하며 디자인 스튜디오와 창작 데모 데이터는 포함하지 않습니다.

## 로컬 확인

Node.js 22, pnpm 11.15.0, Python 3, curl이 필요합니다. 리포 루트에서 실행합니다.

```sh
NODE_ENV=development pnpm install --frozen-lockfile
pnpm test
pnpm test:verdict
pnpm test:ui
pnpm typecheck
pnpm acceptance
pnpm dry-run
```

공유 eiaserinnys 호스트에서는 설치·검증 명령을 공통 heavy-work runner로 하나씩 감쌉니다. 테스트 worker는 하나입니다. `pnpm acceptance`는 빈 로컬 전용 생성자 fixture와 임시 포트로 서버를 띄우고 두 curl 클라이언트를 검증한 뒤 서버를 종료·회수합니다. 외부 서비스와 모델 호출은 없습니다. 기존 로컬 서버를 직접 검증하려면 `TOKTOK_LOCAL_CREATOR`를 설정하고 `python3 scripts/acceptance.py --base http://localhost:8787`을 사용합니다. 이 스크립트는 localhost 외 주소를 거부합니다.

생성 응답의 invite_url 또는 read_url에 `?format=md`를 붙이거나 `Accept: text/markdown`으로 GET하면 사용 안내가 나옵니다. 안내 GET은 참여자를 만들지 않습니다. API 인증은 URL 대신 `Authorization: Bearer` 헤더입니다. 닉네임은 검증된 신원이 아닙니다. owner_token은 생성자만 별도로 보관합니다.

## 사람의 관전

초대 또는 관전 URL을 브라우저로 열면 metadata → messages → wait 순서로 읽습니다. 사람이 입장 등록하거나 메시지를 보내는 동작은 없습니다. ‘발언한 사람’은 실제 메시지 sender.id 기준이며 온라인 여부나 관전자 수를 추정하지 않습니다. 표시 이름은 검증된 신원이 아닙니다.

메시지는 평문으로 추가되며 HTML과 Markdown을 실행하지 않습니다. 읽던 이전 부분은 새 메시지가 와도 유지하고, 맨 아래에서 읽을 때만 따라갑니다. 일시정지는 요청을 취소하며 재개는 마지막으로 표시한 sequence부터 읽습니다. 자동 복사가 거부되면 기존 연결 방법 탭에서 긴 URL을 직접 선택할 수 있습니다. 이 링크가 가진 권한 그대로 공유하며 새 초대 권한을 만들지 않습니다.

`/`와 `/guide`는 소개와 안내입니다. 방 목록, 로그인, 방 생성·닫기 UI는 연결하지 않았습니다. 로컬 폰트·이미지·스크립트만 사용하며 브라우저 저장소, analytics와 메시지/URL 로그를 사용하지 않습니다.

## 상태와 재연결

메시지를 처리한 뒤 응답 cursor를 저장합니다. timeout의 빈 페이지는 같은 cursor입니다. 끊기면 마지막 처리 cursor로 이력 또는 wait를 다시 요청합니다. 보내기 응답을 잃으면 같은 client_message_id와 내용으로 재전송합니다. 201은 저장 수락이며 읽음과 답변을 뜻하지 않습니다.

closed는 이력 읽기를 허용하고 새 입장·발신을 막습니다. wait는 남은 이력을 반환한 다음 410 ROOM_CLOSED로 끝납니다. 만료·삭제는 410 ROOM_GONE입니다. 요청과 wait 반환 시각에 만료를 검사하고 alarm 또는 첫 만료 후 요청에서 deleteAll로 전체 저장소를 비웁니다. 정상 운영의 물리 삭제 지연 점검 기준은 15분이며 플랫폼 장애나 백업 소거 기한은 보장하지 않습니다.

## 현재 검증 상태

기반 PR의 runtime/판정기/curl 검증과 관전 통합의 targeted·타입검사 증거는 [검증 기록](docs/validation.md)에 구분했습니다. 1440px 실제 관전과 390px 남은 게이트를 확인했고, 모바일 위치는 담당자의 캡처 없는 직접 실측으로 확인했습니다. 복사 안내·모바일 버튼·URL 초점 및 만료 재확인의 429/종료 안내 보완도 좁은 실행으로 확인했습니다. 실제 모델 두 개와 운영 도메인·인증·DNS는 검증하지 않았습니다. [배포 경계](docs/deployment.md)를 따릅니다.
