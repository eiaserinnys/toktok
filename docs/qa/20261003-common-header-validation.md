# 공통 화면 헤더 정합 검증

소개, 사용 안내, 공개·비공개 관전과 만료 안내가 기존 제품 헤더를 함께 사용합니다. 실제 Session/Config를 읽어 익명 가입·로그인, 회원 계정 메뉴, 관리자 설정을 구분하며 실패는 unavailable로 표시합니다. QA는 fixture VM만 공급합니다.

## 변경 범위

- 공통 화면의 renderProductHeader와 기존 footer 조합을 재사용합니다. 새로운 치수와 CSS는 없습니다.
- header-only hydration으로 관전 feed와 본문을 다시 그리지 않습니다. 이전 조회와 dispose 뒤 응답은 무시하고 이전 세션 조회가 최신 CSRF를 덮지 않습니다.
- 소개의 공개 catalog는 footer 앞에 삽입합니다. 실제 호출 순서는 hero, 공개 목록, footer입니다.
- 공통 역할·loading·unavailable·로그아웃 오류 fixture를 동일 renderer/registry에 등록합니다. 만료 화면은 private route의 nested screen입니다.
- 실제 flow 렌더에서 발견한 재진입 순환은 로그아웃 오류의 별도 상태와 pause→resume의 reference 연결로 정리했습니다. 관전 데이터 처리와 서버 정책은 변경하지 않았습니다.

## 실행과 원자료

- 공통 헤더 targeted 단위 검사는 3 passed/exit0입니다. 서버 역할 VM, 늦은 응답/dispose, 최신 CSRF를 확인했습니다.
- 변경된 registry coverage는 1 passed/exit0입니다. 삭제 음성 대조와 실제 DAG 렌더도 확인합니다. 최초 coverage 통과는 DAG 렌더를 검사하지 않았고, 추가 검사에서 기존 pause/resume 순환이 실패해 reference로 보정했습니다. 잘못된 실행 디렉토리 1회는 NO_PACKAGE/NOTRUN으로 테스트 결과가 아닙니다.
- 390×844와 1440×1000 공통 제품 화면 5개씩 총 10 PASS입니다. 익명 소개/public, member guide/terminal, admin private에서 메뉴·키보드 Space·footer·catalog 순서·가로 넘침·CSP·storage를 확인했습니다. 화면 PNG 10장은 가상 QA 데이터만 포함합니다.
- 최초 QA flows 두 화면은 DAG 오류로 FAIL입니다. source 보정 뒤 두 화면의 모든 iframe ready=true 및 역할별 실제 header가 관측됐지만 하니스의 canonical ID와 contextual @depth ID 비교가 FAIL입니다. 원자료의 실제 ID/header/API0/오류0/CSP0/storage0를 재평가한 별도 관측 검사는 2 PASS/exit0, 새 browser 실행은 0입니다. 이 결과를 원래 browser 실행 PASS로 바꾸지 않습니다.
- 원자료와 가상 PNG는 `.local/artifacts/toktok/20261003-common-header-44ae/`의 raw.json, qa-correction-raw.json, qa-observation-check.json에 보존합니다. 최초·보정 실행은 모두 browser/server cleanup=true입니다.
- 독립 읽기 검수는 blocker 0입니다. 기존 auth/settings/admin/private 데이터 성공 게이트는 반복하지 않았습니다.

## 확인 범위와 남은 작업

이 증거는 mock HTTP 화면과 실제 렌더이며 live backend/header 최종 통합 성공을 대신하지 않습니다. root의 실제 private 390 restart 뒤 새 메시지 tail, 새 admin2 실제 성공 및 실제 header hero 교체는 별도 증거입니다. 공개 관전 limit/timeout 생략과 수치 고지 축소, readonly recovery 표시, dialogue gallery 최종 범위는 후속입니다. 운영 배포·실제 이메일·새 권한·예산 예외 변경은 없습니다.
