# 공개 안내와 로그인 UI 보완 검증

2026-10-03 사용자 승인 범위: 공개 대화를 먼저 보여주고 긴 위험·최근 DB·백업 고지는 대화 아래 보조 영역에 둡니다. 버튼·아이콘·로고·장식의 불필요한 선택과 native drag만 제한합니다. 로그인 버튼의 시안 형태/정렬, 로그인 아트의 하단 정렬과 문구 여백도 보완합니다.

## 변경

- `public-conversation-notes`를 공통 component registry에 등록했습니다. 제품과 공개 room preview가 같은 렌더러를 사용하며 대화 feed와 관전 상태줄 아래에 놓입니다. 기존 12px fineprint와 muted 색을 사용합니다. 공개 연결 dialog의 전체 위험 고지·체크박스·미확인 제출 금지는 유지합니다.
- 공개 gap/reset/truncated 안내도 아래 보조 영역에서 갱신합니다. feed 교체는 날짜 규칙과 메시지만 대상으로 하며 하단 고지를 다시 feed로 끌어오지 않습니다. 세 공개 이력 상태의 screen fixture/route event/flow edge를 함께 추가했습니다. 비공개 이력 경계는 바꾸지 않았습니다.
- `user-select:none`은 버튼형 control, 헤더 navigation, 로고, 아이콘, 아트에만 적용합니다. body/대화/input/일반 콘텐츠에는 적용하지 않습니다. 공통 헤더와 버튼형 링크·장식 이미지의 `draggable=false`, 해당 요소의 WebKit native drag 제한을 사용하며 문서 전역 drag listener는 추가하지 않았습니다.
- 시안 `d6f0e975`의 `design/prototype/styles.css`와 `experience.css`를 직접 대조했습니다. 통합에서 빠졌던 team-button flex/테두리/24px radius와 기존 간격을 복원했습니다. 로그인 아트는 별도 wrapper로 이미지를 프레임 하단에 맞추고 문구는 기존 24px(중간 폭 22px) 여백 안에 둡니다. 모바일 아트 숨김은 기존 계약을 유지합니다.
- 같은 auth renderer에 남아 있던 공개·익명 DB 미저장 문구와 일반적인 “보관 기본 OFF”를 현재 최근 DB 버퍼 및 비공개 장기 보관 기본 OFF로 정정했습니다. 인증 provider나 권한 동작은 변경하지 않았습니다.

## 증거

원자료와 PNG: `.local/artifacts/toktok/20261003-public-notice-ui/`. 저장소에 공유 가능한 수치·결과 요약은 [results.json](evidence/20261003-public-notice-ui/results.json)에 보존했습니다.

| 범위 | 결과 |
|---|---|
| 공통 컴포넌트/실제 client reset/registry 누락 검사 | 3 passed, 3 skipped |
| 독립 검수 뒤 공개 gap/reset/window fixture 및 registry 보완 | 2 passed, 5 skipped |
| 실제 local Node24 SQLite 공개 UI 390/1440 | 안내가 feed 외부·아래, 12px, 메시지보다 작음, 대비 4.986:1; 실제 본문 선택/스크롤, 로고 native drag 방지, 로그인 pill 정렬 관측 통과 |
| 실제 local risk dialog 390/1440 | 전체 DB/PITR 문구, checkbox 초기 미확인, 제출 disabled 유지 |
| 로그인 390/1440 | Ctrl+A로 입력 전체 선택·삭제·재입력, 모바일 버튼 44px/데스크톱 46px; 데스크톱 image-bottom gap 0px/caption-bottom gap 24px; 모바일 아트 숨김 |
| protected QA 공개 room 기본 preview 390/1440 | 동일 하단 렌더러, API 호출 0 |
| 최종 신규 QA 3상태·auth 문구 delta 390/1440 | 2 passed, API 0/CSP 0/pageerror 0/storage 0, cleanup true |
| 독립 읽기 검수 | 최초 공개 이력 preview 위치 불일치 1건 지적 → 보완 재검수 추가 blocker 0 |

최초 browser run은 390 공개 UI 관측 뒤 `type=email`의 `selectionStart`를 지원하는 것으로 가정해 실패했습니다. 실제 키보드 선택·삭제로 보정한 continuation은 390 auth/QA를 통과했습니다. 이어 1440 공개 UI 관측 뒤 로고 drag 끝점이 링크 안쪽이라 정상 클릭으로 홈에 이동해 다음 selector가 실패했습니다. 제품 수정 없이 끝점을 링크 밖으로 옮긴 1440 미도달 dialog/auth/QA tail은 통과했습니다. 각각 `browser-initial.json`, `browser-correction.json`, `browser-tail.json`을 유지하며 최초 실패를 전체 PASS로 덮지 않습니다. 앞선 성공 범위 전체 재실행 없이 setup과 미도달 구간을 분리했습니다.

최종 `browser-final-delta.json`은 독립 검수 후 추가된 공개 gap/reset/window preview 및 auth 장기 보관 고지의 두 viewport 결과입니다. `public-final-390.png`, `public-final-1440.png`, `login-final-390.png`, `login-final-1440.png`와 새 flow PNG를 보존했습니다. 초기 모바일 full-page 캡처의 스크롤 위치 때문에 보였던 화면 밖 skip link는 최종 문서 스크롤 0 캡처로 구분했습니다. 스크린샷은 창작 대화·로컬 서버이며 운영 사용자의 대화가 아닙니다.

브라우저에서 수행한 로컬 요청은 관전 watcher/lease와 미제출 동의 dialog의 ack-flow뿐이며 실제 메일/공개 메시지 발신은 없습니다. 서버 권한·예산·저장·보안 설정은 바꾸지 않았습니다. 배포와 현재 운영 사람 확인/소개 게시 절차는 root가 별도로 처리합니다. 이 기록은 운영 AUTH_PROVIDER_UNCONFIGURED 해결이나 생산 환경 배포 검증을 주장하지 않습니다.

## 추가 승인: 공개 연결 확인·완료 화면 하단

공개 에이전트 요청의 pending/approved/joined 화면에도 기존 `x-panel`을 사용하고 패널 사이를 28px 띄웠습니다. 장문의 안내·요청 식별자는 줄바꿈하며 마지막 control 뒤의 기존 패널 padding을 보존합니다. 페이지 바닥은 기존 54px(모바일 28px)과 safe-area 중 큰 값입니다. 위험 확인 dialog는 등록된 `renderRiskCheck`와 기존 check-row 스타일을 재사용하고 문단 사이 18px, 체크 행 앞 24px, 기존 dialog 바닥 padding 36px/모바일 30px과 safe-area를 유지합니다. 기존의 8개 public-connection 화면·4개 dialog 상태·action flow는 모두 이 동일 renderer를 사용합니다. checkbox 이름/초기값/미확인 금지/pending/nonce/권한 동작은 변경하지 않았습니다.

새로운 `browser-connection-layout.json` 최초 gate는 **2 passed / 0 failed**입니다. 이전 UI 성공 범위는 반복하지 않았습니다. 실제 로컬 Node24 SQLite에서 창작 request를 만들고 창작 브라우저 확인으로 pending → approved → participant join → joined 상태까지 확인했습니다. 메시지 POST는 0건이며 종료 시 연결을 정리했습니다.

| 관측 | 390×667 | 1440×1000 |
|---|---:|---:|
| 패널 → 안내 / 안내 → 안전 고지 | 28px / 28px | 28px / 28px |
| 마지막 control → 패널 바닥(테두리 포함) | 26px | 33px |
| 최종 고지 → 페이지 바닥 | 28px | 54px |
| dialog 바닥 내부 padding | 30px | 36px |
| dialog의 viewport 위/아래 여유 | 약 33px / 33px | 약 229px / 229px |
| 작은 화면 dialog 스크롤 | 유지 | 전체 표시 |
| 수평 넘침 / CSP / pageerror / storage | 0 | 0 |

작은 화면에서도 scroll 후 확인·돌아가기 버튼과 바닥 여백을 직접 확인했습니다. unchecked 상태에서는 승인이 disabled이며 실제 local 승인·join 이후 화면 하단 간격도 유지됩니다. `connection-{pending,approved,joined}-{390,1440}.png`와 `connection-dialog-bottom-{390,1440}.png`는 모두 로컬 창작 데이터입니다. 운영 소개 게시 증거가 아니며 비밀 request/lease/grant는 raw에 저장하지 않았습니다. 독립 읽기 검수는 추가 결함을 발견하지 못했고 foreground는 정상 회수했습니다.

## 통합 검수용 화면

아래 이미지는 실제 로컬 서버에서 창작 데이터로 렌더한 화면이다. 운영 계정·메일·승인 비밀을 포함하지 않는다.

- [공개방 390](evidence/20261003-public-notice-ui/public-final-390.png), [1440](evidence/20261003-public-notice-ui/public-final-1440.png)
- [로그인 390](evidence/20261003-public-notice-ui/login-final-390.png), [1440](evidence/20261003-public-notice-ui/login-final-1440.png)
- [연결 승인 390](evidence/20261003-public-notice-ui/connection-approved-390.png), [확인 dialog 하단 390](evidence/20261003-public-notice-ui/connection-dialog-bottom-390.png), [참가 완료 1440](evidence/20261003-public-notice-ui/connection-joined-1440.png)
- [공유 flow 390](evidence/20261003-public-notice-ui/flow-final-390.png)
