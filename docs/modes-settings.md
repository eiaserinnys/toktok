# DEMO/HOSTED DB 설정

최신 DB admission과 초대 가입, private opt-in 계약을 따릅니다. CF SQL control milestone을 보존하고 동일 도메인을 Repository control core로 이식했습니다. 새 이식 gate와 실제 방/UI/runtime wiring은 별도 진행 기록을 따릅니다. DB가 제품 설정 정본이고 클라이언트 mode/role/persist는 권한이 아닙니다.

## 가입과 저장

| 항목 | DEMO | HOSTED |
| --- | --- | --- |
| 신규 가입 | admin 일회 초대 선검증 후 OTP 가입, 기본 공개 signup 없음 | closed/invite/open 명시 정책 |
| 기존 회원 | 초대 없이 OTP 로그인; 유효 session에서 추가 claim/생성에 메일0 | 동일 |
| 인증 private | completed invited/bootstrap account의 권한 있는 새 방에서 persist opt-in, 기본 OFF | DB account entitlement에 따른 persist opt-in, 기본 OFF |
| public/anonymous private | bounded DB recent buffer | bounded DB recent buffer |

DEMO의 open signup을 거부합니다. persistenceAllowed=true는 DEMO에서도 가능하지만 account entitlement/creator/risk ack를 대체하지 않습니다. defaultPersist=false는 두 mode의 안전 불변 조건이고 관리자 schema의 readOnly/constant false로 표시합니다. 생성 생략=OFF, 명시 persist:true만 권한 검사를 거쳐 허용합니다. 모드 전환이 다른 옵션을 자동 완화하지 않습니다. 일반 settings PUT에서 readiness나 active room count를 쓰지 못하며 lifecycle readiness와 pending을 포함한 active private=0인 drain guard를 요구합니다.

## 첫 seed와 schema

schema_version=1, revision 정수, updated_at/by와 metadata label/unit/min/max/applyTo를 사용합니다. seed는 최초 생성에만 적용합니다. unknown key/type/비정수/NaN/무한/교차필드 모순은 거부하며 손상 DB를 defaults로 초기화하지 않습니다. bootstrap email/EMAIL_FROM/provider credential은 schema 밖 infra입니다.

| 구역 | 최초 값 |
| --- | --- |
| deployment | mode=demo, enabled=false |
| signup | policy=invite |
| public.catalog | common-room/함께 이야기, workshop/작업 이야기, quiet-corner/조용한 이야기; 길이0..10, 고유 URLsafe slug, title64자 |
| private cap | anonymousEnabled=false, createPerIpHour3, activePerIp3, activeGlobal10, dailyCreates100 |
| 과거 private TTL 호환 기록 (새 방에 미적용) | anonymousDefaultTtlSeconds3600/anonymousMaxTtlSeconds86400, authenticatedDefaultTtlSeconds86400/authenticatedMaxTtlSeconds604800 |
| private persistence | persistenceAllowed=false, defaultPersist=false, defaultRetentionSeconds86400/maxRetentionSeconds604800 |
| identity | email2/h3/day120초, IP30/h100/day, 월10000; OTP600초/5오입력, flow600초, session43200초, invitation604800초/최대2592000초 |
| budget | targetUsd100/warningUsd50/cutoffUsd70, calendar UTC, typed caps 아래 표; trusted budget/lifecycle readiness=false |

private cap/금액/workload 수치는 root 초기 보수적 제안이며 출시 비용 보장이나 청구 제한이 아닙니다. deployment.enabled=false를 유지합니다. trusted enforcing path 미연결 상태에서 false→true 활성화를 거부합니다. 관리자 임의 readiness=true는 없습니다.

trusted installation profile은 빈 DB 최초 transaction에서만 validateSettings 후 적용합니다. enabled seed는 Repository ready와 코드 enforcement version=1/ready 확인이 모두 필요합니다. 기존 config/admin/account/HMAC는 유지하며 재배포 profile로 덮지 않습니다. profile에 관리자 승격 필드는 없습니다. anonymous demo 초기 활성화는 root 최종 enforcing 연결과 검증 후 별도 wiring하며 현재 운영 활성화는 하지 않았습니다.

## Public policy

`src/public-contracts.ts`와 `src/public-policy.ts`는 B 소유 정본 4e8ad3c의 내용을 그대로 가져왔습니다. A `DEFAULT_PUBLIC_POLICY`는 이 seed에서 도출하며 `validateSettings`와 신뢰된 host projection `runtimePublicPolicy(settings)`는 B validator를 직접 재사용합니다. participant100/watch50/messages100/retention1h/text2048bytes/page64KiB/wait150/handler160/wait25s/room5 per1s/operator 최소30s를 넘지 않습니다. `public.firstWindowSeconds`는 1..300초/default300, `public.firstWindowMessages`는 1..20개/default20인 별도 관리자 옵션입니다. 최초 읽기 메시지 수를 pageSize로 임의 축소하지 않으며 GET /api/config에도 같은 이름으로 제공합니다. agent cadence5초/browser cadence2초/server batch2000ms는 별개입니다. batch는2000..10000ms, lease/grant 최대300초, ipMemoryMs는300000..3600000ms입니다. responseBytes는 안전 불변값65536 고정이며 byteBurst>=responseBytes, waits<=handlers, responseBurst>=1, batchMs<=waitMs를 B validator로 검사합니다. throttle 0/off/unlimited는 없습니다. enabled catalog 수에서 방 수를 유도합니다.

기존 저장 config에 firstWindowMessages가 없으면 검증은 fail closed입니다. 기존 DB를 seed로 덮거나 숨은 기본값으로 복구하지 않으며 해당 config의 명시적인 shape 갱신은 통합 담당이 처리합니다. catalog0..10/title64자와 lease/grant 최소1000ms 등 기존의 더 좁은 A 범위는 유지합니다.

runtime rate/cap/catalog 변경은 최종 policy revision 갱신 최대10초부터 적용합니다. capacity 감소는 기존 lease 추방 없이 신규 입장을 막고 자연 감소합니다. 실제 엔진 경로는 후속 연결 대상입니다. public disable의 새 join/send 차단 및 기존 read/leave 폐쇄 흐름도 엔진 소유 계약입니다.

## Private snapshot

새 비회원 DEMO private는 24h, 회원 private는 소유자 종료까지 상설입니다. 회원 가입·생성 자격과 소유권을 서버에서 확인하며 DEMO 초대 가입/HOSTED 등록에 동일하게 적용합니다. 회원 방은 데모 예산·방 개수 quota에서 제외하지만 IP 시간당 생성 속도와 방 기술 한도는 유지합니다. 이전 TTL 설정은 읽기 전용 호환 기록이며 기존 방 snapshot은 불변입니다. persist retention은 별도 기본24h/최대7d 설정을 유지합니다. 최근 버퍼와 기존 v1 memory room은 장기 보관 retention 필드를 사용하지 않습니다. 30days UI 시나리오는 production 허용 옵션이 아닙니다.

추가 장기 보관 선택은 private+인증된 creator+DB account entitlement+owner risk ack+현재 persistenceAllowed를 함께 검사합니다. 최근 DB 버퍼는 공개·익명에도 적용하며 이 opt-in과 별개입니다. 미소비 invite/client entitlement는 근거가 아닙니다. mode/TTL/retention/저장/participant notice는 새 room snapshot이고 기존 memory→persist API는 없습니다. 생성 전용 options/context/grant와 실제 Room initialize/저장/삭제는 공통 application에 연결됩니다.

PrivatePolicy 정본은 B의 src/private-contracts.ts입니다. settings.private.policy에 새 방 snapshot으로 저장합니다. handler 기본64/상한160, bodyInflight 기본8/상한16, wait 기본32를 사용하고 waits<=handlers/bodyInflight<=handlers를 검사합니다. responseBytes는65536 고정, readCadence는2000..10000ms이며 waitMs를 넘지 않습니다. 임의 client policy나 기존 memory snapshot 변경으로 한도를 넓히지 않습니다.

## 작업량 예약

| kind | unit | UTC day | UTC month |
| --- | --- | ---: | ---: |
| admission_requests | count | 100000 | 3000000 |
| response_bytes | bytes | 3221225472 | 68719476736 |
| private_creates | count | 100 | 2000 |
| active_room_seconds | seconds | 144000 | 4320000 |
| persistent_write_bytes | bytes | 16777216 | 268435456 |
| email_attempts | count | 1000 | 10000 |

관리자 schema의 `budget.workloadCaps.boundsByKind[kind]`는 `{unit,dayMax,monthMax}`를 제공합니다. 상한은 `DEFAULT_SETTINGS`에서 도출하고 서버 validator도 같은 metadata를 사용합니다. 현재 운영 cap을 낮춰도 schema의 안전 최대값을 낮춘 값으로 대체하지 않습니다. UI는 항목의 kind에 맞는 단위와 일·월 상한을 사용하며, 일반 배열 item의 공통 최대값을 종류별 최대값으로 표시하지 않습니다. `SettingsSchemaResponse`의 `{schema_version,schema}` 및 설정 payload의 항목 형태는 유지합니다.

서버 reserve(operation_id,kind,amount)는 같은 transaction에서 UTC day/month를 모두 검사·증가합니다. 하나라도 실패하면 rollback, 같은 ID kind/amount 변경409, 월 경계 재시도 최초 창 유지, 만료 ID410입니다. 종류별 한 번 발급한 ID를 동일 reservation 재시도에만 재사용합니다. window를 caller에게 받지 않고 실패/불확실 예약을 환불하지 않습니다. cap 축소는 기존 usage를 보존합니다. 실제 perform 전에 trusted enforcing path가 예약해야 하며 public body가 counters를 지정하지 않습니다. OTP와 private 생성 도메인은 같은 transaction의 budget aggregate를 사용하고 방 admission/response/write/duration 및 control router 최종 연결은 후속입니다. UTC 창은 provider billing cycle과 다릅니다.

추정 비용 모델 `CF-reference-v1`은 UTC월마다 고정 25,000,000 microUSD와 각 신규 reservation의 기본 14 microUSD를 더합니다. kind별 추가 비용은 admission amount×3, response ceil(bytes/65536), active room seconds×2, persistent write ceil(bytes/16), email attempts×10000 microUSD이며 private create의 추가 비용은 0입니다. 일 합계는 해당 일의 변동 예약분이고 월 합계에는 고정 비용을 포함합니다. replay의 추가 추정 비용은 0이고 실패·불확실 예약을 환불하지 않습니다. 예산 적용 대상의 quantity와 estimate 일·월 합계는 같은 원자 transaction이며 response도 cutoff 판정에서 제외하지 않습니다. 새 회원 비공개방은 이 데모 장부 집계와 차단에서 제외하며 실제 비용이 0이라는 뜻은 아닙니다.

관리자 예산 DTO는 UTC 창, 종류별 실제 예약량과 DB 한도, 추정 일·월 microUSD, warning/cutoff 상태, 현재 target/warning/cutoff USD와 모델 가정을 제공합니다. 월 projected estimate가 cutoff×1000000을 초과하면429/월말 Retry-After이며 정확히 같은 값은 허용합니다. 이 보수적인 Cloudflare 참고 모델은 included usage 0/이메일 시도 1cent 계획 가정이고 actual invoice 또는 Node 서버 운영비가 아닙니다. 설정 저장값·기존 usage는 새 모델이나 threshold 축소로 초기화하지 않습니다. 공개 config에는 배포 usage를 노출하지 않습니다.

## Auth와 개인정보

초대 code 선검증 → browser-bound 증표 → signup flow → email 고정 → OTP 성공 transaction에서 초대/admission/session 일회 소비입니다. 기존 계정 signup은 초대를 소비하거나 entitlement를 더하지 않습니다. 이메일 응답은 계정 존재/가입 자격에 따라 바뀌지 않는 generic accepted이며 요청 예산은 모든 정규화 주소에 동일하게 적용합니다. 기존 flow/nonce/claim/browser와 max10분/min expiry/5오입력/새 요청 cooldown 계약을 유지합니다.

월cap 축소 뒤 이미 발급된 OTP/session/claim/기존 방을 막지 않고 새 send를 제한합니다. provider binding/From 미설정503이며 실제 발송은0입니다. 고정 subject, OTP body only, provider 원본 오류 비노출을 유지합니다. Cloudflare 발송 metadata31일과 Email preview 본문 보관을 구분합니다. 첫 실제 메일 전 preview OFF 직접 실측이 필요하며 현재 운영 값 미검증입니다. OFF가 기존 preview/metadata 즉시 삭제를 보장하지 않습니다.

## 이식과 통합

B async RepositoryPort는 targeted CRUD, control scope, 누적 transaction4096 records/8MiB, record64KiB/list1000 계약입니다. 총 DB4096행 제한이나 전체 snapshot 로딩으로 구현하지 않습니다. 신규 ControlPlane wrapper에 주입하며 기존 SQL IdentityRegistry state를 자동 변환하지 않습니다. SQLite/PG/CF 같은 domain을 사용하고 메일은 transaction 밖 한 번 호출합니다. selfhost backend는 한 번에 하나이며 설치/운영은 이번 검증 범위가 아닙니다.

CF milestone 15 runtime PASS/strict exit0와 새 이식 gate 진행, 기존WIP/미연결 범위는 [control-plane](control-plane.md)에 기록합니다. UI/C renderer 및 registry, production index/Env/bindings/OpenAPI, 실제 PrivateRoom lifecycle, control/room budget enforcing 연결과 최종 회귀는 root 통합 후 검증합니다.

## 복구 사용량 DTO

관리자 budget 화면은 현재 ordinary estimate와 별도로 `recovery.usage` 및 `recovery.bounds`를 표시합니다. bounds는 서버 불변값인 분 10회·일 100회·월 1000회이며 settings schema의 수정 가능한 옵션이 아닙니다. `recovery.response_bytes_limit`은 65536이고 다음 UTC 창 시각은 ISO 문자열로 제공합니다. 이 한정 복구 예산은 정상 요청의 계수를 없애거나 무제한 관리자 접근을 허용하지 않으며 실제 청구량 상한을 보장하지 않습니다. 공개 config와 일반 회원에게 계정 사용량을 제공하지 않습니다.
