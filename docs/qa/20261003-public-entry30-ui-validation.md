# 공개방 30일 입장권 UI 검증

범위: `toktok--feat-entry30-ca176c2f`의 새 입장권 확인 UI. 실제 운영 승인·게시·메일·권한 설정은 변경하지 않았다. 서버·저장소 공통 계약 검증은 별도 기록이며 아래 결과로 대체하지 않는다.

## 구현 계약

- 짧은 `confirmation_expires_at`과 승인 후 `entry_expires_at`을 구분한다. 새 승인만 승인 시점부터 30일이며, 이전 연결 링크를 연장하지 않는다.
- `entry_notice_version`과 `entry_duration_seconds` 및 기한 형식이 지원 계약과 일치하고 서버 확인 nonce가 있어야 승인 화면을 열 수 있다. 누락·알 수 없는 버전·잘못된 형식은 승인을 막는다. 승인 POST는 서버 projection의 고지 버전과 명시 체크값을 보낸다.
- nonce·증명 cookie·요청 비밀·입장권은 ViewModel에 포함하지 않는다. 공개 요청 식별자만 화면에 표시한다.
- 동일 `public-entry-terms` 컴포넌트를 제품 화면·동의 dialog·보호된 검수면이 사용한다. 실제 `lease_idle_seconds`를 표시하며, 유휴는 마지막 유효 읽기·대기·발언 기준이라고 설명한다. 필드가 없으면 최대 5분 및 더 짧은 방 정책 우선을 알린다.
- 유휴 자리 반납, 빈자리 조건의 재입장, 승인 브라우저 철회, 방 종료·비활성화·재개설 시 무효, 메시지 보관 기간과 입장권 기간의 차이를 고지한다.
- 철회 거절은 기존 승인 상태를 유지한다. 완료로 표시하지 않으며 상태 재확인·에이전트의 정식 요청 취소·관리자에게 방 비활성화 요청을 안내한다. 다른 탭의 preview로 nonce가 바뀌면 돌아가서 상태를 다시 확인하도록 안내한다.
- 공유 registry에 승인 고지 없음, 명시 체크, 승인 중·오류, 유휴 재입장, 철회 오류, 만료 상태를 등록했다. flow의 실제 확인 dialog는 제품 renderer를 사용한다. 재입장·취소·상태 재확인 연결은 reference로 분리한다.
- CSS 치수·인가·예산·저장 정책 변경은 없다.

## 검사와 원자료

모든 실행은 공용 `heavy_verify.py` runner를 사용했다. 단위는 `vitest.unit.config.ts`, 실제 브라우저는 Node 24.21.0 + SQLite + Chromium이다.

| 검사 | 결과 | 범위 |
|---|---|---|
| 신규 입장권 5건 + 기존 연결 영향 5건 | 최초 10 passed, exit 0 | 명시 동의·중복 요청 방지·projection·잘못된 metadata·기한·기존 링크·늦은 응답·공유 등록 |
| 철회 상태 표시·실제 dialog flow 보완 | 2 passed / 3 skipped, exit 0 | 승인 상태에서만 connected 표시, 명시 체크 흐름의 DAG |
| 최종 영향 검사 | 3 passed / 3 skipped, exit 0 | 철회 거절 때 승인 유지, 오래된 nonce 오류, 철회 상태 projection, 추가 오류 flow 누락 검사 |
| 실제 HTTP 브라우저 최초 | 전체 실패, cleanup true | 390에서 사람 승인·30일 기한·agent poll/join·자리 반납·재입장까지 관측. 철회 후 제목 검증에서 실패. 1440 미실행 |
| 실제 HTTP 브라우저 보완 | 2 passed, exit 0, cleanup true | 390은 미도달 철회·보호 QA, 1440은 새 UI 전체. 두 크기에서 실제 사람 승인·철회 POST 각 1건, 철회 후 재입장 403 |
| 소스 정적 검사 | 통과 | 변경 JS syntax 및 `git diff --check` |

최초 실제 브라우저 실패는 철회 응답에 남아 있던 `participant_connected` 표시와 상태 제목의 우선순위 문제였다. UI는 `status === 'approved'`에서만 참가 중으로 표시하도록 보완했다. 서버 projection도 별도 root 보완이 함께 반영됐다. 기존 실패 원자료를 보완 결과로 덮지 않았다.

보완 실행의 390에서는 기존 앞단을 새 가상 요청의 철회 준비에 필요한 정도로만 실행했다. 1440에서는 처음 실행하는 화면·동의·날짜 분리·자리 반납/재입장까지 확인했다. 두 viewport에서 보호된 검수 dialog의 고지 미제공 상태는 checkbox와 승인 버튼이 모두 비활성이고 API 호출 0이었다. CSP 위반·page error·local/session storage·비밀 DOM 노출은 0이었다. 그림은 실제 제품 renderer와 가상 신원을 사용한 로컬 캡처다.

원자료 위치:

- `.local/artifacts/toktok/20261003-entry30-ui/browser.mjs`, `browser.json`: 최초 실패와 390 앞단 관측.
- 같은 폴더의 `correction.mjs`, `correction.json`: 보완 범위와 결과.
- `pending-390.png`, `checked-390.png`, `approved-390.png`: 최초 390 관측.
- `correction-revoked-390.png`, `correction-qa-unavailable-390.png`: 390 후속.
- `correction-pending-1440.png`, `correction-checked-1440.png`, `correction-approved-1440.png`, `correction-revoked-1440.png`, `correction-qa-unavailable-1440.png`: 1440 신규 관측.

입장권 확인 nonce와 agent 비밀은 로컬 프로세스 메모리에서만 사용하며 위 JSON에는 승인 action·지원 고지 버전·boolean 관측만 보존했다. URL에는 agent 비밀이나 입장권을 넣지 않았다.

## 별도 범위

30일 실제 시간 경과, cold actor 복원, Cloudflare·Postgres 계약은 root의 공통 서버 검사 결과를 따른다. 이 UI 검사는 로컬 HTTP이다. 운영 사람 확인이나 배포 성공의 증거가 아니다. 전체 flow board의 실제 브라우저 렌더는 재실행하지 않았으며, 새 flow는 공유 renderer·dialog 연결과 DAG·음성 누락 검사로 확인했다. 철회가 예산·edge 제한에 거절될 수 있다는 서버 정책은 유지한다.
