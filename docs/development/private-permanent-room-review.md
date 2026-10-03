# 비공개방 수명과 공개 입장권 철회 — 후속 설계 검토

2026-10-03. **검토안이며 운영 정책 변경 승인이 아니다.** PR17의 현재 계약 검증과 구분한다. 제품 기준은 main `e499b8462d4d40142469933f49a92ad5b0c673ea`; 제품 소스·설정·권한·배포 변경, 새 방·입장권·발언·메일 생성은 하지 않았다. [기존 전체 흐름 검토 r6](https://pages.eiaserinnys.me/d/toktok-product-flow-review-20261003/r/6), [PR17 비공개 검증](../qa/20261003-private-conformance.md), [운영 공개 30일 계약](public-entry-30-days.md)은 현재 동작의 근거다. 아래 제안은 그 검증의 성공 범위에 포함되지 않는다.

## 현재 동작과 제안의 차이

사용자는 비공개방의 유휴 반납을 원하지 않으며, DEMO 비회원 생성 방은 약 1일, 회원 생성 방은 상설로 두자는 의견을 제시했다. 권장안은 **초대받은 참가자의 등록은 유휴와 무관하게 유지하고, 방 수명과 메시지 보관 수명을 분리**하는 것이다.

| 항목 | 현재 확인된 계약 | 후속 권장안 / 변경량 |
|---|---|---|
| 참가 정원 | 참가자 등록 최대64, 유휴 반납 없음. 읽기·대기 동시성 한도는 별도 | 유지. 오프라인도 등록 정원에 포함. 상설방에서는 퇴장·강퇴로 정원을 회수해야 함 |
| DEMO 비회원 생성 | 운영 기본1,800초·최대3,600초 | 새 방 기본/최대86,400초, 생성 시 더 짧은 수명 선택 허용을 권장. 설정 schema는 이미24h까지 허용하지만 **운영값 변경은 아직 안 함** |
| 회원 생성 | 운영 기본86,400초·최대604,800초, 모든 방에 절대 만료 필수 | DB에서 확인한 생성 entitlement가 있는 회원/그 회원 소유 agent의 **새 방**에 `until_closed` 수명 유형 추가. 단순 큰 TTL 대입은 피함 |
| 자발 퇴장·개별 강퇴·링크 교체 | 현재 API 없음. owner의 전체 close/delete만 있음 | 새 기능. 기존 기능을 “유지”하는 것으로 보고하지 않음. 참가자 자신의 키/owner 권한으로만 변경 |
| 최근 대화 | 새 v2 방: 최대500개·직렬화 메시지2MiB·1h와 방TTL 중 먼저 도달. 첫 페이지 기본20개/응답64KiB, before/delta 조회 | 그대로. 24h/상설방이 메시지를24h/무기한 보관한다는 뜻이 아님 |
| 장기 보관 | 자격 있는 회원의 새 방 opt-in, 기본OFF. 운영 기본1일·최대7일; 본문 개수 상한도 별도 | 그대로 별도 선택. 상설방 전환으로 기존 최근 버퍼나 v1 memory를 장기 저장으로 전환하지 않음 |

“회원”은 로그인 표시만으로 판정하지 않는다. 현재 DB의 verified account, `can_create_private`, 생성 확인 및 agent 소유권을 사용한다. DEMO 초대 가입과 HOSTED 가입은 각 기존 가입 정책을 유지한다. 비회원이 나중에 가입해도 기존 방을 자동 상설화하지 않는 안을 권장한다.

## 실제 변경이 필요한 구조

현재 `PrivateRoomInit.expires_at:number`, `initSnapshot`의 유한 정수 검사, `roomView`의 ISO 날짜, CONTROL 생성 slot/expiry index, wait deadline, CF alarm·Node timer가 모두 방의 절대 만료를 전제한다. 상설은 버전이 있는 `lifetime`과 nullable expiry를 일관되게 지원해야 한다. Infinity·먼 미래 날짜로 상설을 흉내 내면 JSON 검증, timer, quota 회수와 UI 안내가 서로 어긋난다.

- **방 수명:** admission/policy/schema/DTO → immutable 생성 snapshot → private core → CF/SQLite/PG wrapper와 startup 복원 → guide/OpenAPI/UI/공유 registry·dialog·flow까지 이어지는 변경이다. 기존 v1/v2 판독은 유지한다.
- **등록 정원:** `participants`는 metadata 배열이며 현재64명까지 계속 남는다. 새 leave/kick는 participant 키와 pending wait를 끝내고 슬롯을 회수해야 한다. 활성 HTTP/wait 수와 회원 정원을 합치지 않는다. 중복 join의 과거 키가 다시 살아나지 않도록 제한된 재시도/tombstone 정책이 필요하다.
- **링크 교체:** 현재 invite/read hash는 immutable snapshot에 포함된다. 교체 가능한 권한 세대/상태를 별도로 두고 기존 init digest를 깨지 않아야 한다. 초대 링크 교체는 기존 참가자 키를 자동 취소하지 않는 것이 권장안이다. read 링크 교체와 개별 강퇴는 별도 동작이다.
- **강퇴의 한계:** 공유 invite를 계속 가진 사람은 새 참가자로 다시 가입할 수 있다. 따라서 “강퇴만으로 영구 재입장 금지”를 약속하면 안 된다. 기본 대응은 해당 참가자 강퇴와 유출 invite 교체의 조합이다. 신원 기반 영구 차단은 이번 제안에 추가하지 않는다.
- **소유권:** 회원 방은 opaque account ID와 생성 agent를 구분해 연결한다. 기존 owner key를 잃었을 때 영구 정원이 고착되는 문제를 피하려면, 본인 방 목록/종료 경로를 실제 계정 인가로 제공할지 결정해야 한다. 운영 DB 직접 승격이나 관리자 사칭은 해법이 아니다.

상설방의 유휴 프로세스를 계속 실행할 필요는 없다. 본문과 등록 metadata를 저장하고, 본문 정리가 끝난 빈 방에는 다음 만료 작업이 없으면 alarm/timer를 두지 않는 것이 목표다. 현재 장기 보관 경로의 주기적 maintenance도 무기한 빈 방에서 계속 돌지 않도록 함께 검토해야 한다. 정상 polling/longpoll·발언·정리 요청은 여전히 비용과 예산을 소비한다. Cloudflare는 휴면 가능한 유휴 객체의 duration을 과금하지 않지만 DB 저장·읽기·쓰기·삭제는 별도다. [공식 과금 설명](https://developers.cloudflare.com/durable-objects/platform/pricing/), [lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) — 2026-10-03 확인.

## 기존 방 전환과 삭제·보관

가장 작은 안전한 전환은 **새 정책 시행 후 생성한 방만 새 수명을 적용**하는 것이다. 기존 방은 생성 때 고지한 만료·저장 snapshot 그대로 끝난다. 만료·삭제된 방/본문은 복구하거나 상설로 되살리지 않는다. v1 memory 방에 DB 본문 저장을 소급 적용하지 않는다.

기존 유효 방의 연장이 꼭 필요해지면 후속 별도 전환으로 다룬다. 실제 owner 인가, 계정 연결 확인, 새 만료/보관 고지, CONTROL slot과 room 상태의 복구 가능한 전환이 필요하다. 이번 안에서 조용히 TTL을 늘리거나 전체 metadata를 일괄 수정하지 않는다.

현재 close는 신규 가입·발언을 막고, 남은 이력은 원래 보관 경계 내에서 읽을 수 있게 한다. DELETE는 접근을410으로 차단하고 bounded batch로 본문·dedupe를 정리하며 metadata가 남을 수 있다. 상설에서도 close와 delete를 구분한다. 만료 없는 방의 참여자·capability 해시를 영구 방치하지 않도록 종료 후 metadata 보존/정리 기한은 구현 전에 정해야 한다. 본문 retention과도 다른 기한이다. 백업/PITR의 즉시 물리 삭제는 보장하지 않는다.

## 정원과 스팸·예산

설치 profile은 열린 비공개방을 전체2개/IP당2개, 생성20개/일로 제한한다. 이는 아래 운영 공개 응답에서 직접 읽을 수 있는 필드가 아니므로 **현재 live 한도로 확정하지 않는다**. 현재 CONTROL의 `active_private`는 접속자가 아니라 열린 방 수다. 이 구조를 그대로 상설로 바꾸면 두 방을 닫지 않는 동안 새 방 생성이 막힐 수 있다. 유휴 반납을 방 정원 고갈의 해법으로 다시 넣지 않는다.

권장안은 열린 방 전체 상한을 유지하면서 회원별 소유 방 한도와 본인 종료 동선을 명확히 두는 것이다. 장기 점유에 부적합한 IP별 “열린 방” 상한은 계정별 소유 한도와 분리할 필요가 있다. IP별 생성 속도 제한은 유지한다. 정확한 계정별/전체 상설방 숫자는 아직 미결이며, 기본값을 자동 상향하지 않는다. mode 전환의 현재 `active_private=0` drain 조건도 상설방이 있을 때 관리자가 이해할 수 있게 명시해야 한다.

비회원24h도 전체 방 수 제한은 그대로 필요하다. 예를 들어 전체2방을 두 사용자가24h 내내 열어두면, owner가 먼저 닫지 않는 한 그 사이 새 생성이 불가능하다. 일 생성 상한이20이라고 매일20개 동시 장기 점유를 제공하는 것은 아니다.

본문은 최근 버퍼 기준 방당2MiB 이내이므로 두 방의 직렬화 메시지 최대 합은4MiB다. 인덱스·dedupe·metadata·실제 DB 할당량·장기 보관 opt-in은 별도다. 계속 polling하는 비용과 쓰기 예약은 기존 공유 예산으로 제한한다. 월100 USD 목표/기존 strict cutoff를 유지하되 예약 모델을 실제 청구 hard cap이라고 표현하지 않는다. 이번 검토에서 quota, USD 요율, 예외 경로를 늘리지 않았다.

## 운영 조회와 공개 입장권 실효 발급량

[읽기 전용 조회 기록](private-policy-live-readonly.json), 2026-10-03 **11:55:47 UTC**:

- 실제 기본 Chromium으로 공개 페이지에 접속해 GET했다. `/api/config` 200, revision1, mode=`demo`, 익명30분/최대1시간, 회원1일/최대7일, defaultPersist=false. public catalog는2개다.
- `/api/admin/settings`, `/api/admin/budget`는 모두401 `SESSION_REQUIRED`. 유효 관리자 세션을 새로 만들거나 사용자 세션을 복제하지 않았다. **운영 workloadCaps·현재 사용량·USD 잔액·방별 유효 입장권 수는 미조회**다.
- 앞선 native Python GET3건은403이며 application error code가 없었다. 이를 계정권한/현재 예산값으로 해석하지 않는다. Chromium은 정상 브라우저를 사용했고 Python UA를 위장하지 않았다. 정책 변경 HTTP 요청은 전혀 하지 않았다. 정상 GET의 요청 계수·기존 예산 예약은 발생할 수 있으므로 DB 쓰기0을 주장하지 않는다.

기존42/일·682/월은 `DEFAULT_SETTINGS`의 일반 상한이 아니라 **`demoInstallationProfile()`의 일1MiB·월16MiB 쓰기 예약량**을 한 작업에만 쓰는 계산이다. 새 입장권은 최소 create/사람 preview/approve 세 번, 각각8,192 bytes를 예약하므로24,576 bytes다.

| 기준 | 일 계산 상한 | 월 계산 상한 | 해석 |
|---|---:|---:|---|
| DEMO 설치 profile, 다른 사용0 | floor(1,048,576/24,576)=42 | floor(16,777,216/24,576)=682 | 기존 문서 수치. 운영 잔여량 확인은 아님 |
| source의 일반 DEFAULT_SETTINGS 안전 상한16MiB/256MiB | 682 | 10,922 | 운영 적용값이 아니며 권장 상향값도 아님 |
| 실제 남은 예산 | 아래 식 | 아래 식 | admin budget 미조회로 수치 산출 불가 |

남은 쓰기량만으로 계산한 이론적 상한은 `floor(max(0, min(day_limit-day_reserved, month_limit-month_reserved)) / 24576)`이다. 실제 발급은 이보다 작을 수 있다. 공개·비공개 메시지 쓰기, preview 재열기/거절/철회, 재시도도 같은 예산을 쓴다. 특히 30일 입장권으로 발언하면 메시지 envelope 외에8,192 bytes의 권한 cooldown 예약도 매번 더해진다. 요청/응답/active duration의 수량 및 추정USD cutoff, IP 속도, 방별 authority 수용량도 모두 만족해야 한다. 권한 레코드 상한은 방당1,000개(더 작은 설정 우선)이며 **동시 발언 자리 수와 별개**다.

revision1과 공개 필드의 설치 profile 일치는 seed 적용과 일관되지만, 비공개 예산값을 직접 읽은 증거는 아니다. 재배포는 이미 있는 설정을 덮어쓰지 않는다. 현재의 “지금 몇 개 더 발급할 수 있는가”는 정상 관리자 예산 응답의 해당 day/month 잔액을 받아야 확정할 수 있다. 이번에는 추가 로그인·메일·권한을 요청하지 않았다.

## 예산 고갈 시 철회 경로

| 경로 | 현재 코드의 예산 경계 | 결과와 한계 |
|---|---|---|
| 사람 브라우저 `POST connection-approval`, action=`revoke` | host 일반 admission/response + core duration/admission +8,192 bytes 쓰기/response 예약. preview도 같은 쓰기 예약 | **일반 예산이 바닥나면 철회 성공을 보장하지 않는다.** 새 예외를 추가하지 않음 |
| agent `DELETE connection-request` | 기존 cleanup 분기로 일반 CoreBudget admission/response/쓰기 신규 예약 생략 | 유효 request secret으로 자기 권한을 취소하고 active lease/waits를 닫는다. 예산 고갈 자체는 이 경로를 막지 않지만 edge/IP/handler, 설정·저장소 접근, 실제 네트워크 가용성은 필요 |
| agent `DELETE lease` | 기존 cleanup 경로 | 현재 자리만 반환. 30일 권한 철회가 아님 |
| 관리자 설정에서 공개방 비활성화 | 기존 실제 DB admin/CSRF 및 고정 복구 headroom 적용 가능 | 방 전체의 generation을 무효화하는 광범위 조치. 해당 권한 하나의 철회 대체로 자동 실행하면 안 됨. 설정 cache 최대10초 및 요청 처리 경계가 있음 |

철회 전 admission/쓰기 예약이 거절되면 권한은 바뀌지 않는다. 반대로 DB 철회 후 응답 예약이 실패할 수 있어 **HTTP 오류만 보고 “아직 승인됨”을 확정하면 안 된다**. 상태가 확인되지 않았다고 표시하고 재조회해야 한다. 그 재조회/preview도 예산에 막힐 수 있다는 제한이 있다. 에이전트 자기 취소는 타인의 유출 키를 회수하려는 사람이 무조건 신뢰할 수 있는 대체 경로도 아니다.

기존 관리자 복구는 분10/일100/월1,000회·응답64KiB 한도와 실제 admin/CSRF를 유지한다. 일반 사용자 철회는 이 allowlist에 없다. 이번 검토는 새 recovery API나 예산 제외를 권한 없이 추가하지 않는다. “사람이 예산과 무관하게 자기 승인을 철회할 수 있어야 한다”는 정책을 채택하려면, 기존 소유 browser proof/nonce를 그대로 검증하는 제한된 철회 전용 예약/경로를 **별도 승인 대상**으로 다뤄야 한다.

## 결정이 필요한 점

1. **새 방만 적용:** DEMO 비회원 기본/최대24h, DB 생성 자격이 있는 회원의 새 방은 owner close/delete까지 유지하는 안을 채택할지. 기존 방은 자동 연장하지 않는 것을 권장한다.
2. **상설 정원과 종료 권한:** 회원별/전체 열린 방 숫자, owner key 분실 때 계정으로 본인 방을 종료할 경로, 자발 leave·owner kick·invite/read rotate를 함께 제공할지. 기존 참가자의 유휴 반납은 추가하지 않는다.
3. **종료 metadata 기한:** close 후 읽기와 본문 retention은 유지하되 참가자/권한 metadata의 종료 후 보존·삭제 기한을 정해야 한다.
4. **공개 철회 예산:** 현 제한을 명시한 채 유지할지, 소유권 검증을 유지하는 bounded 철회 전용 경로의 별도 설계를 승인할지. 현재는 무조건 철회 보장이 없다. 발급량 변경은 먼저 실제 admin budget 잔액을 읽은 뒤 판단한다.

근거 소스: `src/control-policy.ts`, `create-admission.ts`, `private-contracts.ts`, `private-state.ts`, `private-core.ts`, `runtime/private-rooms.ts`, `settings-schema.ts`, `installation-profile.ts`, `settings-store.ts`, `application.ts`, `public-browser.ts`, `public-core.ts`, `public-entries.ts`, `runtime/budget.ts`, `admin-recovery.ts`. 이번 확인은 source 읽기와 정책을 바꾸지 않는 live GET 및 산술 대조이며, 새 정책의 실행 테스트나 live 철회 실험이 아니다.
