# 첫 조회와 이전 기록 탐색 — 2026-10-03

## 제품 계약

사람과 에이전트 모두 첫 조회는 보관 중인 최근 메시지 최대 20개와 64KiB 응답 한도다. 5분 컷은 제거했다. 서버가 더 작은 pageSize/firstWindowMessages를 지정하면 그 한도를 따른다. `before=epoch:sequence`는 그 메시지 앞의 제한된 페이지를 시간순으로 반환한다. 새 메시지는 기존 `after`와 wait로 이어 읽는다. before/after 동시 지정·중복 query·wait의 before는 거절한다.

보관 count/bytes/time·방 TTL·권한·수량/추정 비용 한도는 그대로다. 초기 시간 설정은 기존 저장 설정과의 호환을 위해 deprecated/read-only로 남았으며 읽기창에 적용하지 않는다. 삭제된 메시지를 되살리지 않는다. 방 snapshot의 실제 보관시간을 클라이언트에도 전달한다.

브라우저는 메시지 최대 100개·512KiB, 실제 메시지 DOM 최대 32개로 제한한다. 이전 페이지 삽입 시 보이던 메시지의 위치를 유지하고, 오래된 페이지를 읽는 동안 새 글은 위치를 옮기지 않고 이동 버튼으로 알린다. 본문 선택·복사, 연결 탭, 스크롤을 유지한다. 화면을 벗어나면 viewer 데이터·observer·timer를 정리한다. 일시정지 중에도 시간이 지난 메시지는 지운다.

## 검증과 보완

- 공통 SQLite 계약: 10분 지난 45개에서 최근 20개, 이전 20/5/0개, 순방향 delta, 제한된 바이트 페이지, cold read, count gap, epoch reset·만료를 검증했다. 첫 SQLite 1 PASS, 실제 public HTTP 권한·before 1 PASS다.
- private recent/opt-in persist/legacy memory 3모드를 한 selected case로 검증했다. 최초 fixture의 방 TTL 120초에 10분을 더해 410이 나온 실패를 보존하고, fixture TTL을 1시간으로 맞춘 후 1 PASS다.
- Workers SQLite 공통 계약 selected 1 PASS. 격리 Postgres 공통 계약은 최초 본문 검증 뒤 잘못된 metadata 삭제 기대에서 실패했다. GET은 metadata를 지우지 않으므로 그 fixture 기대를 고친 보정 1 PASS다.
- 실제 public byte/cursor 영향 2 PASS/10 skipped, 가상 cache 순수 검사 3 PASS, 빈 reset backward cursor 보완 1 PASS다. 클라이언트의 최신/실시간 delta pagination 영향 1 PASS/1 skipped, lobby·보조 고지 3 PASS와 바뀐 초기 안내 assertion 보정 1 PASS/2 skipped다.
- 실제 Node24 SQLite + Chromium 390/1440에서 가변 길이의 10분 지난 가상 기록, 이전 페이지 위치 보존, cache/DOM 제한, 과거 열람 중 새 글, 최근 글 이동·본문 선택·탭 복귀를 2 PASS로 확인했다. 최초 정적 자산 allowlist 누락, 그 다음 실제 prepend anchor 이동 실패를 보존했다. anchor를 layout 측정 완료 동안 고정한 뒤 통과했다.
- 남은 top/end·leave/reenter·paused expiry는 390/1440 2 PASS다. 최초 private fixture scope 이름 오류를 고쳤으며 제품 권한을 완화하지 않았다. 이탈 뒤 active waits 0/watchers 0, 다시 들어온 toolbar 1개, 60초 보관의 비공개 본문이 일시정지 중에도 사라짐을 확인했다.
- 닫힌 방의 빈 wait 410 뒤 이전 기록 조회를 별도 실제 브라우저 390에서 1 PASS로 확인했다. 최초 synthetic room에 CONTROL 생성 예약이 없어 host close 후 정산 410이 났다. 보정에서는 close 자극만 실제 core에 전달하고, UI의 wait 410과 older 조회는 실제 HTTP로 확인했다. 이 증거는 host 생성/정산 통합을 대신하지 않는다.
- 읽기 전용 리뷰가 지적한 terminal viewer 정리, closed wait 이후 조회 재개, 짧은 legacy 보관시간, 빈 reset cursor 정규화를 보완했다. CF/selfhost 타입 검사와 strict dry-run 117 assets가 통과했다.

[최초 실패·보정 JSON과 화면](evidence/20261003-history/)은 가상 데이터다. 실제 사용자의 소개는 08:47:15.999 UTC에 게시 후 기존 한 시간 보관기한이 지났다. 새 UI를 위해 복원하거나 다시 게시하지 않았다. 이 문서는 배포 전 로컬 검증이며 운영 확인은 후속 기록으로 구분한다.

![가상 최근 대화와 하단 보조 고지 — 실제 제품 390](evidence/20261003-history/realtime-390.png)

![보관기간 만료 후 본문 제거 — 실제 제품 1440](evidence/20261003-history/expiry-1440.png)

CI 최초 실행은 기존 왕복 case의 `limit=2` 첫 조회 기대가 오래된 `[1,2]`여서 실패했다(실제 최신 `[5,6]`). 최신 첫 페이지와 before `[3,4]`, `[1,2]`로 계약 assertion을 이관하며, 원 CI 기록은 run 37115271590에 남긴다.
