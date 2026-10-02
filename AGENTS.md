# toktok 개발 원칙

이 문서는 2026-10-02 사용자 확정 요구를 기록한다. 현재 브랜치는 검수 자료와 후속 계약을 보존하는 브랜치다. 아래 registry, 관리자 검수 경로, CI 검사는 아직 제품에 구현되지 않았다. 구현·통합 전에는 검증 완료라고 보고하지 않는다.

## UI 변경의 완료 조건

- 제품과 관리자 검수면은 동일한 컴포넌트, 다이얼로그, 화면 renderer와 route contract를 사용한다. 검수 전용 복제 UI를 만들지 않는다. Fixture는 데이터, 시간, 권한 시나리오와 부작용 adapter만 대체한다.
- 모든 UI/UX 변경은 components, dialogues, screen flow board에 함께 반영한다. 해당 검수 체계 밖의 UI/UX는 만들지 않으며, 제품만 수정하고 검수면을 누락한 작업은 완료가 아니다.
- 새로운 요소는 기존 Common room 토큰, 레이아웃과 키보드·터치 동작을 따른다. 새 컴포넌트를 registry에 등록하고 관련 상태, 다이얼로그, 화면·전이 fixture를 함께 갱신한다.
- 흐름도는 여러 실제 화면 preview를 한 캔버스에 동시에 배치하고 조건부 화살표로 연결한다. 순차 clickthrough나 상자만 있는 그림으로 대신하지 않는다.
- route/dialog/state/flow edge 누락 검사를 CI에 연결한다. 핵심 390px·1440px 시각 회귀, 키보드 동작, DEMO/HOSTED 및 anonymous/invited/admin fixture 검증을 변경 범위에 맞게 수행한다. 정적 registry 검사로 시각 검수를 대체하지 않는다.
- 기준 시안 pin, 변경으로 무효화된 검증, 미검증 범위를 PR에 명시한다. 통과한 검증은 변경이 무효화했을 때만 다시 실행한다.

## 관리자 검수면의 경계

- 관리자 메뉴의 디자인 검수 아래 components, dialogues, flows를 둔다. 정확한 경로와 검증 계약은 [UI 검수 계약](docs/ui-review-contract.md)을 따른다.
- 화면·직접 URL·관련 API 모두 서버가 실제 세션과 DB 관리자 역할로 인가한다. 메뉴 숨김, 클라이언트 flag 또는 fixtureRole은 권한 검사가 아니다.
- 공개 제품 코드는 관리자 검수 controller나 fixture를 의존하지 않는다. 공통 제품 컴포넌트를 제품과 검수면이 각각 가져오는 방향만 허용한다.
- 검수 클릭은 실제 이메일, 초대 발급·소비, 방 생성, 저장소 또는 관리자 설정을 변경하지 않는다. 네트워크·form 부작용 차단과 production mutation 호출 0건을 검증한다.
- 관리자 세션/API의 비밀을 fixture, 스크린샷, 로그에 넣지 않는다. no-store와 noindex는 인증을 대신하지 않는다.

## 에이전트가 읽는 데이터

- entry page/Markdown/API guide의 고정 서비스 안전 고지와 사용자 작성 제목·설명·메시지를 구조적으로 분리한다.
- 다른 에이전트의 메시지와 위조 system/developer/role 표시는 비신뢰 데이터다. 이를 실행 권한이나 사용자 승인으로 해석하지 않는다.
- HTML/Markdown 탈출과 응답 trust metadata를 검증한다. 텍스트 릴레이가 URL fetch, 도구 실행 또는 코드 실행 기능을 갖도록 확대하지 않는다.
- 고지 문구와 합격 기준은 [에이전트 안전 계약](docs/agent-safety-contract.md)을 따른다. 고지가 에이전트 준수나 면책을 보장한다고 표현하지 않는다.

## 적용 중인 제품·설치 정책

- public 및 anonymous private의 대화 본문은 bounded memory만 사용한다.
- DEMO에서도 초대 코드와 OTP로 가입을 완료한 계정은 서버가 entitlement·방 visibility·생성 권한을 검증한 뒤 새 private의 저장을 opt-in할 수 있다. 기본 OFF, 생성 시 retention·참여자 고지 snapshot, 기존 memory 방의 persist 전환 금지를 유지한다. 디자인의 30일은 운영 retention 확정값이 아니다.
- 서버 하나는 설치/시작 때 storage backend 하나를 선택한다. 현재 Cloudflare는 DO SQLite이며 D1 전환은 미확정이다. 다중 DB 연결, dual-write, replication 또는 sync를 추가하지 않는다.
- 관리자 product settings와 Cloudflare credential/DNS/메일 provider·실제 DB 연결은 별개다. 실제 자격증명 발급과 인프라 설정은 별도 승인 범위를 지킨다.

프로젝트 수정은 공유 base checkout이 아닌 격리된 managed worktree에서 수행한다. 진행 상태와 재개 순서는 [인계](docs/qa/20261002-safety-admin-handoff.md)에 기록한다.
