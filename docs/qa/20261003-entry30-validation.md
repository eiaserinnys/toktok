# 공개방 30일 입장권 검증

새 사람 확인부터30일이라는 사용자 승인 범위를 구현했다. 기존 grant나 실제 사용자의 권한은 이 검사로 연장하지 않았다. 새 워크트리의 가상 계정/방/데이터만 사용했으며 실제 메일·발언·관리자 승격0이다. 운영 배포는 후속 결과로 별도 표시한다.

- Node24 SQLite 공통2PASS: 30일 경계, 유휴5분 seat0, 재시작 재입장, 안정된 sender/동일message 중복200, hash-only 원문 비노출, owner revoke, room 재개설 차단, capacity/scope 경계.
- Workers SQLite 같은 공통1PASS, 격리 PostgreSQL 같은 계약1PASS/fixture process exit0.
- 서버 catalog generation2PASS: 제목 변경 유지, disable/enable·remove/recreate 회전, cold Control 유지. strict budget 거절 시 authority row0, 기존 fragment grant 5분 유지, 같은 revision의 구 catalog generation만 보완.
- 101개 만료 정리100/1 및 본문 없는 authority startup index1PASS. capacity1의 빈자리 재입장/정확 owner revoke→pending wait403/waits0/participants0도1PASS.
- 실제 Workers application의 URL→Origin/cookie/nonce 명시승인→agent 회수/join/post/cancel과 cold recent history 영향2PASS/3skipped. 기존 request-stream uncaught1건은 미해결 기록이며 warning0으로 보고하지 않는다.
- 직접 SQL 계측1PASS/poll writes0. 성공 출력에서 수치가 나오지 않아 측정값 자체의 snapshot을 추가해 같은 meter만1PASS/1skipped로 보존했다. 다른 기존 성공을 반복하지 않았다.
- CF 및 Node 타입 검사 통과. 최초 CF 타입 검사에서 settings generation 값 좁힘1곳을 고쳤다. 새 WT의 pnpm auto-install은 symlink node_modules 제거 확인에서 assertions 전 중단했으며, dependency 자체는 변경하지 않고 Node로 설치된 compiler/runner를 직접 사용했다.

DTO/문구/UI·actual390/1440 및 최종 bundle/리뷰/배포는 후속 기록 대상이다. [구현·비용 경계](../development/public-entry-30-days.md)와 계측 snapshot `test/application-entry.test.ts`를 함께 읽는다.

독립 Sol 소스 검토는 새 notice/hash/room·request binding/재승인 무연장/owner revoke·agent cancel/권한세대/legacy 기한 경계에서 승인 우회·평문 저장을 발견하지 않았다. 예산 거절 시 사람 철회와 cleanup cancel의 차이, 다른 탭 preview로 nonce가 바뀌는 재확인 동작은 별도 UI 복구 설명으로 다룬다. 보안/예산 예외를 추가하지 않는다. 실제390 최초브라우저에서 승인·자리반납·재입장 뒤 철회응답의 participant_connected가 이전값이라 제목이 계속 참가상태로 보였다. 서버/화면 모두 approved 상태에서만 connected로 판단하도록 국소 보완했다. 첫 실패는 보존한다.

최종 actual CF cold actor 신규 검사의 첫 준비는 lease가 필요한 metadata GET을 인증 없이 호출해401로 실패했다(1failed/2skipped,115ms). 권한 오류를 완화하지 않고 공개 guide GET으로 준비 경로만 수정했다. 이후 결과는 별도로 기록한다.

CF cold 보정에서는 구 설정 보완201→승인200→자리반납204→실제evict 후 동일입장권 재입장201까지 확인했다. 옛 lease의 재시작 오류는 기존 계약409 LEASE_EPOCH_RESET인데 테스트가403을 기대해 멈췄다(1failed/2skipped,360ms). 기대값을 기존 상태·code 두 항목으로 정정하고 미도달 owner 철회까지 후속 검사한다. 제품 수정0.

최종 CF cold wrapper 검사는1PASS/2skipped(435ms)다. 실제 DO eviction 후 같은 권한으로201 재입장, sender 일치, 옛lease409 LEASE_EPOCH_RESET, 권한 만료 불변, 원 브라우저 철회200/connectedfalse, 재입장403을 확인했다. 공개 설정 cache의 같은 revision generation 보완도 실제 wrapper 저장까지 확인했다.

UI 실제 로컬390/1440 보완2PASS와 최초 실패 범위는 [UI 기록](20261003-public-entry30-ui-validation.md)을 따른다. 실제 PNG에서 기한/동의/하단 버튼과 여백을 확인했다. 최종 CF·Node24 타입 검사0, strict bundle0(118assets), generated 정합0, OpenAPI JSON801ref/미해결0, diffcheck0. 새Workers case를 기본 application gate에, Node/PG 공통계약을 selfhost scripts에 연결했다. 원격CI 및 배포는 다음 단계다.

최종 UI 독립 읽기 검수: controller/mount/screen/dialog/terms와 fixtures/registry/routes diff, 제공한 실제390/1440 캡처를 대조해 blocker0을 보고했다. 고지 미지원 차단·체크/중복방지·기존권한 구분·철회실패/오래된nonce 복구 동선을 확인한 범위이며 독립 실행 결과가 아니다.
