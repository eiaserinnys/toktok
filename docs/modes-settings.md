# DEMO/HOSTED 설정 계약

2026-10-02 root 확정 계약입니다. 기존 팀 allowlist 전용 출시와 익명 private 검토 대기 정책을 대체합니다. 현재 소스 구현은 기존 OTP WIP이며 아래 DB 설정·관리자 API·가입 초대·엔진 연결은 아직 미구현입니다. Cloudflare 배포는 유지하고 self-host SQLite 기본/기존 PostgreSQL DSN 설치 지원은 별도 adapter 설계를 기다립니다.

## 모드와 가입

| 항목 | DEMO | HOSTED |
| --- | --- | --- |
| 방문자 | 작은 익명 공개방 및 제한된 익명 private 생성 | 정책에 따른 서비스 이용 |
| 기본 공개 가입 | 허용하지 않습니다. | open signup을 명시 설정할 수 있습니다. |
| 가입 초대 | 관리자 일회 invite 소지자가 email OTP로 가입할 수 있습니다. | closed/invite/open을 명시 설정합니다. |
| 대화 본문 저장 | 모든 대화 body memory only이며 가입자도 저장할 수 없습니다. | 방 생성 때 optional persist, 기본 OFF이며 retention과 participant 고지가 필요합니다. |

실제 첫 seed는 demo·invite·deployment.enabled=false입니다. 익명 private 연결은 아직 닫습니다. 모드 변경이 signup이나 persistence를 자동 완화하지 않으며 같은 revision payload에 명시해야 합니다. client mode flag는 권한 근거가 아닙니다. DEMO에서 open signup, persistenceAllowed=true, defaultPersist=true를 거부합니다. HOSTED라도 defaultPersist는 명시 설정의 기본 OFF를 따릅니다.

## Schema와 seed

모든 숫자·boolean·enum·목록은 label/unit/min/max/applyTo metadata를 가져 관리자 UI와 서버가 같은 schema를 사용합니다. 알 수 없는 키와 비정수·범위 밖 값, 교차 필드 모순은 거부합니다. bootstrap email·provider credential·EMAIL_FROM은 infra 입력이며 schema에 포함하지 않습니다. 아래 값은 최초 DB 생성 seed만 의미하며 저장된 설정을 덮지 않습니다.

| 구역 | 필드와 최초 값 |
| --- | --- |
| deployment | mode=demo, enabled=false |
| signup | policy=invite; enum closed/invite/open |
| public.catalog | common-room/함께 이야기, workshop/작업 이야기, quiet-corner/조용한 이야기의 초기 3개 |
| private | anonymousEnabled=false, createPerIpHour=3, activePerIp=3, activeGlobal=10, dailyCreates=100, defaultTtlSeconds=3600, maxTtlSeconds=86400, persistenceAllowed=false, defaultPersist=false, defaultRetentionSeconds=86400, maxRetentionSeconds=604800 |
| identity | email 2/hour·3/day·120초, IP 30/hour·100/day, UTC month 10000, OTP lifetime 최대600초/attempts 최대5, flow TTL 고정 최대600초, session TTL 기본43200초, invitation TTL 기본604800초/최대2592000초 |
| budget | targetUsd=100, warningUsd=50, cutoffUsd=70; UTC calendar month; workload cap 목록=[]; 신뢰된 서버 readiness=false |

private 생성 cap과 금액은 root 임시 코드 seed이며 비용 산출 뒤 실제 release 값이 확정됩니다. 금액은 Cloudflare 청구 상한 보장이 아닙니다. workload cap 빈 목록은 무제한이나 검증 완료를 뜻하지 않습니다. root가 확정한 typed cap와 실제 enforcing path가 연결되기 전에는 활성화를 거부합니다. readiness를 admin이 true로 바꾸는 옵션은 없습니다.

catalog 길이는 0..10, slug는 고유한 안전 URL 형식, title은 최대64자로 제한합니다. public room count는 enabled catalog 수에서 유도하며 별도 count 값을 두지 않습니다. catalog 최초 enabled 설정과 runtime 활성화는 서비스 enabled 및 후속 engine wiring을 함께 따릅니다.

## public policy seed와 안전 경계

기준은 공개 엔진의 `d230fbe:src/public-contracts.ts` PublicPolicy 실물입니다. 다른 워크트리는 읽기만 했으며 아래 값을 임의로 줄이거나 늘리지 않았습니다.

| Policy | 최초 값 |
| --- | --- |
| messages / retentionMs / textBytes / jsonBytes | 100 / 3600000 / 2048 / 8192 |
| participants / watchers / leaseMs / grantMs | 100 / 50 / 300000 / 300000 |
| ipParticipants / ipWatchers / grantAdmissions / admissionWindowMs | 5 / 5 / 5 / 60000 |
| pendingGrants / ipKeys / ipMemoryMs | 1000 / 2048 / 300000 |
| operatorIntervalMs / ipIntervalMs / roomMessages / roomWindowMs | 30000 / 1000 / 5 / 1000 |
| batchMs / waitMs / handlers / waits / pageSize | 2000 / 25000 / 160 / 150 / 20 |
| responseBytes / responsesPerSecond / responseBurst | 65536 / 75 / 150 |
| bytesPerSecond / byteBurst | 4194304 / 8388608 |
| requestPerSecond / requestBurst / ipRequestsPerSecond / ipRequestBurst / bodyMs | 300 / 320 / 30 / 60 / 5000 |

first-window 기본300초, page 기본20, agent 권장 읽기 cadence5초, browser cadence2초, server batch2초를 서로 다른 옵션으로 둡니다. lease/grant 기본과 최대는300초입니다. hard bounds는 엔진 검증 범위를 넘지 않습니다: participant100/watch50/messages100/1시간/text2048bytes/page64KiB/wait150/handler160/wait25초/room5 per1초/operator 최소30초. throttle을 0/off/무제한으로 설정하는 경로는 없습니다. 명시되지 않은 추가 안전 범위나 workload cap 항목은 root 확인 없이 발명하지 않습니다.

추측 불가능한 token 크기, CSRF, DB role authz, TLS, 비밀·payload 로그 금지는 UI toggle이 아닌 불변 조건입니다.

## 저장 방식과 적용 시점

rate/cap/catalog 활성·disabled 변경은 후속 runtime의 policy revision 갱신 뒤 적용하며 갱신 지연 상한은10초입니다. 이번 control-plane 계약만으로 실제 엔진 enforcement를 구현했다고 쓰지 않습니다. capacity 축소는 기존 lease를 추방하지 않고 자연 감소할 때까지 신규 입장을 거부합니다.

방의 mode/저장 방식/retention/절대 TTL은 생성 시 불변 snapshot입니다. 기존 memory 방을 persist로 전환하는 API는 없습니다. 모드 변경은 신뢰된 lifecycle readiness=true와 active private rooms=0을 요구합니다. 초기 readiness=false에서는 모드 전환을 차단합니다. 일반 settings PUT은 active_count/readiness를 쓸 수 없습니다.

public disable은 새 join/send를 차단하고 기존 read/leave는 고지된 폐쇄 흐름에서 처리하는 후속 엔진 계약입니다. 지금 disable 동작·capacity drain·비공개 저장/삭제를 실측 완료했다고 주장하지 않습니다. Cloudflare/self-host에서도 같은 계약을 유지하며 DB별 실제 물리 삭제·백업 보관 보장은 승인된 운영 근거 없이 단정하지 않습니다.

## OTP와 admission 설정

이메일 소유 확인과 가입 자격, agent 명시 승인과 위험 확인은 분리합니다. DB admitted member는 invite 정책에서도 새 invite 없이 로그인하며 유효 session은 추가 claim/방 생성에서 메일을 다시 보내지 않습니다. 신규 invite 소비와 OTP 성공은 같은 transaction에서 처리합니다. session·creator 판단도 DB admission/settings를 재평가합니다. env team allowlist를 별도 정본으로 남기지 않습니다.

관리자는 email/IP 제한을 안전 범위 내에서 조정할 수 있습니다. 월 최대10000, OTP 최대600초, 오입력 최대5는 유지합니다. cap을 이미 소비한 값보다 줄여도 기존 OTP 검증/session/claim/방을 차단하지 않고 새 send만 거부합니다. UTC 고정 창은 provider billing cycle과 같은 것으로 주장하지 않습니다.

Cloudflare metadata31일 보관과 Email preview 본문 보관을 구분해 고지합니다. 첫 실제 메일 이전 preview OFF 직접 검증이 필요하며 현재 운영 확인·binding·메일 전송은 하지 않았습니다. 기존 subject 일반 고정문구/OTP body only/provider 원본 오류 비노출 계약을 유지합니다.
