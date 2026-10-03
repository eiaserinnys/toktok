# 비공개방 계약 대조 — 2026-10-03

현재 비공개방의 계약을 소스·기존 증거와 대조하고, 빠진 실제 HTTP 경계를 로컬 Node 24 + SQLite에서 확인했다. 공개방의 새 30일 입장권 구현을 비공개방에 적용한 검증이 아니다. **비공개방에는 30일 입장권, 유휴 5분 자리 반납, 개별 참가자 revoke/leave API가 없다.** 이 차이를 이번 검증을 위해 변경하지 않았다.

소스 기준은 `b20e24e2deee3109c5ee1aa15b51e3e908e22e68`이다. 검증 중 private 제품 소스는 편집하지 않았다. [새 하니스](../../test/private-verification-http.test.ts)와 [초기·보정 결과/HTTP 상태/소스 해시](../../test/private-verification-results.json)를 함께 보존한다.

## 생성과 권한

정본은 [`control-policy.ts`](../../src/control-policy.ts), [`create-admission.ts`](../../src/create-admission.ts), [`control-create-http.ts`](../../src/control-create-http.ts)다.

| 주체 | 현재 생성 조건 | 장기 보관 |
|---|---|---|
| DEMO 익명 | `anonymousEnabled`가 켜져 있어야 하며, exact Origin + 브라우저 cookie/nonce의 명시 고지 확인으로 받은 단기 생성 grant 필요 | 불가. 새 v2 방은 최근 DB 버퍼 |
| DEMO 초대 가입 계정 | 검증된 DB 계정, `can_create_private`, 세션 CSRF와 고지 확인 또는 승인 agent + 소유자의 현재 고지 확인 필요 | `can_persist_private` + 서버 `persistenceAllowed`가 있어야 새 방에서 명시 opt-in 가능 |
| HOSTED 계정 | mode 자체가 권한을 주지 않는다. 검증된 DB 계정과 생성 entitlement·고지 확인 필요 | 계정 entitlement + 서버 허용 + 새 방 opt-in 필요 |
| HOSTED 익명 | mode와 별도로 `anonymousEnabled` 설정에 따른다. 이번 로컬 HOSTED profile은 기본 false로 확인 | 계정 없는 persist는 항상 불가 |

두 mode 모두 `defaultPersist=false`다. `persist` 생략은 장기 보관 OFF이며 새 v2의 최근 DB 버퍼를 뜻한다. 이번 HOSTED fixture는 signup open과 persistenceAllowed만 명시한 **로컬 설치 profile**이고 운영 설정 조회나 변경이 아니다. 실제 OTP·초대 소비를 다시 수행하지 않고 fictional verified account/session을 준비했으며 권한 판정·Origin·CSRF·생성 grant·생성 요청은 실제 HTTP/CONTROL을 사용했다.

DEMO 설치 seed의 익명 수명은 기본 30분·최대 1시간이다. 계정 수명은 기본 24시간·최대 7일인 seed이며 실제 방은 생성 당시 설정 snapshot과 절대 `expires_at`을 따른다. 이는 현재 운영 DB 값을 조회한 결과가 아니다. TTL 최소 60초, 주체별 최대 TTL, `retention_seconds <= ttl_seconds`를 서버가 검사한다. 기존 방의 보관 모드를 바꾸는 API는 없다.

## 참여·수명·보관

| 항목 | 현재 계약과 확인 |
|---|---|
| capability | invite/read/owner/participant 분리. 무cap 401, 다른 방·잘못된 cap 403. 참가자는 발신 가능하지만 close/delete 불가 |
| 참가 | invite로 snapshot 고지/version/visibility/retention_mode를 포함한 POST 필요. 잘못된 고지는 409 NOTICE_CHANGED |
| 참가자 수 | 방 snapshot의 정원, 기본/안전 상한 64명. 현재는 등록 참가자 수이며, 비활동으로 자동 반납되지 않음 |
| 5분 | 생성 grant의 유효기간과 공개방 유휴 정책을 private participant 수명과 혼동하지 않음. private participant는 방이 유효하면 5분이 지나도 사용 가능 |
| leave/revoke | `DELETE /lease`, `DELETE /participants`는 private에서 404. 개별 참가자 철회 API도 없음. 관전 UI 이탈은 wait/화면 자원 정리이며 참가자 credential 폐기가 아님 |
| 재시작 | 최근 v2·opt-in persist 본문/epoch/순서와 참가자 token 지문을 DB에서 복원. 이미 가진 participant token은 재사용 가능. 같은 join ID의 최초 평문 token을 잃으면 재시작 후 409 JOIN_RESULT_NOT_RECOVERABLE이며 복구하지 않음 |
| 생성 재시도 | 이미 완료된 동일 생성 요청은 새 방/secret 재발급 대신 409 CREATE_RESULT_NOT_RECOVERABLE + 같은 room_id |
| close | owner만 가능. 새 참가·발신은 막고 보관 범위의 history는 조회 가능. unread wait는 먼저 반환, 빈 closed wait는 410 |
| delete/expiry | 즉시 접근 410, 본문/dedupe는 bounded 정리. metadata를 전부 지운다고 약속하지 않음. 백업/PITR의 즉시 물리 삭제 보장 없음 |
| 새 v2 최근 버퍼 | 최대 500개·직렬화 합계 2MiB·1시간 및 방 TTL/더 작은 snapshot 상한. count·bytes·time 정리와 같은 transaction의 sequence/dedupe |
| 장기 persist | 명시 opt-in과 snapshot retention. 기본 OFF. 최근 버퍼와 별도이며 최대 persisted message 정책 및 방 TTL 적용 |
| 이전 v1 memory | 자동 DB 저장 전환 없음. 본문 RAM만, restart 후 epoch/history_reset. metadata/참가자 지문 영속과 본문 미보관은 구분 |
| 첫 조회·이전 조회 | 사람/agent 모두 보관 중 최근 최대 20개와 64KiB 응답 제한. **5분 시간 컷 없음.** `before`로 이전 bounded page, `after`/wait로 이후 delta. 잘못된 조합·미래 cursor는 거절 |

개별 참가자 revoke/leave나 자동 자리 회수가 필요하다면 별도 제품 정책·구현이 필요하다. 이번 결과는 그 기능이 있다는 의미가 아니다. 역할별 읽기와 owner close/delete의 실제 처리는 [`private-core.ts`](../../src/private-core.ts), 최신 페이지는 [`history-page.ts`](../../src/history-page.ts), 보관 분기는 [`private-state.ts`](../../src/private-state.ts)에 있다.

## 이번 새 HTTP 검증

공용 heavy runner, Node 24.21.0, `--test-concurrency=1`, case timeout 60초. 실제 TCP HTTP + createApplication + CONTROL + SQLite를 사용했다. 브라우저·메일·운영 호출은 없었다. 시간 경계는 주입된 clock을 이동한 것으로, 실제 5분 또는 10분 동안 유휴 대기한 실측이 아니다.

| case | 확인한 결과 |
|---|---|
| DEMO 익명 | anonymous persist 403, 최대 TTL 초과 400, create 201/동일 생성 409+동일 room_id, 무cap 401/잘못된·다른 방 cap403, join/send201. DI +301초 뒤 5분보다 오래된 본문 첫 조회200, 같은 participant 발신201. 미지원 leave404. 짧은 방 TTL410. 실제 서버 종료·DB 재개방 후 body2/같은 epoch, 메시지 replay200/같은 cursor, join secret 복구409. participant close403, owner close200, history2 유지/빈 wait410, delete204/최근 본문·dedupe0/접근410 |
| DEMO 초대 계정 | CSRF 없는 context403, 새 방 persist 생략은 recent_buffer. retention > TTL422, 명시 persist 새 방201, 잘못된 join 고지409. opt-in 본문이 실제 서버 재시작 뒤 보존. DI +600001ms 뒤 retention gap/본문0, private body·dedupe0, owner delete204 |
| HOSTED | 설정상 anonymous 비허용403. DB 생성 entitlement 없거나 미인증 계정 context403. 정상 계정의 명시 persist 방201. 기본 정원 64명 참가201, 65번째429 + Retry-After. DI +301초 뒤에도 자동 자리 회수 없이 추가 참가429. owner delete204 |

최초 실행은 **1 passed / 2 failed / exit 1**이었다. HOSTED는 통과했고 DEMO 둘은 서버를 같은 포트로 재기동한 직후 undici의 오래된 pooled socket을 재사용하여 `UND_ERR_SOCKET`으로 중단했다. 해당 HTTP 제품 응답은 도착하지 않았다. fixture 요청만 `Connection: close`로 고쳐 실패한 DEMO 두 case만 실행했으며 **2 passed / 0 failed / exit 0**이었다. HOSTED와 이전 대형 게이트는 반복하지 않았다. 초기 실패를 보정 결과로 덮지 않았다.

원시 로그는 `.local/artifacts/toktok/20261003-private-conformance/initial.log`, `correction.log`에 보존했고, 저장소의 [결과 JSON](../../test/private-verification-results.json)에 원문 해시와 비밀 없는 모든 HTTP 단계·상태·최종 관측을 담았다. 새 fixture는 source default/운영 quota를 편집하지 않았다. 테스트 종료 때 서버·SQLite·임시 경로를 모두 정리했다.

## 기존 증거 재사용 — 이번 재실행 아님

| 경계 | 원본/기존 판정 |
|---|---|
| read capability로 참가 불가 | [기존 application case 40행](../../test/application-runtime.test.ts#L40), [correction 원문](../../test/application-runtime-correction.json): read join403인 private case PASS. 당시 전체 결과는 **4 PASS/2 FAIL**이며 두 실패의 후속 selected 결과와 구분; 전체 PASS로 재표기하지 않음 |
| 실제 Workers private HTTP 권한·12개 동시 sequence·sender2·duplicate/reply/input·close/delete/expiry | [remaining 최초 원문](../../test/application-remaining-initial.json), [case 소스](../../test/application-remaining.test.ts): 당시 6 PASS. 이후 body-inflight429 허용 대기/동일 ID 재시도는 [최근 버퍼 기록](20261003-recent-buffer-validation.md)의 concurrent correction 1 PASS/5 SKIP로 구분 |
| 최근 버퍼 count500/2MiB/time/rollback/dedupe/restart | [공통 계약](../../test/recent-buffer-contract.ts), [최근 버퍼 검증](20261003-recent-buffer-validation.md), [결과](evidence/20261003-recent-buffer/results.json): Node SQLite·격리 PG·Workers SQLite 공통 계약 PASS |
| 새 private v2·longterm restart와 old v1 body SQL0 | [Node private/recent case](../../test/selfhost-recent-buffer.test.ts), [CF private case](../../test/selfhost-private-cloudflare.test.ts), [기존 결과](20261003-recent-buffer-validation.md): CF 옛 RAM 기대 2건을 수정한 selected2 PASS/8 SKIP; Node SQLite/PG 선택5 PASS. 이전 v1은 body SQL0/history_reset, v2·persist는 body/epoch 유지 |
| unread→empty closed wait410, pending close wake, 삭제100/100/1→0 | [lifecycle case](../../test/selfhost-private-lifecycle.test.ts), [portable 기록](../portable-validation.md): 신규 selected1 PASS. 지금 새 실제 HTTP close/delete와 구분 |
| 실제 timeout/wakeup/abort/shutdown, byte page, handler/body-inflight, capability당 단일 wait | [private core case](../../test/selfhost-private.test.ts), [Node socket case](../../test/selfhost-private-node.test.ts), [portable 기록](../portable-validation.md): 기존 targeted PASS. 이번에는 장시간 wait gate를 반복하지 않음 |
| 첫 조회 시간 컷 제거·latest/before/delta, recent/persist/legacy 세 모드 | [history case](../../test/selfhost-history.test.ts), [history 검증](20261003-history-validation.md): private 세 모드 selected1 PASS; Workers/격리 PG 공통 history PASS |
| 관전 390/1440·이전 페이지 anchor·가변 높이·본문 선택·bounded DOM/cache·이탈/일시정지 expiry | [history 검증과 PNG](20261003-history-validation.md), [기존 private 브라우저 원문](20261003-actual-private-browser.json): 최초 실패·보완·미도달 tail을 분리하여 PASS 기록. 이번 새 HTTP 결과를 새 브라우저 검증으로 주장하지 않음 |
| 실제 CONTROL account entitlement·고지·생성 예약·default OFF·mode drain | [CONTROL case](../../test/control-port.test.ts), [최근 버퍼 결과](evidence/20261003-recent-buffer/results.json): 8 PASS 기록. 새 로컬 HOSTED/DEMO HTTP는 이 계약의 별도 통합 관측 |

## 한계와 미포함

- 이번 새 실행은 로컬 Node/SQLite다. Workers·Postgres·브라우저 결과는 위 기존 근거를 재사용했으며 이번 다시 실행한 것으로 합산하지 않는다.
- 실제 운영 비공개방 생성·읽기·게시, 실제 계정 권한 변경, 사람 동의, 외부 메일, 배포는 수행하지 않았다. 계정은 로컬 fictional fixture이므로 실제 OTP 전달/가입 성공 검증이 아니다.
- 기존 CF request-stream/upstream cancellation 미해결 진단을 해결하거나 warning0으로 바꾸지 않는다. 보관 상한은 애플리케이션 DB 논리 범위이며 provider backup/PITR 소거 검증이 아니다.
- root가 새 테스트를 selfhost 실행/타입 검사 inventory에 연결했다. 첫 selfhost 타입 검사에서 `randomUUID()` 기본값이 UUID template literal로 좁게 추론되어 문자열 ID를 쓰는 3곳에 TS2345가 났다. root가 `joinInput`/`participate`의 매개변수 두 곳만 `id: string = randomUUID()`로 명시한 뒤 **최종 selfhost tsc exit 0**을 확인했다. 실행 후 타입 주석만 바뀌었고 런타임은 재실행하지 않았다. 결과 JSON은 실행 당시와 최종 테스트 해시를 모두 보존한다. CI·저장소 반영은 root 후속이며 제품 변경이 없어 운영 재배포는 하지 않는다.
- 대조 중 남아 있던 private-runtime 문서의 옛 최초 5분 표현은 root가 현재 bounded20/bytes + before 계약으로 정정했다. 제품 정책은 변경하지 않았다.
