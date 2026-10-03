# 새 비공개방 수명·데모 예산 분리 검증

사용자 명시 승인: 새 비회원 DEMO private는 24시간과 데모 한도, 서버가 가입·생성 권한을 검증한 DEMO 초대가입·HOSTED 회원의 새 private는 소유자가 닫을 때까지 상설이며 데모 예산·방 개수 한도 밖이다. 보관·기술 한도는 별개다. 기존 방을 전환·삭제·강제 종료하지 않는다.

## 구현 경계

- CONTROL이 실제 계정·세션 또는 승인 agent의 owner, 검증 이메일·admission kind·생성 entitlement·확인 grant를 검사한다. `lifetime`/면제 flag를 외부 생성 body에서 받지 않는다. 새 snapshot에만 `demo_24h` 또는 `member_permanent`, 후자는 `expires_at:null`을 기록한다.
- 회원 생성 옵션·context·grant·생성·해당 방의 권한 있는 요청/응답/쓰기에는 데모 수량·USD 예약을 하지 않는다. 일반 session/login/email/admin/public 요청은 기존 집행을 유지한다. `GET /api/private/create-options`는 생성용 최소 세션·정책 projection이며 로그인·관리자 권한·agent 목록 API가 아니다.
- 회원 방은 데모 전역/IP별 활성 방·일 생성 quota를 사용하지 않는다. 총 active 수는 mode-drain/lifecycle 확인에 유지하고 member 수를 분리한다. 기술적 IP별 시간 생성 속도, 참여자 수, read/wait 독점·동시성·payload·본문 한도는 그대로다.
- 최근 DB 버퍼와 opt-in 장기 보관의 기존 정책을 유지한다. 시간 경과·재시작으로 본문이 정리돼도 상설방·참여 capability가 자동 만료되지 않는다. 빈 상설방에는 보관 알람/keepalive가 없다. Node idle core cache는 64개부터 회수하며 DB 방 개수 제한으로 취급하지 않는다.
- 새 context에는 수명 정책 버전을 결합한다. 배포 전 미소비 context/grant는 새 안내 확인이 필요하다. 생성 결과 복구 불가 계약은 유지하며 요청 dedupe·소비 grant/pending index는 24시간까지만 보관한다. 실패·불확실 초기화는 성공으로 꾸미거나 자동 재생성하지 않는다.
- 기존 snapshot에는 수명 분류를 추가하지 않는다. 기존 유한 만료·예산·저장 조건을 유지한다. 기존 방 데이터 조회/변경은 하지 않았다. 신규 null 만료 방이 생긴 후에는 이전 null 미지원 코드로 rollback하지 않는다.
- 새 회원 상설방 비용은 이 데모 추정 장부 밖이다. 월 USD100이 회원 방을 포함한 실제 전체 청구 상한이라는 주장을 하지 않는다. 유료 플랜·보안 권한·메일·DNS·workflow 설정 변경 없음.

## 실행 결과

모든 신원·대화는 격리 로컬 fixture다. Node24 실제 TCP HTTP + SQLite, Workers SQLite/CF actor, 격리 PostgreSQL을 구분한다. 날짜 이동은 DI clock이며 31일 실시간 부하 증거가 아니다.

| 검사 | 실제 결과 |
|---|---|
| 새 Node HTTP 3case | 최초 1PASS/2FAIL. host의 회원 응답 예약 skip 누락 보완 뒤 선택2는 1PASS/1FAIL. 남은 일반 session 오류는 기존 admin-recovery의 403이 정본이라 fixture 429 기대만 정정, 실패1 PASS. 최종 3case의 증거가 분리되어 있음 |
| 기존 snapshot/거부 예산 추가 확인 | 기존 방 예산 admission 순서를 보존한 뒤 선택1 PASS. 새 member 우회로 넓히지 않음 |
| Workers SQLite/CF actor | 신규2 PASS. 같은 TX 예산 증가0·snapshot, 실제 actor eviction 후 cursor/권한 복원, 빈 상설방 alarm null |
| PostgreSQL | 신규1 PASS, 격리 postgres16 container 종료. 같은 recent/persist·멱등성·회원 권한 계약 |
| CONTROL 생성 영향 | 3PASS/5SKIP. grant·경합·demo quota·만료·mode-drain |
| 공통 Workers HTTP 영향 | 7PASS/6SKIP. 생성·권한·cap·history·close/delete·입력·자산. 원문에 request-stream 경고 **7건** 존재; 이번 작업에서 원인 확정/해결 주장하지 않음 |
| 기존 private 실제 Node HTTP conformance | 변경된 수명 fixture로 3PASS. 권한/고지/재시작/참여자 상한 유지 |
| UI controller/adapter/registry | 16PASS; 후속 settings/notice/graph 영향 16PASS. 동일 성공 케이스 일부가 registry 영향 확인에 포함됨 |
| 실제 로컬 제품 브라우저390/1440 | 최초 2FAIL은 테스트 secure cookie의 url 입력 형식. domain/path로 보정2PASS. 캡처에서 발견한 유한수명 sidebar 안내를 공유 renderer로 보완, 실제 관전 안내 tail2PASS. 본문 가상, 생성201·owner secret DOM 비노출·cleanup |
| 보호된 QA flow390/1440 | 최초2FAIL은 생성 완료 fixture가 24시간 문구 대신 정확 ISO 만료를 보여 주는데 regex가 거절한 하니스 문제. 기대값 정합 후2PASS, 해당 iframe ready·새 member/demo 생성/완료 노드·API0·pageerror0. Screenshot 초기 캔버스는 전체 흐름, 새 노드 문구는 실제 iframe DOM 관측 |
| 타입/빌드 | CF/Node 타입 오류는 새 nullable 계약의 test 타입만 보완. 최종 둘 다 exit0, generated check0, Wrangler 최종 dry-run exit0. OpenAPI JSON 중복키0/59경로/814참조 미해결0; diff check0 |

초기 실패·후속 원문은 [evidence](private-lifetime-evidence/)에 별도 보존하며 [manifest](private-lifetime-evidence/manifest.json)의 SHA256은 복사한 로그 원문 기준이다. 기존 413 upstream-cancel FAIL을 이 검사로 성공 처리하지 않는다.

## 화면

제품과 QA는 같은 newroom/common-room renderer, 위험 확인 component, registry·action graph를 쓴다. 새 dialog나 복제 UI/CSS는 추가하지 않았다. 기존 디자인 pin의 토큰·간격을 유지했고, 390·1440 폭 넘침 및 12px 이상 기본 글꼴을 검사했다.

![390 회원 새 방 — 로컬 가상 계정](private-lifetime-evidence/390-member-permanent.png)

![1440 회원 상설방 — 로컬 가상 대화](private-lifetime-evidence/1440-permanent-conversation.png)

## 재현

서버: `test/selfhost-private-lifetime.test.ts`, `test/private-lifetime-contract.ts`, `test/selfhost-private-lifetime-postgres.test.ts`, `test/private-lifetime-vitest.config.ts`. 새 검사는 package의 기존 control/selfhost/PG 명령에 연결했다. 전체 성공 gate를 반복한 결과는 아니다.

브라우저: `test/private-lifetime-browser.ts`, `test/private-lifetime-qa-browser.ts`. 설치된 Playwright를 `TOKTOK_PLAYWRIGHT_MODULE`(기본 `@playwright/test`), 출력 폴더를 `TOKTOK_BROWSER_OUTPUT`로 지정하고 Node24+tsx로 `--test --test-concurrency=1` 실행한다. 환경별 절대 경로·자격증명을 저장하지 않는다. 모든 heavy 실행은 workspace shared runner를 거쳤다.

운영 반영/PR/CI 결과는 배포 후 아래에 별도로 남긴다. 로컬 fixture 승인·생성을 실제 사용자 동의나 운영 관리자 성공으로 확대하지 않는다.

## PR18 CI 영향 보정

[최초 CI](https://github.com/eiaserinnys/toktok/actions/runs/37125675220)는 application 22PASS/2FAIL에서 멈췄다. 두 실패는 일반 admin recovery 검사에서 생성 확인 없는 private POST도 일괄 예산429를 기대한 것이다. 새 생성은 실제 자격 확인 후 예산 범주를 결정하므로 이 요청은 403 OPERATOR_ACK_REQUIRED가 정본이다. 확인 없는 생성은 여전히 거절하고 recovery 사용량도 증가하지 않는다. source 변경 없이 해당 두 기대값만 고쳐 선택2PASS/1SKIP로 확인했다. synthetic recovery 성공 case는 재실행하지 않았다. 초기 CI 실패를 환경 문제나 성공으로 바꾸어 보고하지 않는다.
