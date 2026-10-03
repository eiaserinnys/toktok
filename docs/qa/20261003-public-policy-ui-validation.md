# 공개 관전의 서버 정책 기본값 연결

공개 관전의 최초 읽기에는 query를 보내지 않고 이후 실제 반영한 cursor의 after만 보냅니다. limit와 wait timeout은 현재 서버 정책이 정하며, 최초 수를 pageSize로 축소하지 않습니다. 기존 has_more 다음 페이지, messages→wait, epoch cursor와 2초 최소 간격은 유지합니다.

## 변경과 근거

- 공개 expiry/details와 initial-window 잘림 안내에서 100개/1시간 및 5분/20개의 고정 표시를 제거합니다. 메타데이터에 없는 값을 새 DTO나 복제 상수로 보충하지 않고 최근 보관 범위·메모리·재시작 소실 가능성을 안내합니다.
- 신규 fake-clock 실제 client loop 검사 2 RED에서 2 GREEN/exit0입니다. 서버 pageSize 2 조건의 첫 페이지, has_more 다음 페이지, wait에 after만 보내고 1~4번 메시지를 반영하는지 확인했습니다.
- 한 번의 390 mock HTTP+Chromium 실행에서 initial 7~8, 다음 9~10, wait 11의 실제 DOM 반영, after 8/10, limit/timeout 없음, 최근 범위 고지, CSP/pageerror/storage 0, 넘침 0을 assertion 전에 저장했습니다.
- 그 이후 추가한 이탈 검사는 모바일에서 숨겨진 header nav를 클릭하는 하니스 selector 때문에 FAIL입니다. 실제 루프 관측의 실패로 바꾸지 않으며 이탈은 확인되지 않았습니다. 원래 전체 실행 FAIL과 cleanup=true를 유지하고, 보존된 정책 관측값을 따로 대조한 검사 1 passed/exit0만 기록합니다. 새 browser 반복은 없습니다.
- 첫 준비 명령은 잘못된 경로 때문에 test file을 생성하지 못한 NOTRUN입니다. 이후 실제 두 테스트 RED/GREEN과 구분합니다.
- 독립 readonly 검수 blocker 0입니다. 기존 admission/30초 operator/인증/private/admin 성공 게이트와 엔진 load를 반복하지 않았습니다.

## 자료와 범위

가상 원자료·PNG는 `.local/artifacts/toktok/20261003-public-policy-44ae/`의 raw.json, observations.json, 390-public-page-size-two.png에 보존합니다. 실제 서버 pageSize 2와 firstWindowMessages 3/60초의 초기 2+1 페이지는 root의 별도 실제 backend gate입니다. 운영 정책·권한·예산·엔진·root HTTP 변경은 없습니다.
