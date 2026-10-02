# 2026-10-02 안전 고지·관리자 검수 인계

현재 재개용 디자인 pin: **`179b96f575a6d30ab5d85ea277452cebf1b4b257`**, branch `design/toktok-ui`, path `design/prototype/`. 아래 최종 디자인 인계를 먼저 읽는다. 기존 `309442a`는 과거 증거로만 보존한다.

## 저장한 결정

- [AGENTS.md](../../AGENTS.md): UI 변경 시 components/dialogues/screen flow board 동기화와 기존 Common room 일관성을 완료 조건으로 기록.
- [PR 체크리스트](../../.github/pull_request_template.md): 동일 renderer·registry·권한/부작용·실제 검증 증거 항목.
- [안전 계약](../agent-safety-contract.md): 고정 경고 문구, 비신뢰 데이터 escaping, 호환 가능한 service metadata, targeted 검증.
- [관리자 검수 계약](../ui-review-contract.md): 동시 화면 preview와 조건부 화살표의 보드, 관리자 route 인가, fixture 격리, registry 기반 CI 구현 계획.

현재는 문서와 체크리스트만 저장했다. 제품 source, runtime, admin UI, shared registry, coverage script/CI는 변경하지 않았다. 새 요구를 이미 구현하거나 통과했다고 보고하지 않는다. 이 브랜치의 문서 commit을 후속 통합 worktree에 반영해야 main 개발 지침에도 적용된다.

## 관측된 실행 제약

이번 조회에서 `codex-6-luna`, `codex-6.1-sol`을 포함한 모든 Codex 세션 프리셋은 `available=false`, `reason=quota_exhausted`였다. 새 코딩 세션은 생성하지 않았다. 기존 10월 3일 04시 KST 재개 일정은 그대로 두며, 그 시각의 실제 가용성을 다시 확인해야 한다. 재개 예약을 quota 복구 보장으로 해석하지 않는다.

새 managed worktree `docs/agent-safety-admin-qa` 생성은 `REPOSITORY_LOCK_TIMEOUT`으로 끝났다. `git worktree list`에 해당 작업트리는 없다. 락을 삭제하거나 직접 worktree를 생성해 우회하지 않았다. 기존 root 소유 `design/qa-artifacts` managed worktree에서 문서만 보존한다. 기존 source 작업트리와 운영 설정은 손대지 않는다.

## 재개 입력

안전 계약의 구현 기준은 public UI `df79fff592d6aa420e01c9a5a7806838741d8ef7`이다. public engine/cost 문서는 `88917104efeca262e18606eff4866c84b5a40c81`, auth/control 계약은 `588abaaf4b5e61c0129c6592eb09e89028b50071`을 참조한다. 기존 branch source를 덮어쓰지 말고 의존성을 확인한 새 managed worktree에서 진행한다.

디자인 `309442a9c5688a4cbd5db79b3f2774dd03f3b08e`의 mock QA는 이미 70장과 원자료를 보존했다. 이후 nav/auth back/roles/invite gate/DEMO invited persist/custom listbox/agent safety/관리자 QA board가 변경되었으며, 현재 재개 대상은 `179b96f575a6d30ab5d85ea277452cebf1b4b257`이다. 이전 시안을 최종 visual pass로 사용하지 않는다.

안전 계약은 좁은 신규 코드 작업으로 진행할 수 있다. admin QA의 실제 활성화는 DB admin auth와 공유 제품 registry 통합이 선행되어야 한다. 각 담당자는 같은 최종 문서를 읽고, 상충하는 이전 위임서보다 최신 사용자 결정을 적용한다. 운영 key/email/provider/DNS/보안/사용자 DB 설정은 별도 승인 범위를 유지한다.

## 10월 3일 추가 인계: 로그인 상태별 IA

사용자 10월 2일 15:03:53·15:04:48 UTC의 두 발언을 함께 반영했다. DEMO 비로그인에는 `톡톡 소개 / 대화방` 탭을 두고 소개는 hero → 공개방 일부 → 서비스 설명 순서다. 대화방에는 전체 노출 가능 catalog와 생성 진입점을 둔다. 우상단은 `초대 코드로 가입`이 `로그인` 왼쪽이다.

로그인한 사용자의 기본 화면은 대화방이며 상단은 대화방·계정 메뉴 중심, 설정은 관리자만 노출한다. 소개는 하단 링크로 접근한다. 로그인 전 특정 방 진입 의도가 있으면 가능한 그 방으로 복귀하고, 의도가 없으면 대화방으로 이동한다. 로그인 상태 분기를 빠뜨린 이전 IA는 사용하지 않는다.

위 기준을 [UI 계약](../ui-review-contract.md#로그인-상태별-제품-ia)과 AGENTS에 연결했다. components/dialogues/flow board에도 같은 상태·전이를 함께 갱신해야 한다. 이 IA를 기록한 시점에는 새 pin을 기다렸고, 이후 아래 최종 디자인 pin을 전달받았다. 제품 UI나 이전 캡처를 변경·재실행하지 않았다.

이번 프리셋 재조회에서도 모든 Codex 항목이 `available=false`, `quota_exhausted`였다. 사용자 지시대로 재개용 문서 기록만 진행하며 새 코딩 세션·브라우저·managed worktree 생성은 시도하지 않는다. 이전 worktree 잠금 상태가 계속되는지는 재조회하지 않았으므로 새 사실로 단정하지 않는다.

## 04시 재개 후 배포·최종 검수까지 진행

사용자 2026-10-02 15:33:15 UTC: “4시 이후에 재개하면 배포까지 쭉 진행을 시켜줘”. 이어 15:33:47 UTC: “시안 다듬고 플로우에 논리적 헛점이 없는지 한 번 더 살펴둬”. 이는 10월 3일 KST 재개 이후 기존 목표를 배포와 실제 최종 검수까지 계속 수행하라는 지시다. 시안·문서·PR 보존만으로 전체 작업을 끝내지 않는다.

전달 세션은 기존 10월 3일 04시 KST 자동화를 이 순서로 갱신했다고 보고했다. 이 세션은 자동화를 중복 생성하거나 변경하지 않았다. 이번 재조회에서도 모든 Codex 프리셋은 `quota_exhausted`였으므로 새 실행 대신 이 지시를 보존한다. 재개 시 실제 가용성을 확인하며 시간 도달만으로 quota 복구를 가정하지 않는다.

### 재개 실행 순서와 완료 기준

1. quota 가용성과 각 작업트리·원격 SHA·미완료 검증을 확인하고 보존된 변경에서 이어간다. 불필요하게 새로 구현하거나 통과 gate를 반복하지 않는다.
2. 최종 디자인 `179b96f575a6d30ab5d85ea277452cebf1b4b257`의 INTEGRATION/UI_RULES/tests를 읽고 고정한다. 로그인 상태별 IA와 shared component/dialog/route registry, 실제 화면 흐름 보드의 논리 및 390/1440 시각 검수를 수행한다. 이전 `309442a`를 최신 시안 합격으로 취급하지 않는다.
3. 남은 DEMO/HOSTED, 관리자 DB 설정·인가, 초대/OTP, entitlement·저장·retention, 공유 QA 체계, agent safety 및 self-host 공통 계약을 구현·테스트한다. self-host는 한 번에 SQLite 또는 PostgreSQL 하나를 선택하고 Cloudflare DO SQLite는 유지한다. 미확정 D1 전환이나 운영 retention을 임의로 정하지 않는다.
4. 변경한 코드·설계·검수면·CI를 일치시켜 검수하고 리포에 통합한다. 검수면 누락이나 필요한 서버 gate 미구현을 완료로 보고하지 않는다.
5. 기존 승인 범위에서 Cloudflare `toktok.eiaserinnys.me`에 배포하고 실제 endpoint를 검증한다. curl/Node와 임의 정상 UA로 허용된 create/join/read/post가 challenge 없이 동작하는지 확인하며, UA 위장이나 challenge 우회는 하지 않는다.
6. 실제 배포된 화면에서 로그인/권한·공개/비공개 입장·cursor/pause/오류·만료와 해당 관리자 검수면을 확인한다. 운영 변경/테스트가 별도 승인을 요구하는 항목이면 정확히 분리하고 실제로 확인한 범위를 명시한다. 로컬 fixture나 dry-run을 운영 성공으로 대신하지 않는다.

### 승인 경계와 독립 작업

기존 서비스 배포 승인은 유지하며 다시 묻지 않는다. 별도 승인 대상으로 남긴 메일 제공자·발신 도메인/DNS·binding·preview 설정, 보안 override, admin credential·지속 접근, 실제 사용자 DB 연결은 그 승인으로 확장하지 않는다. 필요한 대상·작업·영향을 구체화해 보고한 뒤 해당 변경만 기다린다. 다른 구현·로컬 fixture·문서·검증 등 독립 작업은 계속한다.

필수 운영 설정 때문에 어떤 기능을 배포·검증할 수 없다면 정확한 blocker와 남은 기능을 보고한다. 임의 설정, 인증 약화 또는 미구현 기능 제거로 전체 배포 완료를 선언하지 않는다. 사용자 계정 전체 청구를 포함하지 않는 toktok 예산 목표와 앱 cap이 청구 hard stop을 보장하지 않는다는 구분도 유지한다.

auth/nav/entry/storage/disclaimer/error/expiry/revocation/back flow의 구체 대조 항목은 [UI 검수 계약](../ui-review-contract.md#배포-전-흐름-논리-재검수)에 있다. 다음 작업자는 이 순서와 최신 로그인 상태 분기를 함께 적용한다.

## 최종 디자인 인계: 179b96f5

- 원격 소스: https://github.com/eiaserinnys/toktok/tree/179b96f575a6d30ab5d85ea277452cebf1b4b257/design/prototype
- 전달자가 확인했다고 보고한 범위: `design/prototype/` 18개 파일과 최신 비공개 Site source `ced32bf`의 Git blob SHA 일치, 사용자 공개 소스 승인으로 GitHub 차단 해결, source 50 route + 25 auth/room + 14 admin flow + 7 select 회귀 재실행 통과.
- 포함됐다고 전달받은 기능: 최신 로그인 분기 IA, DEMO 초대 필수 가입과 회원 private persist, 공유 admin components/dialogues 및 실제 screen flow canvas, custom select, agent warning, owner acknowledgement, 최종 카피 “어떤 이야기를 나누는지 지켜보세요”, negative path 보완.
- 전달된 실제 화면 증거 범위는 1200×750 홈 한 화면 확인뿐이다. 위 파일 대조와 테스트를 root가 이번 턴에 독립 재실행한 것은 아니며, exact pin CI는 아직 결과 전달 대기다. 소스 테스트/홈 캡처를 최종 시각·제품 통합 합격으로 확대하지 않는다.

재개 시 390×844와 1440×1000에서 로그인 전후 소개/대화방·가입/로그인 순서·원래 방 복귀, 초대 상태·OTP·저장 선택·위험 확인, 관리자 변경/취소/dirty-back/review/save/conflict/restricted를 확인한다. custom select의 열린 상태·키보드·모바일 clamp, dialog의 Tab/ShiftTab·Escape·초점 복귀·scroll lock, 실제 화면 보드의 동시 preview·조건 edge·role/mode filter·상세 보기·pan/zoom을 검수한다. auth/nav/entry/storage/disclaimer/error/expiry/revocation/back flow의 논리 대조도 함께 수행한다.

긴 admin/보드 전체 배치는 fullPage, modal/error/opened select는 viewport로 추가 캡처한다. 제품 scrolling 판정은 viewport 및 실제 좌표로 하고 fullPage 캡처 영향을 제품 결함으로 오인하지 않는다. 새 증거에는 exact source SHA·viewport·실행 범위를 기록하고 구버전 자료와 분리한다. mock 화면만 기존 승인된 `design/qa-artifacts` 경로로 공유하며 실제 secret·계정·운영 화면을 업로드하지 않는다.

이번 확인에서도 `codex-6.1-sol`과 `codex-6-luna`는 `quota_exhausted`였다. 사용자 지시대로 최종 pin과 남은 검수 범위만 기록했다. 새 세션·source fetch·테스트·브라우저·CI 재실행·제품 통합·배포는 수행하지 않았다. 04시 재개 이후 실제 가용성과 전달된 CI 결과를 확인한 뒤 이 pin으로 QA → 통합/구현 → 테스트 → 승인된 배포와 최종 검수를 이어간다.
