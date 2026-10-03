# toktok 안내 위계 개편 — 구현 인계

2026-10-03 · 디자인 제안, 제품 적용/배포 전

## 결정

소개·방 이름·대화·입장 행동이 첫 번째 위계다. 보관/운영/처리 설명은 관련 선택 바로 아래 또는 화면 맨 아래의 12px 무배경 설명과 native details로 옮긴다. 선택 자체, 공개 범위, 실행 위험, 권한 부여, 키 분실/취소/초안 손실은 14px 이상으로 행동 전에 남긴다. 전체 글씨를 줄이거나 모든 경고를 숨기는 작업이 아니다.

열어 볼 파일: `toktok-notice-preview.html` (CSS/JS 포함, 네트워크 없음). `notice-map.json`은 파일별 before/after 정본. `notice-primitives.mjs`는 제품 포팅용 참조 renderer이며 현재 제품의 대체 구현이라고 주장하지 않는다. `catalog-contract.json`은 등록해야 할 상태/전이 목록이다. 각 화면은 별도 제품 복제본으로 유지하지 말고 기존 shared renderer에 적용한다.

## 확인한 현재 소스

GitHub `eiaserinnys/toktok`, main, 2026-10-03 13:57–14:04 UTC 읽기. 파일 내용의 SHA와 URL은 `source-manifest.json`에 기록한다. GitHub 검색에서 확인한 commit은 `4b3f49c7b3f3a2d3552eaec7b727bc71c25598de`; 개별 fetch는 main 기준이므로 적용자는 최신 diff를 다시 확인해야 한다. 로컬의 이전 디자인 저장소를 배포 원본으로 간주하지 않았다.

## 화면별 추가 결정

- 대화방 목록 `screens/lobby.js`: 상단 우측 큰 공개 안내 카드를 제거. 목록 제목 아래 “누구나 읽는 공개방이에요. 비밀이나 개인정보를 보내지 마세요.” 한 줄. 각 카드의 공개 라벨은 유지. 목록 뒤 최근 N개 안내 카드 대신 대화의 history-navigation 아래 12px 도움말에 실제 `firstWindowMessages`를 연결한다.
- 관리자 초대/운영기록 `screens/adminlogs.js`: 목록/상태/조작이 우선. 초대 원문 일회 제공은 “초대 만들기” 옆 짧은 설명. 기록 범위/미표시 필드는 목록 끝 설명에 배치.
- `dialogs/invitations.js`: 초대 발급의 일회 노출, 취소 대상/영향은 버튼 앞 14px 문장으로 유지. `dialogs/identity.js`: 취소가 이미 실행한 일을 되돌리지 않는다는 결과 설명 유지. `dialogs/bootstrap.js`: 관리자 권한 범위와 명시적 체크 유지. `dialogs/settings.js`: 변경 목록·적용 시점·충돌·초안 손실은 축소 금지. notice 카드 스타일만 무배경으로 정돈 가능. 이는 면책이 아니라 사용자의 현재 결정을 바꾸는 사실이다.
- 에러/권한 없음/만료/네트워크 재시도/생성 결과 불확실/관리키 복구 불가 상태는 일반 정책 펼침에 합치지 않는다. 다음 행동과 함께 기존 가시성을 유지한다.

## 운영 정책 불변

1. 최근 버퍼 최대 500개, 직렬화 본문 합계 2MiB, 1시간 중 먼저 도달하는 한도. 실제 서버 한도와 방 수명이 더 짧으면 그것이 우선한다. 화면의 일반 예시 수치를 서버 snapshot 대신 사용하지 않는다.
2. 비회원 DEMO 새 비공개방은 24시간. 서버가 실제 가입/생성 권한을 확인한 회원 새 비공개방은 소유자가 닫을 때까지. 회원 방은 데모 예산/방 개수 제한에서 제외하지만 기술적 요청/동시성/참가자/보관 상한은 유지한다.
3. 방 수명, 본문 보관, 입장권 수명을 별도 필드로 표시한다. 상설방이 영구 대화 보관을 뜻하지 않는다. 30일은 현재 public-entry 계약의 입장권 기간이며 장기 보관 기간이 아니다.
4. 장기 보관은 새 private + 실제 entitlement일 때만 opt-in, 기본 OFF. `defaultRetentionSeconds`, `maxRetentionSeconds`, 실제 room snapshot을 이용한다. 기존 memory 방 자동 전환 금지. 기존 legacy 연결의 30일 전환 금지.
5. 활성 DB 정리/읽기 불가를 backup/PITR 모든 사본의 즉시 물리 삭제라고 말하지 않는다. metadata 보관은 별도다.
6. 서비스 고정 안전 고지, notice_version, machine acknowledgement 필드와 trust 경계는 유지한다. HTML 보이는 위계만 조정한다. Markdown/HTTP/API guide 원문, 사람의 체크, 서버 authorization/nonce/revision/idempotency는 바꾸지 않는다.

## 구현 순서

1. `public/shared/components/notice-disclosure.js`와 policy summary 추가. native details/summary를 권장한다. custom disclosure를 쓰면 button+aria-expanded+aria-controls와 키보드 지원을 구현한다.
2. 원본 고지 body를 그대로 detail 내부에 넣고, 서비스 고지 version을 기존 데이터 속성에 보존한다. 사용자 제목/이름/메시지는 escape하며 서비스 고지와 섞지 않는다.
3. 각 `screens/*`의 카드 wrapper와 중복 문구를 제거한다. `app.js` metadata 재렌더가 old retention-summary 문단을 되살리지 않게 함께 수정한다. `public-demo-view.js`의 `.warning-note`/`.room-details>span` 같은 위치 기반 selector를 명시적 data-role로 바꿔 이동에 안전하게 만든다.
4. `newroom-mount.js`의 root.innerHTML 교체 전 details의 안정된 id/open을 수집하고 같은 화면의 재렌더 후 복원한다. 입력 포커스와 선택범위 복원도 유지한다. 화면 전환/다른 방에서는 상태를 섞지 않는다.
5. 공개 승인과 기존 public-risk dialog를 분리한다. 30일 문구는 supportsPublicEntry가 확인한 새 계약에만. 고지 미지원이면 fail closed. 사용자 체크를 열람/열림 상태로 대체하지 않는다.
6. registry, components fixtures, dialogues fixtures, flows를 같은 PR에 갱신한다. 현재 renderer를 사용하는 관리자 검수면에 먼저 적용하고 product가 같은 renderer를 참조하도록 유지한다. production은 QA controller/fixtures를 import하지 않는다.

## 디자인 토큰/접근성

- 설명: 12px, line-height 1.7, #5f6d56 on #fffef8 / #f7f6ee. 본문 14–16px. 낮은 위계는 대비 저하가 아니라 크기/배치/장식 감소로 만든다.
- 설명은 아이콘/색 바탕/큰 제목 없음. 1–2줄 summary, 길면 자연 줄바꿈. 필수 정보 말줄임 금지.
- summary와 체크 라벨 터치 높이 최소44px. checkbox도 넓은 label 영역으로 활성화. focus-visible 3px, offset4px.
- 조건부 보관 select는 label과 도움말 id 연결. required 동의는 별도 check. 에러는 role=alert, 로딩/요청 결과는 role=status, 정적 정책은 live region 사용 금지.
- drawer/modal 추가 안 함. 기존 modal의 focus trap/Escape/return focus 유지. 펼침이 incidental rerender에서 닫히지 않아야 한다.
- 좁은 화면에서 footer를 fixed/sticky로 띄워 대화를 가리지 않는다. 장문/200% 확대에서 가로 넘침 없이 자연스럽게 높이가 늘어난다.

## 완료 게이트

정적 검사: package의 Node tests는 정책 분기, escape, disclosure, catalog coverage, artifact shape를 검증한다. 제품 통합 tests와 browser 검증을 대신하지 않는다.

구현 담당자: 390/1440px 스크린샷, 200% 확대, Tab/Shift-Tab/Space/Enter/Escape, opened details 유지, 실제 공유 renderer 기반 component/dialog/flow 검수 필요. DEMO/HOSTED × anonymous/member/admin, recent/persisted/legacy-memory, public30d/legacy, unavailable/pending/error/gap/uncertain 경로를 포함한다. 관리자 검수 직접 URL/API 서버 인가, fixture mutation 0건 검증을 유지한다.

현재 검증 경계: 브라우저/CUA/Playwright 미사용. 독립 PNG는 Pillow로 그린 디자인 판넬이며 HTML 실행 스크린샷이 아니다. 외부 메시지, commit, 배포는 하지 않았다.

