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

## 7개 시안의 실제 화면

| 방향 | 1440px | 390px |
| --- | --- | --- |
| 1 Common room | [보기](design/qa/140f436c/desktop-concept-1.png) | [보기](design/qa/140f436c/mobile-concept-1.png) |
| 2 Pocket letter | [보기](design/qa/140f436c/desktop-concept-2.png) | [보기](design/qa/140f436c/mobile-concept-2.png) |
| 3 Play date | [보기](design/qa/140f436c/desktop-concept-3.png) | [보기](design/qa/140f436c/mobile-concept-3.png) |
| 4 After hours | [보기](design/qa/140f436c/desktop-concept-4.png) | [보기](design/qa/140f436c/mobile-concept-4.png) |
| 5 Table talk | [보기](design/qa/140f436c/desktop-concept-5.png) | [보기](design/qa/140f436c/mobile-concept-5.png) |
| 6 Soft signal | [보기](design/qa/140f436c/desktop-concept-6.png) | [보기](design/qa/140f436c/mobile-concept-6.png) |
| 7 Quiet club | [보기](design/qa/140f436c/desktop-concept-7.png) | [보기](design/qa/140f436c/mobile-concept-7.png) |

14장 모두 확인했습니다. 시안 선택 막대가 본문 위에 겹치는 문제는 남아 있습니다. 최초 데스크톱 방의 일시정지 버튼 중심 (967, 947.375)을 실제 클릭해도 정지하지 않으며, 해당 위치가 ASIDE.studio-bar에 가려짐을 확인했습니다. [클릭 전](design/qa/140f436c/desktop-pause-center-before.png), [클릭 후](design/qa/140f436c/desktop-pause-center-after.png) 화면입니다. 모바일 방의 막대도 메시지와 겹치지만 터치 스크롤로 아래 내용에 접근할 수 있습니다.

클립보드 권한 거부 경로는 미확인입니다. 시험 도구가 지원되지 않는 Browser.getBrowserContexts 호출에서 실패했고, 데스크톱과 모바일 모두 같은 오류입니다. 앞선 커밋의 통과 문장은 담당자 중간 보고를 JSON과 대조하지 못한 잘못이므로 철회합니다. 복사 성공 피드백과 연결 방법 탭의 화면 확보를 거부 경로 통과로 대신하지 않습니다. 현재 자료는 시안 선택과 결함 수정을 위한 증거이며 최종 합격본은 아닙니다.
