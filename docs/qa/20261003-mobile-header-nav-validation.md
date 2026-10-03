# 모바일 주 메뉴의 공통 CSS 우선순위

기존 승인된 모바일 주 메뉴 행이 제품 styles.css의 옛 `.header nav {display:none}`에 가려졌습니다. 같은 shared 헤더의 `.header.x-header>nav`로 우선순위를 명시하고 display:flex를 유지합니다. 기존 grid row·간격·터치 높이·치수는 그대로입니다.

- 처음 public-policy 실행의 모바일 이탈 실패는 단순 하니스 오류라는 초기 해석에서 정정합니다. 메뉴가 숨겨진 실제 IA 충돌이었으며 최초 raw FAIL은 보존합니다.
- 신규 390×844 mock HTTP+Chromium 메뉴 검사 1 PASS/0 FAIL/cleanup=true입니다. 소개/대화방 두 링크가 실제 표시되고 44px 터치 높이를 유지하며, 실제 click으로 /rooms에 이동합니다. CSP/pageerror/mutation/가로 넘침 0입니다.
- 원자료와 가상 PNG는 `.local/artifacts/toktok/20261003-mobile-header-nav-44ae/`입니다. 기존 root header2 PASS는 세션 메뉴/로그아웃/소개 순서 범위이며 숨겨진 주 메뉴 검증으로 확대하지 않습니다.
- 기존 auth/header/public 읽기 성공 전체는 반복하지 않았습니다. 운영 인가·quota·캐시·권한·치수 변경은 없습니다.
