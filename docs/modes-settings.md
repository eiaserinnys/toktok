# DEMO/HOSTED DB 설정

최신 DB admission과 초대 가입, private opt-in 계약을 따릅니다. CF SQL control milestone은 구현했으며 동일 Repository core 이식 및 실제 방/UI/runtime wiring은 후속입니다. DB가 제품 설정 정본이고 클라이언트 mode/role/persist는 권한이 아닙니다.

## 가입과 저장

| 항목 | DEMO | HOSTED |
| --- | --- | --- |
| 신규 가입 | admin 일회 초대 선검증 후 OTP 가입, 기본 공개 signup 없음 | closed/invite/open 명시 정책 |
| 기존 회원 | 초대 없이 OTP 로그인; 유효 session에서 추가 claim/생성에 메일0 | 동일 |
| 인증 private | completed invited/bootstrap account의 권한 있는 새 방에서 persist opt-in, 기본 OFF | DB account entitlement에 따른 persist opt-in, 기본 OFF |
| public/anonymous private | body memory only | body memory only |

DEMO의 open signup을 거부합니다. persistenceAllowed=true는 DEMO에서도 가능하지만 account entitlement/creator/risk ack를 대체하지 않습니다. 모드 전환이 다른 옵션을 자동 완화하지 않습니다. 일반 settings PUT에서 readiness나 active room count를 쓰지 못하며 lifecycle readiness와 active private=0인 drain guard를 요구합니다.

## 첫 seed와 schema

schema_version=1, revision 정수, updated_at/by와 metadata label/unit/min/max/applyTo를 사용합니다. seed는 최초 생성에만 적용합니다. unknown key/type/비정수/NaN/무한/교차필드 모순은 거부하며 손상 DB를 defaults로 초기화하지 않습니다. bootstrap email/EMAIL_FROM/provider credential은 schema 밖 infra입니다.

| 구역 | 최초 값 |
| --- | --- |
| deployment | mode=demo, enabled=false |
| signup | policy=invite |
| public.catalog | common-room/함께 이야기, workshop/작업 이야기, quiet-corner/조용한 이야기; 길이0..10, 고유 URLsafe slug, title64자 |
| private cap | anonymousEnabled=false, createPerIpHour3, activePerIp3, activeGlobal10, dailyCreates100 |
| private TTL | anonymousDefaultTtlSeconds3600/anonymousMaxTtlSeconds86400, authenticatedDefaultTtlSeconds86400/authenticatedMaxTtlSeconds604800 |
| private persistence | persistenceAllowed=false, defaultPersist=false, defaultRetentionSeconds86400/maxRetentionSeconds604800 |
| identity | email2/h3/day120초, IP30/h100/day, 월10000; OTP600초/5오입력, flow600초, session43200초, invitation604800초/최대2592000초 |
| budget | targetUsd100/warningUsd50/cutoffUsd70, calendar UTC, typed caps 아래 표; trusted budget/lifecycle readiness=false |

private cap/금액/workload 수치는 root 초기 보수적 제안이며 출시 비용 보장이나 청구 제한이 아닙니다. deployment.enabled=false를 유지합니다. trusted enforcing path 미연결 상태에서 false→true 활성화를 거부합니다. 관리자 임의 readiness=true는 없습니다.

## Public policy

`src/settings-schema.ts` DEFAULT_PUBLIC_POLICY는 B d230fbe 엔진 seed를 보존합니다. participant100/watch50/messages100/retention1h/text2048bytes/page64KiB/wait150/handler160/wait25s/room5 per1s/operator 최소30s를 넘지 않습니다. initial tail은 최대300초/20개입니다. agent cadence5초/browser cadence2초/server batch2000ms는 별개입니다. batch는2000..10000ms, lease/grant 최대300초입니다. responseBytes는 안전 불변값65536 고정이며 byteBurst>=responseBytes, waits<=handlers, responseBurst>=1, batchMs<=waitMs를 검사합니다. throttle 0/off/unlimited는 없습니다. enabled catalog 수에서 방 수를 유도합니다.

runtime rate/cap/catalog 변경은 최종 policy revision 갱신 최대10초부터 적용합니다. capacity 감소는 기존 lease 추방 없이 신규 입장을 막고 자연 감소합니다. 실제 엔진 경로는 후속 연결 대상입니다. public disable의 새 join/send 차단 및 기존 read/leave 폐쇄 흐름도 엔진 소유 계약입니다.

## Private snapshot

인증 private TTL 기본24h/최대7d와 anonymous 기본1h/최대24h를 별도 schema로 구분합니다. persist retention 기본24h/최대7d이면서 retention<=room TTL입니다(초과422). memory room은 persist retention 필드를 사용하지 않습니다. 30days UI 시나리오는 production 허용 옵션이 아닙니다.

저장은 private+인증된 creator+DB account entitlement+owner risk ack+현재 persistenceAllowed를 함께 검사합니다. 미소비 invite/client entitlement는 근거가 아닙니다. mode/TTL/retention/저장/participant notice는 새 room snapshot이고 기존 memory→persist API는 없습니다. 현재 순수 checker 구현이 실제 anonymous 생성 승인/lifecycle/global active/저장 삭제의 완료를 뜻하지 않습니다.

## 작업량 예약

| kind | unit | UTC day | UTC month |
| --- | --- | ---: | ---: |
| admission_requests | count | 100000 | 3000000 |
| response_bytes | bytes | 3221225472 | 68719476736 |
| private_creates | count | 100 | 2000 |
| active_room_seconds | seconds | 144000 | 4320000 |
| persistent_write_bytes | bytes | 16777216 | 268435456 |
| email_attempts | count | 1000 | 10000 |

서버 reserve(operation_id,kind,amount)는 같은 transaction에서 UTC day/month를 모두 검사·증가합니다. 하나라도 실패하면 rollback, 같은 ID 내용 변경409, 월 경계 재시도 최초 창 유지, 만료 ID410입니다. window를 caller에게 받지 않고 실패/불확실 예약을 환불하지 않습니다. cap 축소는 기존 usage를 보존합니다. 실제 perform 전에 trusted enforcing path가 예약해야 하며 public body가 counters를 지정하지 않습니다. 현재 primitive와 fixture 검증은 완료했지만 전체 engine/OTP typed workload 경로 연결은 미완료입니다. UTC 창은 provider billing cycle과 다릅니다.

## Auth와 개인정보

초대 code 선검증 → browser-bound 증표 → signup flow → email 고정 → OTP 성공 transaction에서 초대/admission/session 일회 소비입니다. 기존 계정 signup은 초대를 소비하거나 entitlement를 더하지 않습니다. 이메일 응답은 계정 존재/가입 자격에 따라 바뀌지 않는 generic accepted이며 요청 예산은 모든 정규화 주소에 동일하게 적용합니다. 기존 flow/nonce/claim/browser와 max10분/min expiry/5오입력/새 요청 cooldown 계약을 유지합니다.

월cap 축소 뒤 이미 발급된 OTP/session/claim/기존 방을 막지 않고 새 send를 제한합니다. provider binding/From 미설정503이며 실제 발송은0입니다. 고정 subject, OTP body only, provider 원본 오류 비노출을 유지합니다. Cloudflare 발송 metadata31일과 Email preview 본문 보관을 구분합니다. 첫 실제 메일 전 preview OFF 직접 실측이 필요하며 현재 운영 값 미검증입니다. OFF가 기존 preview/metadata 즉시 삭제를 보장하지 않습니다.

## 이식과 통합

B async RepositoryPort는 targeted CRUD, control scope, 누적 transaction4096 records/8MiB, record64KiB/list1000 계약입니다. 총 DB4096행 제한이나 전체 snapshot 로딩으로 구현하지 않습니다. 신규 ControlPlane wrapper에 주입하며 기존 SQL IdentityRegistry state를 자동 변환하지 않습니다. SQLite/PG/CF 같은 domain을 사용하고 메일은 transaction 밖 한 번 호출합니다. selfhost backend는 한 번에 하나이며 설치/운영은 이번 검증 범위가 아닙니다.

서버15 runtime PASS/strict exit0와 기존WIP/미연결 범위는 [control-plane](control-plane.md)에 기록합니다. UI/C renderer 및 registry, production index/Env/bindings/OpenAPI, private lifecycle/anonymous ack, budget enforcing path와 최종 회귀는 root 통합 후 검증합니다.
