# 관리자 디자인 검수와 코드 일원화 계약

## 2026-10-03 안내 위계 후속

14:36 UTC 사용자 승인한 [인계 원본](../design/notice-hierarchy/HANDOFF.md)을 안내 배치의 최신 기준으로 적용한다. 소개/이름/대화/선택을 먼저 두고 보관·처리·운영 설명은 관련 선택 아래 또는 footer의 12px native details로 둔다. 공개 범위, 실행 위험, 명시 동의, 키 분실과 취소·초안 손실은 14px 이상으로 행동 전에 유지한다. 서버 정책과 고지 버전은 변경하지 않는다. [제품 적용 및 실제 검증](qa/20261003-notice-hierarchy-validation.md)에 기존 증거가 대체되는 범위와 실패 원자료를 구분한다. 아래 역사적 pin은 구조/IA 근거이며 안내 배치는 이번 후속이 우선한다.

상태: 2026-10-02 14:38:20·14:42:11·14:43:19 UTC 사용자 확정 요구를 반영한 구현 계약. 공유 registry, 보호된 관리자 검수 route와 coverage 검사를 단계적으로 통합한다. 구현별 증거와 남은 범위는 [공유 UI 통합 기록](shared-ui-integration.md)을 따른다. 기존 PR #4의 통과를 새 기능 전체 통과로 사용하지 않는다.

최초 재개 시안 검수 기준은 [`design/toktok-ui@63c4eec3bc10b84c0a66d00ee9817f12643ba864`](https://github.com/eiaserinnys/toktok/tree/63c4eec3bc10b84c0a66d00ee9817f12643ba864/design/prototype)의 `design/prototype/`이다. `179b96f`와 중간 `305161`은 이 pin으로 대체한다. 재개 시 해당 pin의 `INTEGRATION.md`, `UI_RULES.md`, tests를 읽고 아래 계약과 대조한다. 이 pin의 390×844·1440×1000 실제 invite/canvas/dialog 및 keyboard/focus/pan/zoom·negative flow 검수는 아직 미완료이며, 이전 `309442a` 증거로 대신하지 않는다. 전달받은 상태는 exact pin CI 없음이며 CI 통과를 주장하지 않는다. 시안에 검수 UI가 있다는 사실은 제품의 서버 관리자 인가나 registry 통합이 완료됐다는 뜻이 아니다.


후속 정본: `736605b7`의 다섯 결함 보완, `3e804519`의 opaque 초대 코드, `d6f0e975`의 실제 관리자 schema patterns를 순차 반영한다. 각각의 좁은 실제 시안 검수와 제품 mock/shared renderer 검수는 통합 기록에서 구분한다. prototype 검수는 실제 backend 관리자 권한·mutation 격리 검증을 대신하지 않는다.

## 로그인 상태별 제품 IA

2026-10-02 15:03:53·15:04:48 UTC(10월 3일 00:03:53·00:04:48 KST)의 두 사용자 발언을 함께 적용한다. 이전의 “우리의 방/공개 거실” 구분과 로그인 상태 분기 없는 canonical home 해석은 이 계약으로 대체한다. 정확한 URL은 새 시안 pin과 기존 제품 route를 대조해 확정하며, 아래 화면 역할을 서로 섞지 않는다.

| 상태 | 기본 화면·상단 | 화면 구성·추가 진입점 |
| --- | --- | --- |
| DEMO 비로그인 | `톡톡 소개 / 대화방` 탭. 우상단은 `초대 코드로 가입`, `로그인` 순서 | 소개: hero → 서비스 설명/how to use → 공개방. 대화방: 노출 가능한 전체 catalog와 방 생성 진입점 |
| 로그인한 일반/초대 계정 | 대화방을 기본 화면으로 하고 상단은 대화방 + 계정 메뉴 중심 | 소개는 하단 링크로 접근. 관리자 설정 메뉴 없음 |
| 로그인한 관리자 | 대화방 기본 화면 + 계정 메뉴 | 설정·디자인 검수 진입은 관리자에게만 제공. 소개는 하단 링크 |

“전체 catalog”는 현재 사용자에게 노출 가능한 목록을 뜻하며 비공개 방 목록 공개나 방 생성 권한 확대를 뜻하지 않는다. DEMO의 익명 생성 제한, 초대 코드 선검증과 OTP, 계정 entitlement에 따른 저장 정책은 기존 계약대로 서버가 판정한다. 이번 요청으로 HOSTED 비로그인 가입 정책을 DEMO와 같게 바꾸지는 않는다.

소개 화면의 섹션 순서는 `63c4eec3` 인계의 최신 사용자 결정으로 갱신했다. 이전 hero → 공개방 → 설명 순서를 적용하지 않는다. 초대장은 제목·초대한 사람·TTL을 위쪽에 크게 표시하고, warning은 아래에서 상대적으로 작되 읽기 쉽게 표시한다. 시각적 우선순위를 낮추더라도 위험 안내와 필요한 확인 동작을 생략하지 않는다.

로그인 성공 후 이동 우선순위는 유효한 원래 방 진입 의도, 그 의도가 없으면 대화방 기본 화면이다. 인증 흐름을 시작할 때 특정 방을 보려던 의도를 가능한 유지하고, 권한·만료 상태는 돌아간 방에서 정상 검증한다. return 경로는 검증된 서비스 내부 목적지만 허용하며 로그인 자체가 방 접근 권한을 부여하지 않는다. 로그인한 사용자가 하단의 소개 링크를 명시적으로 선택한 경우 소개를 읽을 수 있어야 한다. 기본 화면 변경을 모든 소개 접근 차단으로 구현하지 않는다.

components에는 비로그인/로그인/관리자 header와 계정 메뉴를 같은 컴포넌트의 상태로 등록한다. dialogues에는 로그인·초대 가입 관련 상태를, flow board에는 소개↔대화방, 소개→공개방, 초대 코드→OTP→가입, 로그인→원래 방/기본 대화방, 로그인 후 하단 소개 링크와 error/back 연결을 함께 반영한다. 390px·1440px에서 우상단 가입/로그인 순서, 로그인 후 기본 화면, 비관리자 설정 비노출, 원래 방 복귀·back/forward를 확인한다. 새 pin 이전의 이 경로 캡처는 최종 IA 합격 증거가 아니다.

## 화면 구성

관리자 메뉴의 **디자인 검수** 아래 다음 경로를 사용한다. 구현 중 기존 route 충돌이 발견되면 root가 경로만 조정한다.

| 경로 | 내용 |
| --- | --- |
| `/admin/design/components` | 실제 제품 컴포넌트와 default/focus/hover/error/loading/disabled/opened-select 상태 |
| `/admin/design/dialogues` | 실제 dialog registry에 있는 모든 다이얼로그의 관련 상태 |
| `/admin/design/flows` | 여러 실제 화면 preview를 동시에 보여주는 screen flow board |
| 검수면 내부 catalog | 같은 registry에서 생성하며 보호된 검수 문서에서 사용 |
| 검수면 내부 graph JSON/다운로드 | 같은 registry에서 동기 생성한 machine-readable route/transition graph |

흐름도는 순차 clickthrough가 주 기능인 화면이 아니다. 하나의 canvas에 실제 shared screen renderer를 fixture 데이터로 렌더한 preview 여러 개를 놓고, success/error/back 조건이 붙은 방향 화살표로 연결한다. 단순 사각형에 route 이름만 쓰거나 별도 mock HTML을 복제하는 방식은 불가하다.

zoom/pan, 화면에 맞추기, role/mode filter, edge label, thumbnail 상세 보기를 제공한다. 화살표와 node를 키보드로 선택하고 같은 연결 정보를 텍스트 목록으로도 확인할 수 있어야 한다. preview의 내부 스크롤·focus가 보드 pan/zoom과 혼동되지 않게 상세 보기에서 조작한다. 보드 검수에 필요한 미리보기는 동시에 보이며, off-screen renderer 가상화 여부는 미리보기와 graph의 일치 검증을 유지하는 범위에서 정한다.

graph의 node는 `screenId`, `routeId`, `fixtureId`, `mode`, `role`, 상태를 참조하고 edge는 `transitionId`, source/target node, event와 success/error/back kind, 실제 route contract의 조건을 참조한다. 임의 JavaScript 문자열 조건을 eval하지 않는다. Canvas와 machine graph는 같은 registry에서 생성한다.

`63c4eec3`의 추가 요구에 따라 각 action 단계를 공유 registry에서 파생한 tree/DAG로 펼친다. edge label 사이에 충분한 간격을 두고, 뒤로 돌아가는 참조는 주 진행 경로와 분리해 읽을 수 있게 표시한다. back edge를 graph에서 없애거나 canvas만 별도 수동 그래프로 관리하지 않는다.

클라이언트 viewport 크게 보기는 실제 shared renderer의 상세 보기이며 닫기 버튼과 Escape를 지원한다. 닫힌 뒤 기존 보드의 pan/zoom과 열기 전 focus가 복원되는지 실측한다. 열린 dialog 검수는 이전/다음 버튼 및 좌우 이동과 현재 이름·index 표시를 제공하며, 이름과 index가 실제 표시한 dialog registry 항목과 일치해야 한다. 기존 dialog·select의 키보드 동작과 초점 복귀를 함께 검수한다.

## 실제 코드 재사용

의존 방향은 제품 router → shared screen/component/dialog registry, 관리자 QA controller → 같은 shared registry + fixture adapter다. 공개 제품 router는 관리자 QA controller나 fixture bundle을 import하지 않는다. 공통 renderer가 admin 권한 자체를 부여하거나 fixtureRole을 실제 세션에 쓸 수 없어야 한다.

컴포넌트 registry는 renderer와 적용 가능한 상태 목록을 가진다. dialog registry는 제품에서 실제 여는 dialog와 상태·접근성 계약을 참조한다. route registry는 제품 router가 실제 사용하는 화면·전이·gate를 정의한다. 검수면을 채우기 위한 별도 route 목록이나 복제 renderer를 만들지 않는다.

prototype handoff는 시안·토큰·상태 명세로 사용한다. 후속 통합에서 제품 renderer를 한 번 구현하고 제품/QA가 함께 가져온다. 디자인 담당의 `design/prototype`을 별도 운영 UI로 병행 배포하지 않는다. 새 디자인 pin의 로그인 상태별 소개/대화방 분기, 로그인 뒤로 가기, account/admin 메뉴, custom listbox도 같은 공통 구현과 registry에서 검수한다.

## Fixture와 인가의 분리

실제 관리자 세션과 DB 역할을 서버가 먼저 검사한다. API는 세션 없음 401, 비관리자 403이다. HTML도 인가 전에는 검수 문서나 fixture를 반환하지 않는다. 정적 Assets fallback, 직접 URL, query의 role/mode, client flag로 인가를 우회하지 못하게 한다. 관리자 인증 구현 전에는 route를 닫아 둔다.

HTML/API는 `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`를 사용한다. 공개 sitemap/메뉴에서 제외하며 robots 설정을 인증 대체 수단으로 사용하지 않는다. 검수 전용 fixture/graph 자산도 인가된 경로로만 제공한다. 비밀이 없는 공통 제품 코드 자산은 공개 제품에서 정상 사용한다.

Fixture role은 anonymous/invited/admin 화면 시뮬레이션일 뿐이다. 실제 권한은 문서를 요청한 관리자 세션으로만 판정한다. 같은 관리자 문서에서 fixture를 anonymous로 바꿔도 실제 로그아웃을 실행하지 않는다.

검수 문서의 effect port는 생성 시 in-memory fixture adapter로만 주입한다. runtime query로 production adapter로 바꾸는 옵션은 두지 않는다. 실제 email/invite/room/settings/storage API로 fallback하지 않으며, API mutation을 중계하는 QA endpoint를 만들지 않는다. 검수 문서는 `connect-src 'none'`, `form-action 'none'` 등 검수 전용 CSP를 적용한다. 초기 HTML에 인가된 비밀 없는 manifest를 포함하고 이후 fixture 조작은 메모리에서 수행한다. 실제 변경 API에는 이 검수 기능과 무관하게 정상 authz/CSRF를 유지한다.

여러 preview는 fixture state와 router state가 각각 독립적이어야 한다. 뒤로 가기·에러·재시도는 해당 preview의 memory history에서 발생한다. 실제 제품 URL로 이동하거나 창을 열어 live 작업을 실행하지 않는다. 공통 renderer에서 network가 새어나가면 검수 실패로 처리한다.

## 상태·흐름 coverage

DEMO/HOSTED × anonymous/invited/admin의 gate를 graph에 표현한다. 가능한 조합의 정상·거절 화면 모두 fixture로 확인한다. DEMO 초대 선검증 → OTP → 가입과 missing/invalid/expired/used/revoked 차단을 포함한다. 가입 완료 계정의 새 private persist opt-in/default OFF와 public/anonymous private no-store, 기존 memory→persist 금지도 반영한다. 30일 retention은 mock 시나리오임을 표시한다.

일반·긴 문구·빈 목록, opened listbox의 방향키/Enter/Escape·모바일 clamp, dialog Tab/ShiftTab·닫기·focus 복원·배경 scroll lock, dirty back/review/save/conflict/restricted 상태를 해당 registry에 등록한다. focus/hover는 스크린샷용 클래스 위조만으로 합격하지 않고 실제 키보드·포인터 동작도 확인한다.

CI는 production registry를 기준으로 다음을 자동 대조한다.

1. 모든 등록 component의 필수 상태, dialog 상태, route/role/mode, transition의 success/error/back 결과가 fixture와 graph에 연결되어 있는가.
2. fixture가 참조하는 renderer/route/dialog/transition ID가 실제 export/registry에 존재하며, 중복 ID·dangling edge·미등록 entry가 없는가.
3. 제품 router와 dialog opener가 공통 registry를 통해 동작하며, QA 전용 복제 화면이나 공개 코드의 QA import가 없는가.
4. graph endpoint와 canvas가 같은 node/edge/조건을 표시하는가.
5. 키보드·권한·fixture 부작용 0건 및 핵심 390×844/1440×1000 시각 회귀가 통과하는가. 긴 admin은 fullPage, modal/error/opened select는 viewport로 추가 확인한다.

누락을 일부러 만든 음성 fixture로 CI가 실제 실패하는지 검증한다. 단순 문서 체크나 항상 참인 coverage 목록은 불가하다. 자동검사는 알려진 registry와 규칙의 누락을 검출하는 범위이며 임의 DOM의 모든 시각 문제를 증명하지 못한다. root의 실제 렌더 검수와 사용자 시안 대조도 완료 조건이다.

## 배포 전 흐름 논리 재검수

2026-10-02 15:33:47 UTC 사용자의 “시안 다듬고 플로우에 논리적 헛점이 없는지 한 번 더 살펴둬” 요청에 따라 아래 항목을 최신 디자인 pin과 실제 shared QA board에서 함께 확인한다. 새 요구의 계획이며 이번 문서 수정으로 검수가 실행된 것은 아니다.

| 경로 | 대조할 사용자 동작과 서버 계약 |
| --- | --- |
| auth/signup | DEMO 초대 코드 선검증 후 OTP로 진행, invalid/expired/used/revoked 차단, 로그인 유지 중 불필요한 OTP 재발송 없음, 사람 세션과 fixture 역할 구분 |
| navigation | 비로그인 소개/대화방과 가입·로그인 순서, 로그인 후 대화방 기본, 원래 방 진입 의도 복귀, 관리자만 설정 접근 |
| entry | 안내 GET 자체로 참가·발신하지 않음, 공개/비공개 접근과 권한 구분, 실제 사람 위험 확인과 machine join 구분, 에이전트 안전 고지의 비신뢰 데이터 분리 |
| storage | public/새 anonymous private는 v2 DB 최근 버퍼(최대 500개·2MiB·1시간/방 TTL), 가입 완료 entitlement에 따른 새 private 장기 보관 opt-in/default OFF, 생성 retention·참여자 고지 일치, 기존 v1 memory 방의 자동 저장 전환 금지 |
| disclaimer | 인증·방 생성·연결·입장 고지가 실제 처리/저장 계약과 일치, 경고나 체크를 에이전트 준수·면책·법적 최종본으로 표현하지 않음 |
| error | 잘못된 코드·설정 미준비·403·429·네트워크 단절에서 현재 상태와 가능한 다음 행동이 일치, 실패 UI가 성공·초대 소비·저장 완료로 보이지 않음 |
| expiry | OTP/flow·초대·방·lease의 만료 화면과 API 거부가 일치, 메모리 epoch/reset/gap을 이력 보존 성공으로 보이지 않게 표시 |
| revocation | 취소된 초대·에이전트 권한·관리자 권한의 실제 서버 판정과 표시 일치, 취소 후 옛 화면이나 직접 URL이 권한을 복원하지 않음 |
| back flow | 로그인/가입/위험 dialog의 취소와 focus 복귀, admin dirty-back/review/save/conflict, browser back/forward가 엉뚱한 landing이나 중복 부작용을 만들지 않음 |

각 흐름은 정상 경로만이 아니라 해당 success/error/back edge를 registry와 실제 renderer에서 대조한다. 새 pin이나 제품 변경이 무효화한 항목을 검증하며 무관한 통과 gate 전체를 반복하지 않는다. 실제 관측과 설계 추정을 분리해 기록하고, 논리상 막힌 경로를 숨기기 위해 권한 검사·고지·정책을 약화하지 않는다.

## 통합 순서

1. 최신 디자인 pin의 nav/auth/invite/persist/listbox/safety guide/QA IA를 받고 해당 변경만 실검수한다.
2. 공통 component/dialog/screen/route registry로 제품 구현을 정리하고, 실제 server admin auth가 준비되기 전 검수 URL은 닫는다.
3. 동일 renderer 기반 components/dialogues/flow board와 부작용 없는 fixtures를 구현한다.
4. server gate·graph/registry coverage·음성 대조·키보드·두 viewport 증거를 CI와 연결한다.
5. 제품과 검수면을 한 변경 단위로 review한다. 하나라도 미반영이면 완료·배포 합격으로 처리하지 않는다.

기존 인증 WIP나 PR #3/#4의 통과 증거는 해당 범위에만 재사용한다. 새 admin 역할, registry, screen flow board와 새 CI는 별도 구현 및 검증이 필요하다.

제품 QA는 초기 API fetch 없이 같은 registry에서 graph를 만들고 DOM 및 로컬 JSON 다운로드로 제공한다. `/api/admin/design/catalog`와 `/api/admin/design/graph`는 실제 관리자 인가 후404이며 익명 직접 접근은401/403이다. 이는 읽기 전용 검수의 외부 네트워크 의존을 줄이는 승인된 연결 방식이다.
