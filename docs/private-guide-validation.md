# 비공개 링크 Markdown 후속 검증

root의 링크 하나로 HTTP 대화를 시작하는 계약을 private guide에 반영했습니다. 기존 기반 구현과 413 upstream 취소 미검증 기록은 변경하지 않습니다.

## 변경 범위

- 검증된 entry capability의 invite/read 역할만 안내 renderer에 전달합니다. query role은 사용하지 않습니다.
- invite 안내는 실제 방의 참가·발신·조회 경로와 JSON, 참가 후 받은 participant_token 사용법을 제공합니다. read 안내는 GET messages/wait만 제공합니다.
- 예시 비밀값은 placeholder이며 실제 cap, owner, participant token과 지문을 출력하지 않습니다. purpose는 기존 비신뢰 데이터 블록에만 둡니다.
- 초기 after 생략, snapshot 초기 창과 페이지, 실제 전달 cursor, has_more, gap/reset, 재시도 및 closed wait410을 안내합니다. 예산·저장·권한 경로는 변경하지 않습니다.

## 신규 증거

RED는 수정 전 안내의 Authorization 설명 누락을 source assertion으로 확인했습니다(exit1). SQLite runtime gate 실패나 재실행으로 집계하지 않습니다.

Node24.21.0에서 신규 test/selfhost-private-guide.test.ts 하나만 실행했습니다. heavy runner/전용 TMPDIR/worker1/테스트60초/runner120초입니다. 첫 실행은 1 PASS, 0 FAIL, exit0(case115.91093ms, 전체561.05272ms)였으나 읽기 전용 검수가 참가 예시의 고정 요청 ID 문제를 발견했습니다. 신규 참가별 고유 ID placeholder/생성 지침과 같은 요청 재시도·다른 참가자의 분리 검증을 추가하여 이전 증거가 무효화된 이 게이트만 허용된 보정 1회를 실행했습니다.

최종 보정 결과는 1 PASS, 0 FAIL, exit0(case129.11671ms, 전체557.114656ms)입니다. 서로 다른 참가자는 다른 token과 슬롯, 같은 논리 참가의 재시도는 같은 token을 반환합니다. 그 뒤 검증을 반복하지 않았습니다.

```sh
python3 "$AGENT_COMMON_FILES_DIR/skills/heavy-work-verify/scripts/heavy_verify.py" --timeout 120 -- env TMPDIR="$TOKTOK_GUIDE_TMPDIR" "$TOKTOK_NODE24_BIN" --import ./selfhost/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 --test-timeout=60000 test/selfhost-private-guide.test.ts
```

TOKTOK_NODE24_BIN은 워크스페이스 .local/tmp/toktok-portable-249424e1/node-v24.21.0-linux-x64/bin/node의 절대 경로, TOKTOK_GUIDE_TMPDIR은 .local/tmp/toktok-portable-249424e1/private-guide의 절대 경로입니다. 호스트 Node22를 대체하지 않고 기존 격리 Node24를 사용했습니다. 실행 작업 디렉토리는 기존 B managed worktree입니다.

| 관측 | 결과 |
| :-- | :-- |
| SQLite memory/persist 모드 | 2방/안내6응답200 |
| role query 위조 | invite/read 실제 권한 유지 |
| 안내 GET metadata/참가자 | 변경0 |
| 안내 GET 본문 행 | 0 |
| 실제 capability·owner·participant token·지문 노출 | 0 |
| 고정 safety와 hostile purpose 분리 | 유지 |
| 안내 JSON 참가·발신 | 실제 core HTTP201 |
| 신규 참가/동일 참가 재시도 | 서로 다른 2슬롯·token / 200 동일token |
| read credential 발신 | 403 |
| guide GET 후 handler | 0 |

원시 관측은 비밀·본문 없이 아래 숫자/판정만 출력했습니다.

```json
{"phase":"private-link-guide","guides":6,"modes":2,"query_role_ignored":true,"guide_get_participants_added":0,"guide_get_body_rows":0,"secret_exposure":false,"example_join_send_status":201,"distinct_joins_per_room":2,"retry_join_status":200}
```

## 검수와 한계

단계3 읽기 전용 검수에서 고정 참가 ID를 수정필수로 판정했고 해당 보완 delta 재검수는 PASS입니다. reviewer는 파일만 읽고 gate를 실행하지 않았습니다. 테스트는 Fetch Request/Response를 실제 SQLite core에 전달하고 안내 JSON을 실행합니다. 실제 curl 프로세스·Node 네트워크 bridge·Cloudflare 배포를 실행한 증거는 아닙니다. budget은 기존 TEST_BUDGET fixture이며 실제 CONTROL 집행 증거가 아닙니다.

기존 통과 private/public/runtime/typecheck/load gate, 부하, 브라우저, 413 실패 진단은 재실행하지 않았습니다. 실제 메일·계정·사용자 DB·운영 변경과 README 변경은 없습니다. root가 통합 타입 검사와 운영 연결을 담당합니다.
