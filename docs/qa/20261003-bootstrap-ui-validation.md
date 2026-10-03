# 최초 관리자 명시 확인 UI 검증 — 2026-10-03

## 문제와 변경

OTP 로그인은 지정된 최초 관리자 주소라도 먼저 `member` 계정을 생성한다. 기존 서버에는 `POST /api/admin/bootstrap`이 있었으나 제품 UI에 이 요청을 사용자가 명시적으로 실행할 진입점이 없었다. 관리자 메뉴는 실제 서버 `role=admin`일 때만 보이므로, 정상 로그인 뒤에도 지정 사용자가 관리자 설정을 마칠 수 없었다.

`GET /api/session`에 `can_bootstrap_admin` boolean을 추가했다. 서버의 현재 계정이 검증된 member이고, 정규화된 사전 지정 주소와 같고, bootstrap이 아직 소비되지 않았고, 관리자 record가 없을 때만 true이다. 익명 응답은 false이며 client adapter도 값 누락·비boolean·익명·기존 admin에 false로 닫힌다. 지정 주소와 계정 ID는 이 projection에 추가하지 않았다.

사용자는 **내 자리 → 내 계정 → 최초 관리자 확인**으로 들어가 안내 dialog의 체크박스와 **최초 관리자로 설정** 버튼으로 직접 확인한다. 제품은 현재 session CSRF로 기존 POST를 1회 보내며, 성공 뒤 `/api/session`을 다시 조회한 실제 admin role로 메뉴를 갱신한다. 중복 제출·취소 중 제출·늦은 응답·서버 거절을 처리하며 클라이언트가 관리자 role을 만들어 넣지 않는다. 서버 POST도 동일 eligibility를 다시 검사하고 한 transaction에서 기존 1회 소비와 audit를 수행한다.

제품의 entry component, dialog, account renderer를 component/dialog registry 및 확인→체크→제출→완료/거절/취소 action flow에 함께 등록했다. Flow iframe은 등록한 실제 dialog node를 사용하고 live effect를 갖지 않는다. 기존 Common room 계정 토큰·native dialog·focus trap을 재사용했다.

## 실행 근거

- `test/shared-bootstrap.test.js`와 영향을 받는 account tests: 최초 6 passed / 1 failed. 실패는 같은 워크트리의 history 작업에서 아직 route에 등록되지 않았던 5개 transition의 coverage 오류였다. history route 정합 후 해당 coverage 하나만 다시 실행하여 1 passed / 3 skipped. 기존 성공 6개는 반복하지 않았다.
- 변경된 Session projection의 기존 adapter assertion 하나를 새 false 필드에 맞춰 정합 후 해당 case만 1 passed.
- `test/control-bootstrap-ui.test.ts`: 실제 Workers SQLite + production CONTROL/HTTP handlers 신규 2 passed. 지정 검증 member/기존 member eligibility, 익명·다른 계정·미검증 이메일·소비됨·다른 관리자 존재 거절, Origin/CSRF/confirm 거절, role 보존, 명시 성공 200→admin session/API 200, replay 403을 검사했다. 이메일/OTP 발송은 없다. `test:auth`의 기존 config에 새 파일을 포함했다.
- 실제 Node24 + SQLite + production app/mount + strict CSP, 가상 지정 계정: 390×667 첫 PASS. 1440×1000 최초는 native dialog의 close event 완료 전에 focus를 읽어 실패했다. 원자료를 유지하고 close event와 focus 반환을 기다리도록 관측만 고쳐 1440만 다시 실행, PASS. 제품 보정 없이 완료했다.
- 각 viewport에서 명시 확인 전 mutation 0, 정상 CSRF bootstrap POST 1, DB role/새 session/관리자 메뉴 표시, 취소 시 focus 반환, unchecked 제출 차단, 좁은 화면 dialog 폭, 동일 QA dialog/API 호출 0, CSP/pageerror/storage 0을 확인했다. 실제 서버 설정의 trim/lowercase 지정 주소도 사용했다. 스크린샷을 육안 검토했다.

[원자료](evidence/20261003-bootstrap-ui/)에는 최초 실패와 보정 결과를 함께 보존한다. 모든 계정·세션은 로컬 테스트 가상 데이터이며 실제 운영 관리자 승격 증거가 아니다.

## 남은 경계

운영 사용자 세션/DB를 읽거나 변경하지 않았고, 실제 `/api/admin/bootstrap` POST·새 메일·권한 설정은 하지 않았다. 배포 후 지정 사용자가 자신의 기존 로그인 세션에서 위 확인을 직접 완료해야 한다. 전체 backend 회귀·전체 gallery/flow browser 반복은 하지 않았다. Flow metadata/DAG/누락 검사는 순수 coverage이며 browser의 해당 확인 dialog/계정 화면 검증과 구분한다. 기존 시안 pin 및 공통 header/dialog 스타일은 바꾸지 않았다.
