# 비공개방 수명과 공개 입장권 철회 — 후속 설계 검토

2026-10-03. **12:11 UTC 사용자 정정으로 회원 상설방의 데모 예산·방 개수 quota 제외는 정책 정의가 확정됐다. 구현·운영 적용·기존 방 전환은 이번 기록 수정에 포함하지 않는다.** 제품 기준은 main `e499b8462d4d40142469933f49a92ad5b0c673ea`; 제품 소스·설정·권한·배포 변경, 새 방·입장권·발언·메일 생성은 하지 않았다. [기존 전체 흐름 검토 r7](https://pages.eiaserinnys.me/d/toktok-product-flow-review-20261003/r/7#policy-followup), [PR17 비공개 검증](../qa/20261003-private-conformance.md), [운영 공개 30일 계약](public-entry-30-days.md)은 현재 동작의 근거다. 새 정책의 구현 성공을 그 검증으로 대신하지 않는다. r7에 연결된 최초 `9698ee0` 검토의 “회원 방도 데모 전체 한도를 점유한다”는 권장 전제는 아래 정정으로 폐기한다.

## 현재 동작과 제안의 차이

사용자 정정: “회원의 상설 방은 예산 외. 방 갯수 제한에서 제외.” **DEMO 비회원 생성 방은24h와 데모 한도, 등록 회원의 상설 비공개방은 데모 사용 예산·방 개수 quota 밖**으로 구분한다. DEMO 초대 가입 완료 회원과 HOSTED 가입 완료 회원 모두 서버 생성 자격과 소유권을 확인한 뒤 같은 회원 정책을 적용한다. 초대받은 참가자 등록에는 유휴 반납을 추가하지 않고, 방 수명과 메시지 보관 수명은 분리한다.

| 항목 | 현재 확인된 계약 | 후속 권장안 / 변경량 |
|---|---|---|
| 참가 정원 | 참가자 등록 최대64, 유휴 반납 없음. 읽기·대기 동시성 한도는 별도 | 유지. 오프라인도 등록 정원에 포함. 상설방에서는 퇴장·강퇴로 정원을 회수해야 함 |
| DEMO 비회원 생성 | 운영 기본1,800초·최대3,600초 | 새 방 기본/최대86,400초, 생성 시 더 짧은 수명 선택 허용을 권장. 설정 schema는 이미24h까지 허용하지만 **운영값 변경은 아직 안 함** |
| 회원 생성 | 운영 기본86,400초·최대604,800초, 모든 방에 절대 만료 필수 | DB에서 확인한 생성 entitlement가 있는 회원/그 회원 소유 agent의 **새 방**에 `until_closed` 수명 유형 추가. 단순 큰 TTL 대입은 피함 |
| 방 개수·데모 예산 | 회원/비회원 모두 같은 생성 slot과 공유 예산 경로 | 회원 상설방의 생성·해당 방 사용은 데모 quota/사용 예산에서 제외. 비회원 DEMO 방만 데모 생성량·열린 방 수·사용 예산 적용. 현재 미구현 |
| 자발 퇴장·개별 강퇴·링크 교체 | 현재 API 없음. owner의 전체 close/delete만 있음 | 새 기능. 기존 기능을 “유지”하는 것으로 보고하지 않음. 참가자 자신의 키/owner 권한으로만 변경 |
| 최근 대화 | 새 v2 방: 최대500개·직렬화 메시지2MiB·1h와 방TTL 중 먼저 도달. 첫 페이지 기본20개/응답64KiB, before/delta 조회 | 그대로. 24h/상설방이 메시지를24h/무기한 보관한다는 뜻이 아님 |
| 장기 보관 | 자격 있는 회원의 새 방 opt-in, 기본OFF. 운영 기본1일·최대7일; 본문 개수 상한도 별도 | 그대로 별도 선택. 상설방 전환으로 기존 최근 버퍼나 v1 memory를 장기 저장으로 전환하지 않음 |

“회원”은 로그인 표시만으로 판정하지 않는다. 현재 DB의 verified account, `can_create_private`, 생성 확인 및 agent 소유권을 사용한다. DEMO의 초대 코드를 받았다는 사실만으로 회원이 되지 않으며 가입·인증 완료가 필요하다. HOSTED도 mode 문자열만으로 회원 취급하지 않는다. 기존에 승인된 bootstrap 계정은 현재 서버 자격 검사를 따르며 새 관리자 권한을 부여하지 않는다. 비회원이 나중에 가입해도 기존 방을 자동 상설화하거나 예산 분류를 바꾸지 않는 안을 권장한다.

## 실제 변경이 필요한 구조

현재 `PrivateRoomInit.expires_at:number`, `initSnapshot`의 유한 정수 검사, `roomView`의 ISO 날짜, CONTROL 생성 slot/expiry index, wait deadline, CF alarm·Node timer가 모두 방의 절대 만료를 전제한다. 상설은 버전이 있는 `lifetime`과 nullable expiry를 일관되게 지원해야 한다. Infinity·먼 미래 날짜로 상설을 흉내 내면 JSON 검증, timer, quota 회수와 UI 안내가 서로 어긋난다.

- **방 수명:** admission/policy/schema/DTO → immutable 생성 snapshot → private core → CF/SQLite/PG wrapper와 startup 복원 → guide/OpenAPI/UI/공유 registry·dialog·flow까지 이어지는 변경이다. 기존 v1/v2 판독은 유지한다.
- **예산·quota 분류:** 현재 `CreationAdmissions.reserve`는 회원 확인 뒤에도 동일 `activeGlobal/activePerIp/dailyCreates/private_creates`를 사용하고, host와 `CoreBudget`도 공유 예산으로 요청·응답·duration·쓰기를 예약한다. 방 개수 검사 한 곳만 건너뛰면 회원 방이 여전히 데모 소진으로 막힌다. 신뢰 가능한 owner와 방 정책에서 예산 적용 대상을 도출해 생성·HTML/API 진입·읽기·대기·발언·응답 경로를 함께 분리해야 한다. 사용량 관측은 유지할 수 있으나 회원 사용량을 데모 차단 장부에 합산하지 않는다.
- **서버 권한 경계:** 생성 시 실제 계정/현재 agent 소유권/entitlement와 확인 절차를 검증한 뒤 서버가 `owner_account_id`와 방 분류를 정한다. 클라이언트의 member/hosted/free 플래그, query/header, 요청한 room ID만으로 예산 제외를 선택하지 않는다. 이후 요청은 서버가 확인한 방 소유·정책과 해당 방 capability를 함께 검증한다. 회원 소유 방에 초대된 비회원 참가자에게 새 로그인 의무를 덧붙이지 않는다. 제외는 “방의 검증된 소유 정책”에 따른 것이며 그 참가자의 다른 방 요청까지 면제하지 않는다. 인가 실패 요청에도 cheap edge/rate/body/handler 제한을 유지한다.
- **등록 정원:** `participants`는 metadata 배열이며 현재64명까지 계속 남는다. 새 leave/kick는 participant 키와 pending wait를 끝내고 슬롯을 회수해야 한다. 활성 HTTP/wait 수와 회원 정원을 합치지 않는다. 중복 join의 과거 키가 다시 살아나지 않도록 제한된 재시도/tombstone 정책이 필요하다.
- **링크 교체:** 현재 invite/read hash는 immutable snapshot에 포함된다. 교체 가능한 권한 세대/상태를 별도로 두고 기존 init digest를 깨지 않아야 한다. 초대 링크 교체는 기존 참가자 키를 자동 취소하지 않는 것이 권장안이다. read 링크 교체와 개별 강퇴는 별도 동작이다.
- **강퇴의 한계:** 공유 invite를 계속 가진 사람은 새 참가자로 다시 가입할 수 있다. 따라서 “강퇴만으로 영구 재입장 금지”를 약속하면 안 된다. 기본 대응은 해당 참가자 강퇴와 유출 invite 교체의 조합이다. 신원 기반 영구 차단은 이번 제안에 추가하지 않는다.
- **소유권:** 회원 방은 opaque account ID와 생성 agent를 구분해 연결한다. owner key를 잃은 뒤 원치 않는 상설방과 데이터가 남지 않도록 본인 방 목록/종료 경로를 실제 계정 인가로 제공할지 결정해야 한다. 이를 데모 정원 점유 문제로 설명하지 않는다. 운영 DB 직접 승격이나 관리자 사칭은 해법이 아니다.

상설방의 유휴 프로세스를 계속 실행할 필요는 없다. 본문과 등록 metadata를 저장하고, 본문 정리가 끝난 빈 방에는 다음 만료 작업이 없으면 alarm/timer를 두지 않는 것이 목표다. 현재 장기 보관 경로의 주기적 maintenance도 무기한 빈 방에서 계속 돌지 않도록 함께 검토해야 한다. 회원 방의 정상 polling/longpoll·발언·정리에는 공급자 비용이 발생하지만 새 정책에서는 이를 데모 예산에 청구하지 않는다. Cloudflare는 휴면 가능한 유휴 객체의 duration을 과금하지 않지만 DB 저장·읽기·쓰기·삭제는 별도다. [공식 과금 설명](https://developers.cloudflare.com/durable-objects/platform/pricing/), [lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) — 2026-10-03 확인.

## 기존 방 전환과 삭제·보관

가장 작은 안전한 전환은 **새 정책 시행 후 생성한 방만 새 수명과 예산 분류를 적용**하는 것이다. 기존 방은 생성 때 고지한 만료·저장 snapshot과 현재 예산 분류를 유지하는 안을 권장하며, 이 기존 방 처리 방식은 별도 확정이 필요하다. 만료·삭제된 방/본문은 복구하거나 상설로 되살리지 않는다. v1 memory 방에 DB 본문 저장을 소급 적용하지 않는다.

기존 유효 회원 방도 전환하기로 결정하면 실제 owner 인가, 계정 연결 확인, 새 만료/보관 고지, CONTROL slot과 room 상태의 복구 가능한 전환이 필요하다. 기존 데모 slot은 정확히 한 번 회수하고 이후 close/delete 때 중복 차감하지 않아야 한다. 이미 소비한 예산의 환불·장부 재작성은 하지 않는 안을 권장한다. 이번 기록 수정에서 TTL을 늘리거나 metadata/카운터를 수정하지 않는다.

현재 close는 신규 가입·발언을 막고, 남은 이력은 원래 보관 경계 내에서 읽을 수 있게 한다. DELETE는 접근을410으로 차단하고 bounded batch로 본문·dedupe를 정리하며 metadata가 남을 수 있다. 상설에서도 close와 delete를 구분한다. 만료 없는 방의 참여자·capability 해시를 영구 방치하지 않도록 종료 후 metadata 보존/정리 기한은 구현 전에 정해야 한다. 본문 retention과도 다른 기한이다. 백업/PITR의 즉시 물리 삭제는 보장하지 않는다.

## 데모 quota와 기술적 안전 제한의 분리

설치 profile은 현재 열린 비공개방을 전체2개/IP당2개, 생성20개/일로 제한한다. 아래 운영 공개 응답에서 직접 읽을 수 없는 필드이므로 **현재 live 한도로 확정하지 않는다**. 현 구현의 `active_private`는 회원·비회원 열린 방을 함께 센다. 새 정책은 이 동작을 바꿔 **회원 상설방을 데모 열린 방 수·생성량 quota와 사용 예산에서 제외**한다. 회원 방이 데모 두 자리를 영구 점유한다는 기존 제안의 문제 설정은 폐기한다. 대신 회원별/전체 상설방 개수 제한을 임의로 신설하지 않는다.

비회원24h 방에는 데모 quota를 유지한다. 예를 들어 데모 전체2방이 모두 비회원 방이면 다른 비회원은 자리 반환을 기다릴 수 있지만, 그 이유로 검증된 회원 상설방 생성을 막지 않는다. 방 생명주기 집계/관리자 목록은 관측을 위해 유지할 수 있으나 데모 용량 카운터와 구분한다. 현재 mode 변경의 `active_private=0` 조건은 데이터·인증 정책 전환 안전 장치인지 데모 quota인지 구분해 설계해야 하며, 회원 방을 데모 카운터에서 뺐다는 이유로 mode 변경을 무조건 허용하면 안 된다.

payload/응답 bytes, 요청 속도, 동시 handler·wait, 참가자 등록 정원, 최근 버퍼500개·2MiB·1h, 장기 보관 opt-in의 명시 보관 상한, capability·Origin·CSRF 검증 등 **서버의 기술적 안전 제한은 회원에게도 유지**한다. 이 제한을 방 개수 quota 면제와 섞지 않는다. 회원 생성은 계속 cheap edge와 기술적 생성 요청 속도 제한을 거치지만, 데모 일 생성량을 다른 이름으로 재적용하지 않는다.

회원 방의 생성·그 방의 읽기/대기/발언·응답·저장/정리 사용량은 데모 장부와 분리한다. 이 정책은 회원의 공개방 사용, 인증 메일, 가입·초대 또는 관리자 요청까지 일괄 면제하라는 뜻이 아니다. 기존 공개 입장권 예산/철회 계약도 이번 정정으로 바뀌지 않는다.

방당 최근 메시지2MiB 상한은 유지되지만 회원 방 개수를 데모 quota로 제한하지 않으므로, 전체 회원 데이터 비용을 “두 방 합4MiB”로 추정할 수 없다. 인덱스·metadata·장기 보관·실제 DB 할당량도 별도다. 데모의 월100 USD 목표와 strict cutoff는 데모에 적용하는 기준이며 회원 사용량을 포함한 서비스 전체 비용 상한이라고 약속하지 않는다. **Cloudflare 유료 플랜 변경·무제한 과금 구매·추가 credential/인프라 권한 승인은 아니다.** 기존 공급자/인프라 제한은 유지하고 실제 사용량은 관측한다. 회원에 데모 예산을 재적용하거나 새로운 회원 예산·방 개수 quota를 조용히 추가하지 않는다.

## 운영 조회와 공개 입장권 실효 발급량

이하 조회와 철회 분석은 **정정 정책 구현 전의 현재 제품**에 대한 기록이다. 12:11 UTC 정정 후 운영을 다시 조회하지 않았으며, 회원 방 예산 분리나 기존 방 전환이 적용됐다는 증거가 아니다. 공개 입장권 정책은 정정 대상이 아니다.

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

## 구현·기존 방 전환 전에 남은 최소 결정

회원 상설방의 데모 예산/방 개수 quota 제외를 다시 미결 질문으로 돌리지 않는다. 다음만 구현 착수·전환 범위에서 확정하면 된다.

1. **적용 시점과 기존 방:** 새 방부터 적용할지, 현재 살아 있는 회원 방도 owner 확인 후 전환할지. 새 방 우선/기존 방 자동 연장·장부 환불 없음이 최소안이다. 기존 방 전환 시 데모 slot의 정확히 한 번 회수를 검증한다.
2. **소유 종료·탈퇴와 정리:** owner 키 분실 때 본인 계정의 종료 동선, 소유 계정 탈퇴/자격 상실 시 기존 상설방 처리, close/delete 후 권한 metadata 정리 기한. 이를 대신해 회원 방 개수 한도를 새로 넣지 않는다. 자발 leave·개별 kick·링크 교체는 여전히 별도 구현 범위다.
3. **별개인 공개 철회:** 예산 고갈 때의 사람 철회 전용 경로를 추가 설계할지는 이전 미결 그대로다. 회원 private 예산 제외를 공개 입장권 철회 예외 승인으로 확대하지 않는다.

구현 시에는 데모 예산/방 quota 소진 상태에서도 **서버가 자격·소유권·capability를 확인한 회원 방**만 데모 차단과 분리되는지, 비회원/위조 member 플래그/다른 방 키는 그 분류를 사용할 수 없는지 확인해야 한다. CF/SQLite/PG에서 같은 분류·수명·정리 계약을 적용하고 공유 UI/agent guide/admin schema/flow에도 구분을 표시한다. 이번 수정은 문서 대조만 했으며 이 동작을 실행 검증하지 않았다.

근거 소스: `src/control-policy.ts`, `create-admission.ts`, `private-contracts.ts`, `private-state.ts`, `private-core.ts`, `runtime/private-rooms.ts`, `settings-schema.ts`, `installation-profile.ts`, `settings-store.ts`, `application.ts`, `public-browser.ts`, `public-core.ts`, `public-entries.ts`, `runtime/budget.ts`, `admin-recovery.ts`. 이번 확인은 source 읽기와 정책을 바꾸지 않는 live GET 및 산술 대조이며, 새 정책의 실행 테스트나 live 철회 실험이 아니다.
