# Common room 63c4eec3 실제 렌더 증거

Source: `63c4eec3bc10b84c0a66d00ee9817f12643ba864`, `design/prototype/`.

2026-10-03 KST에 390×844와 1440×1000 독립 browser context에서 렌더한 mock 화면입니다. 실제 계정·운영 화면·비밀에 연결하지 않았습니다. 총 55 PNG의 경로·크기·SHA256은 [manifest.json](manifest.json)에 있습니다.

현재 판정은 초기 렌더 확인입니다. 최종 시각·키보드·flow board 통과를 뜻하지 않습니다. 별도 영향 동작 검수는 진행 중입니다. long page는 fullPage, scroll/focus 판정은 viewport와 실제 좌표를 기준으로 합니다. 30일 보관, 가입 UUID, 계정과 방 정보는 디자인 fixture이며 운영 정책이나 실제 권한이 아닙니다.

대표 자료: [390 홈](390-home-full.png), [390 초대장](390-invite-valid.png), [1440 흐름도](1440-admin-design-flows.png), [390 새 방](390-new-room.png).

## 추가 시각 결함

두 viewport에서 변경 검토 3/10의 적용 시점이 `undefined`로 보입니다. 충돌 4/10은 이전·최신 revision이 12/12, 값이 3/3으로 동일한 fixture입니다. [390 변경 검토](supplement-390-dialog-item-2.png) · [390 충돌](supplement-390-dialog-item-3.png). Root도 원본 PNG를 직접 확인했습니다. 제품 source는 수정하지 않았으며, 이 발견을 포함한 최종 시각 판정은 수정 후 남깁니다.

## 실제 QA 종료 인계

최종 자료는 [qa-handoff.json](qa-handoff.json), 141 PNG 전체 경로·크기·SHA256은 [manifest.json](manifest.json)입니다. 원자료에서 실패 이름이 붙은 캡처는 하니스 실패일 수 있으므로 handoff의 gateInterpretation을 함께 읽어야 합니다. 전체 합격이 아니며 source 수정은 없습니다.

추가 결함: 소개에서 로그인 취소 시 대화방으로 이동, 390px 갤러리가 같은 제품 dialog 본문·버튼을 별도로 축소, OTP 만료 error의 reference 문구가 back과 섞입니다. `소개으로` 오타와 제목 끝 한 글자 고립도 관측했습니다. [로그인 취소](final-details-390-login-cancel-origin.png), [실제 제품 dialog](final-details-390-ordinary-auth-limit.png), [갤러리 dialog](final-details-390-gallery-auth-limit-type.png), [reference 문구](final-details-1440-reference-lane-label.png)를 비교할 수 있습니다.

실제 admin save/conflict/error 흐름과 role-change cancel은 하니스 보정 상한에 도달해 미검증입니다. 서버 관리자 인가·실제 API·배포 검증은 이 mock QA에 포함되지 않습니다. 수정 pin의 영향 경로 및 제품 통합 후 서버·브라우저 검증이 남아 있습니다.
