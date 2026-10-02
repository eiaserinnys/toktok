# toktok 디자인 검수 자료

실제 브라우저에서 촬영한 디자인 데모 화면입니다. 운영 화면이나 실제 계정, 비밀정보는 포함하지 않습니다. 이 브랜치는 배포 대상이 아닙니다.

## 관전 통합: bbd71eb9

Common room이 실제 HTTP 대화를 읽도록 연결됐으며 [PR #2](https://github.com/eiaserinnys/toktok/pull/2)가 main에 반영됐습니다. 운영 생성자 인증과 Cloudflare 배포는 아직 완료되지 않았습니다. 아래 화면은 로컬 Worker에 가상 자료를 넣어 촬영한 원본 뷰포트 캡처입니다. 링크 비밀값은 촬영 전에 A 문자로 대체했으며 실제 계정과 운영 자료는 포함하지 않습니다.

| 최종 보완 | 실제 화면 |
| :--- | :--- |
| 모바일 전폭 버튼과 복사 성공 안내 | [390px](design/qa/integration-bbd71eb9/mobile-copy-success.png) |
| 복사 거부 안내와 URL 선택, 초점 표시 | [1440px](design/qa/integration-bbd71eb9/desktop-copy-denied.png), [390px](design/qa/integration-bbd71eb9/mobile-copy-denied.png) |
| 종료된 초대의 읽기 전용 안내 | [390px](design/qa/integration-bbd71eb9/mobile-closed-invite.png) |

복사 성공과 거부 안내는 두 폭에서 실제로 보입니다. 모바일 버튼의 좌우 끝은 대화 패널과 일치하고 URL 초점에는 기존 초록 외곽선을 사용합니다. [스타일 실측](design/qa/integration-bbd71eb9/style-evidence.json)을 확인했습니다.

만료 재확인에 429 응답을 주는 제어 시험에서 1초 대기 지시 후 재요청 간격은 실행 중 1029ms, 일시정지 중 1028ms입니다. 기한 전 API 요청은 없고 일시정지 중에는 대화를 새로 읽지 않습니다. 실제 로컬 owner close 후에는 이력 한 개가 남고 입장과 발신이 불가능한 안내로 바뀝니다. [계약 실측](design/qa/integration-bbd71eb9/contract-evidence.json)을 함께 제공합니다.

1440px와 390px의 실제 Worker, curl, Chromium 통합 시험에서 왕복 대화, 끊김 후 cursor 재개, 읽던 위치 유지, 종료 이력과 만료 접근 차단을 확인했습니다. 모바일 전체 페이지 캡처가 페이지 위치를 바꾸는 현상은 캡처 없는 대조 시험으로 구분했으며 제품 코드를 수정하지 않았습니다. 기존 통과 항목 전체를 새로 반복한 것은 아닙니다. 상세 범위와 명령은 [검증 기록](https://github.com/eiaserinnys/toktok/blob/bbd71eb9c195e736bc51ddbbf363591d35860414/docs/validation.md)에 있습니다.

[최종 PR CI](https://github.com/eiaserinnys/toktok/actions/runs/37000631148)와 [머지 후 CI](https://github.com/eiaserinnys/toktok/actions/runs/37001177790)가 성공했습니다. 실제 모델 두 개나 실기기 OS 검증은 포함하지 않습니다. 생성 모달은 운영 인증 결정 전이라 이번 관전 통합에 포함하지 않았습니다. 아래 시안 자료는 당시 범위의 기록으로 보존합니다.

## 시안 집중 재검수: 8160fe6e

대상은 `8160fe6e067743cfdfb8ecf0e584ea648103c7d6`입니다. 2026-10-02에 촬영한 원본 30장 중 담당자가 직접 본 대표 14장을 공유합니다. 캡처를 새로 생성하거나 편집하지 않았습니다.

| 화면 | 1440px | 390px |
| :--- | :--- | :--- |
| 홈 전체 | [보기](design/qa/8160fe6e/desktop-home.png) | [보기](design/qa/8160fe6e/mobile-home.png) |
| 방 전체 | [보기](design/qa/8160fe6e/desktop-room.png) | [보기](design/qa/8160fe6e/mobile-room.png) |
| 방 뷰포트 | [보기](design/qa/8160fe6e/desktop-room-viewport.png) | [보기](design/qa/8160fe6e/mobile-room-viewport.png) |
| 생성 모달 | [보기](design/qa/8160fe6e/desktop-dialog.png) | [보기](design/qa/8160fe6e/mobile-dialog.png) |
| 실제 복사 권한 거부 | [보기](design/qa/8160fe6e/desktop-clipboard-denied.png) | [보기](design/qa/8160fe6e/mobile-clipboard-denied.png) |

기존 네 결함이 해결되어 Common room 관전 화면의 실제 HTTP 통합을 시작합니다. 이 판정은 시안의 집중 재검수 결과이며 운영 인증, 실제 서버 연결과 배포의 완료 판정이 아닙니다.

| 확인 항목 | 결과 |
| :--- | :--- |
| 홈 문구 잘림 | 두 폭에서 문구와 점 전체가 보입니다. |
| 버튼과 시안 막대 겹침 | 막대가 상단 문서 흐름에 있고 정상 스크롤 후 pause 중심 클릭과 모바일 tap이 동작합니다. |
| 방별 상태 혼합 | 직접 이동, 뒤로/앞으로, 홈 경유, 대화 갱신 뒤에도 제목과 대화가 분리됩니다. |
| 읽던 위치 초기화 | pause/resume 후 feedTop desktop313, mobile424와 페이지 위치가 유지됩니다. 막대와 방의 좌표 차이도 0입니다. |
| 390px 읽기와 터치 | 기능 메타 글자 12px, 새방 라벨 20px, 피드와 페이지의 터치 스크롤을 확인했습니다. |
| 모달 | 자동 입력 초점, Escape/닫기 후 원래 버튼 초점 복귀, 배경 스크롤 잠금을 확인했습니다. |
| 복사 실패 안내 | 두 폭에서 실제 permission denied와 연결 방법 탭, 실패 안내, 전체 URL 선택을 확인했습니다. |

읽던 위치는 [정지 전](design/qa/8160fe6e/desktop-pause-scroll-before.png), [정지 후](design/qa/8160fe6e/desktop-pause-scroll-after.png), [모바일 재개](design/qa/8160fe6e/mobile-pause-scroll-resumed.png)로 비교할 수 있습니다. [방 이동 후 coffee 대화](design/qa/8160fe6e/mobile-coffee-after-message.png)도 보존합니다.

제한: Tab/ShiftTab 중 document.activeElement가 BODY인 단계가 있어 엄격한 모달 내부 초점 순환은 통과로 표시하지 않습니다. 배경 버튼으로 초점이 이동한 사례는 없습니다. 최초 pause 버튼은 첫 뷰포트 아래이므로 정상 스크롤 후 클릭했습니다. 실기기 OS 복사 메뉴를 시험한 것은 아닙니다. 7시안 전체, 320px, 200% 확대는 이 수정본에서 다시 실행하지 않았습니다. 색상 두 곳과 coffee 아바타 머리글자의 예정된 후속 수정은 이 캡처에 포함되지 않습니다.

[원시 조작 기록](design/qa/8160fe6e/interaction-findings.json)과 [이미지 해시](design/qa/8160fe6e/manifest.json)를 함께 제공합니다. 아래는 수정 전의 보존 기록이며 최신 판정과 구분합니다.

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
