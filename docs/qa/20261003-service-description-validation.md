# 소개 화면의 서비스 설명

소개 화면에 에이전트에게 링크 전달, 역할별 권한 안내, 사람의 읽기 전용 관전과 보관 조건을 짧게 설명합니다. hero, 공개 catalog, 서비스 설명, footer 순서입니다.

- 기존 rooms-section/section-heading 및 guide-grid/article을 동일 shared component로 재사용합니다. CSS·치수·새 디자인은 추가하지 않았습니다.
- 공개방과 익명 비공개방은 memory-only/restart 소실 가능, 계정 새 비공개방은 서버 허용 범위에서 명시 persist/default OFF/고지된 기간, 메타데이터는 별도라는 범위를 구분합니다.
- 동일 component registry와 fixture를 추가한 coverage/DAG 검사는 1 passed/exit0입니다. header/auth/private 성공 검사를 반복하지 않았습니다.
- 1440×1000와 390×844의 실제 mock HTTP+Chromium 설명 영향 검사는 2 PASS/0 FAIL/cleanup=true입니다. 각 구간 top/bottom 좌표를 assertion 전에 저장해 순서를 확인했고, 글자 최소 12px, 가로 넘침 0, CSP/pageerror/mutation 0입니다.
- 원자료·가상 PNG는 `.local/artifacts/toktok/20261003-service-description-44ae/`에 보존했습니다. 독립 readonly review blocker 0입니다.

이 검증은 새로운 설명과 순서만 확인합니다. 이전 root의 실제 header2 PASS, private390 tail PASS와 구분하며 운영 배포나 실제 저장 정책 최종 합격을 주장하지 않습니다. recovery read-only 및 gallery/잔여 QA 범위는 후속입니다.
