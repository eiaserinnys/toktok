# 관리자 복구 사용량의 읽기 전용 표시

실제 AdminBudgetResponse의 recovery를 기존 예산 카드 안에 분·일·월 예약량/고정 한도와 응답 크기/다음 UTC 경계로 표시합니다. 숫자와 한도는 서버 DTO에서만 가져옵니다. 일반 수량/USD와 별도이며 실제 관리자의 필수 설정 복구용이라는 설명을 붙입니다.

- 일반 API·QA·메일·초대·방의 예외가 아니라는 범위를 명시합니다. 입력·토글·한도 해제 동작은 없습니다.
- 기존 schema-cap-list/card/field를 재사용하고 새로운 CSS·치수는 없습니다. registry에 recovery-unavailable component state를 추가해 값이 없으면 확인 불가로 표시합니다.
- 새 DTO/readonly/부재 검사 3 RED→3 GREEN/exit0입니다. 기존 예산 표시 중 영향받은 1개와 변경 coverage/DAG 1개만 추가 실행해 2 passed/2 skipped입니다. 잘못된 작업 디렉토리로 나온 NO_PACKAGE는 NOTRUN으로 분리합니다.
- 1440×1000와 390×844 mock HTTP+Chromium의 새로운 recovery 표시만 2 PASS/0 FAIL/cleanup=true입니다. 3개 readonly 카드, DTO 1/10·7/100·21/1000 및 65536 bytes, 글자 최소 12px, 가로 넘침 0, API mutation/CSP/pageerror 0을 확인했습니다. 이전 auth/settings/admin 성공을 다시 판정하지 않았습니다.
- 독립 readonly 검수 blocker 0입니다. 원자료·가상 PNG는 `.local/artifacts/toktok/20261003-budget-recovery-44ae/`에 보존합니다. 하니스 case/PNG 이름의 description은 기존 템플릿 라벨이며 raw.scope와 실제 화면은 recovery 검사입니다.

실제 복구 인가/같은 DB TX/CSRF/64KiB host 연결은 root/A backend 증거이며, mock 표시 성공으로 대체하지 않습니다. role/query/fixture로 권한을 부여하지 않았고 운영 설정이나 예산을 바꾸지 않았습니다. gallery 최종 이동/역할·모드/누락 음성 대조는 후속입니다.
