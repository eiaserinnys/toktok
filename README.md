# toktok 디자인 검수 자료

실제 브라우저에서 촬영한 디자인 데모 화면입니다. 운영 화면이나 실제 계정, 비밀정보는 포함하지 않습니다. 이 브랜치는 배포 대상이 아닙니다.

## 디자인 140f436c

대상: `140f436cee062ef3741ddaeb6f1d85d99ce20536`, 2026-10-02 촬영.

| 화면 | 1440px | 390px |
| --- | --- | --- |
| 홈 | [보기](design/qa/140f436c/desktop-home.png) | [보기](design/qa/140f436c/mobile-home.png) |
| 방 전체 | [보기](design/qa/140f436c/desktop-room.png) | [보기](design/qa/140f436c/mobile-room.png) |
| 방 뷰포트 | [보기](design/qa/140f436c/desktop-room-viewport.png) | [보기](design/qa/140f436c/mobile-room-viewport.png) |
| 방 생성 모달 | [보기](design/qa/140f436c/desktop-dialog.png) | [보기](design/qa/140f436c/mobile-dialog.png) |
| 7가지 방향 목록 | [보기](design/qa/140f436c/desktop-directions.png) | [보기](design/qa/140f436c/mobile-directions.png) |

초기 캡처 10장입니다. 시각 합격이나 최종 디자인 승인이 아닙니다. 개별 7가지 시안과 조작 검수 결과는 이어서 추가합니다.

홈의 그림 왼쪽 위 문구가 데스크톱에서 잘립니다. 방 화면의 시안 선택 막대는 일시정지 버튼과 겹쳐 후속 조작 검수 대상입니다. 시안 선택 막대는 운영 UI에서 제외할 요소입니다.

모달 이미지는 전체 페이지 캡처입니다. 화면 높이 밖에 보이는 배경은 실제 현재 뷰포트가 아니므로 모달 바탕의 결함으로 판정하지 않습니다. PNG는 편집하지 않은 원본이며 해시와 촬영 조건은 각 폴더의 manifest.json에 있습니다.

## 실제 조작에서 확인한 수정 사항

| 재현 | 사용자가 겪는 결과 | 근거 |
| --- | --- | --- |
| 여행 방에서 메시지가 늘어난 뒤 같은 문서의 coffee 방으로 이동 | coffee 제목 아래 여행 대화가 남습니다. | [화면](design/qa/140f436c/desktop-coffee-after-message.png) |
| coffee 방에서 같은 문서의 기본 방으로 이동 | 이전 방의 제목과 대화가 남고 우측 참가자만 바뀝니다. 홈을 거치면 복구됩니다. | [화면](design/qa/140f436c/desktop-coffee-direct-return.png) |
| 대화 피드를 아래로 읽다가 일시정지 | 읽던 위치가 맨 위로 돌아갑니다. 메시지 추가 때의 위치 유지는 정상입니다. | [갱신 후](design/qa/140f436c/desktop-reading-update.png), [정지 후](design/qa/140f436c/desktop-pause-scroll-reset.png) |

방 상태는 현재 경로의 방 식별자로 분리하고, 일시정지와 재개에서는 대화 피드 위치를 유지해야 합니다. [측정된 상태](design/qa/140f436c/interaction-findings.json)를 함께 보존합니다. 남은 모바일 조작과 7개 시안 검수는 진행 중입니다.
