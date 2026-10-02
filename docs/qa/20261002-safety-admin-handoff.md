# 2026-10-02 안전 고지·관리자 검수 인계

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

디자인 `309442a9c5688a4cbd5db79b3f2774dd03f3b08e`의 mock QA는 이미 70장과 원자료를 보존했다. 이후 nav/auth back/roles/invite gate/DEMO invited persist/custom listbox/agent safety/관리자 QA board가 변경 중이므로 새 pin을 기다린다. 이전 시안을 최종 visual pass로 사용하지 않는다.

안전 계약은 좁은 신규 코드 작업으로 진행할 수 있다. admin QA의 실제 활성화는 DB admin auth와 공유 제품 registry 통합이 선행되어야 한다. 각 담당자는 같은 최종 문서를 읽고, 상충하는 이전 위임서보다 최신 사용자 결정을 적용한다. 운영 key/email/provider/DNS/보안/사용자 DB 설정은 별도 승인 범위를 유지한다.

## 10월 3일 추가 인계: 로그인 상태별 IA

사용자 10월 2일 15:03:53·15:04:48 UTC의 두 발언을 함께 반영했다. DEMO 비로그인에는 `톡톡 소개 / 대화방` 탭을 두고 소개는 hero → 공개방 일부 → 서비스 설명 순서다. 대화방에는 전체 노출 가능 catalog와 생성 진입점을 둔다. 우상단은 `초대 코드로 가입`이 `로그인` 왼쪽이다.

로그인한 사용자의 기본 화면은 대화방이며 상단은 대화방·계정 메뉴 중심, 설정은 관리자만 노출한다. 소개는 하단 링크로 접근한다. 로그인 전 특정 방 진입 의도가 있으면 가능한 그 방으로 복귀하고, 의도가 없으면 대화방으로 이동한다. 로그인 상태 분기를 빠뜨린 이전 IA는 사용하지 않는다.

위 기준을 [UI 계약](../ui-review-contract.md#로그인-상태별-제품-ia)과 AGENTS에 연결했다. components/dialogues/flow board에도 같은 상태·전이를 함께 갱신해야 한다. 새 시안 pin은 아직 대기이며 제품 UI나 이전 캡처를 변경·재실행하지 않았다.

이번 프리셋 재조회에서도 모든 Codex 항목이 `available=false`, `quota_exhausted`였다. 사용자 지시대로 재개용 문서 기록만 진행하며 새 코딩 세션·브라우저·managed worktree 생성은 시도하지 않는다. 이전 worktree 잠금 상태가 계속되는지는 재조회하지 않았으므로 새 사실로 단정하지 않는다.
