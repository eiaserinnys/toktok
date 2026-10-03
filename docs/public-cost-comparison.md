# 공개방 비용과 전달 지연 비교

작은 데모와 최대 부하, 방 분할을 구분하는 로컬 관측/계산입니다. 생산 `PUBLIC_POLICY`의 2초 batch, participant cap 100, 30초 발언, strict 5/초, 20개/64KiB/cursor는 바꾸지 않았습니다. A~E 관측은 과거 실험을 보존하며, 최신 root 후보 quota와 실제 원자 장부 비용은 문서 마지막 절을 따릅니다. 운영 승인과 비용 상한 증명은 별도입니다. 기존 $5 계정 기본료를 제외한 추가비용을 먼저 제시하며 가격 상한이나 생산 성능을 보장하지 않습니다.

## 60초 관측

각 시나리오는 한 번만 실행했고 하니스 실패 보정은 사용하지 않았습니다. heavy runner timeout 180, 단일 fixture Worker, foreground Wrangler port 18793/inspector 0, 전용 TMPDIR를 사용했습니다. 서로 독립적인 fixture IP이며 실제 공유 NAT에서는 기존 입장/IP 제한이 적용됩니다.

| 시나리오 / seed | participant+watcher | 응답 후 agent/watcher idle 간격 | 사용자 요청/60초 | 발언 수락/예정 | 429 |
| :-- | --: | :-- | --: | :-- | --: |
| A / 26100201 | 100+50 | 2초 / 2초 | 2,940 | 200 / 200 | 490 |
| B / 26100202 | 100+50 | 5초 / 2초 | 2,543 | 199 / 200 | 494 |
| C / 26100203 | 100+50 | 10초 / 2초 | 2,460 | 199 / 200 | 511 |
| D / 26100204 | 2+0 | 5초 / 관전자 없음 | 14 | 4 / 4 | 0 |
| E / 26100205 | 10+10 | 5초 / 2초 | 272 | 20 / 20 | 2 |

A/B/C는 t=0/30초에 100명이 동시에 시도합니다. D/E는 각 participant가 30초 주기 안에 고르게 분산해 발언합니다. 초기 GET으로 비어 있는 cursor를 얻은 뒤 측정을 시작하므로 첫 window의 과거 메시지는 제외됩니다(실제 제외 0개). 여기서 cadence는 **응답 JSON 소비 후 다음 요청까지의 idle 시간**입니다. 서버 batch/longpoll 대기 시간이 더해져 실제 request 시작 간격과 같지 않습니다. `has_more`이면 agent 5/10초를 생략하고 2초 뒤 이어받습니다.

모든 새 시나리오는 같은 client_message_id로 한 send만 실행합니다. `max(Retry-After 초, retry_after_ms)` 이상 + `uniform[0,min(8000,1000*2^(연속429-1))]ms` jitter를 사용하며 수락 후 재전송하지 않습니다. wait도 한 client당 하나입니다. seed는 재현 입력이고 실제 scheduling/latency까지 동일하게 만드는 보장은 아닙니다. 기존 1,240건 429 실험은 작은 jitter, 다른 최소 retry/초기 cursor 정책이었으므로 같은 조건의 재실험이라고 부르지 않습니다.

B/C는 종료 경계 이후 재시도가 필요한 메시지 하나씩을 보내지 않았습니다. 이를 200개 성공으로 채우지 않았으며 수락된 199개의 본문 전달은 전부 관측했습니다. 60초 이후에는 새 발언을 시도하지 않습니다. 관측 회수/필요한 delta GET/퇴장을 최대 30초 안에서 별도로 기록하고 그 request starts를 60초 비용에 섞지 않습니다.

| 시나리오 | 새 메시지 전달 lag p50 / p95 / max | 실제 반영 수(수락×client) | 종료 뒤 반영 | 관측 회수 | timestamp 기반 최대 backlog |
| :-- | :-- | --: | --: | --: | --: |
| A | 2.192 / 3.991 / 4.060초 | 30,000 | 450 | 0.078초 | 2 |
| B | 3.123 / 5.820 / 9.737초 | 29,850 | 300 | 6.010초 | 10 |
| C | 4.739 / 11.083 / 13.833초 | 29,850 | 550 | 9.790초 | 36 |
| D | 1.541 / 5.544 / 5.544초 | 8 | 0 | 15.574초 | 0 |
| E | 3.518 / 5.806 / 6.981초 | 400 | 20 | 0.997초 | 0 |

lag는 로컬 같은 host의 server created_at→client JSON 소비/반영 시각입니다. 초기 과거 window는 포함하지 않습니다. remote clock 오차나 생산 latency를 측정한 값이 아닙니다. backlog는 소비 시각까지 수락된 sequence와 반환 cursor 차이로 재계산한 값이며 새 서버 카운터가 아닙니다. 모든 시나리오에서 관측 회수 후 수락된 메시지 미전달/sequence gap/reset은 0이었습니다. 종료 경계의 진행 wait는 A/B/C/D/E 각각 150/0/0/2/10개, 실제 취소는 모두 0개로 회수 완료했습니다.

빈 timeout과 nonempty 요청 지속시간은 메시지 전달 lag와 다릅니다. 측정 구간에서 시작한 nonempty 요청 p95는 A 2.061초, B 2.108초, C 2.113초, D 11.002초, E 2.008초입니다. D의 빈 timeout 2건 p95/max는 25.017초입니다. 다른 시나리오에는 빈 timeout 관측이 없어 0초 대신 미관측으로 기록했습니다. 기존 read 응답 p95 8.02초도 delivery lag가 아닙니다.

B의 read starts는 A보다 17.8% 적습니다(2,250→1,850). C는 B보다 5.4%만 더 줄였습니다(1,850→1,750). `has_more` catch-up이 작동하므로 idle 10초를 주었다고 요청이 절반으로 줄지 않습니다. C의 p95 11.083초/최대 13.833초 지연은 비용과 함께 root에 전달할 실제 결과이며 숫자를 낮추거나 운영 변경으로 연결하지 않았습니다.

rawcase에는 body/secret/IP가 없으며 label, status, error, sequence/cursor, timing/bytes만 남깁니다. [요약과 역할별 lag](../test/public-load.comparison-summary.json), [A](../test/public-load.compare-A.json), [B](../test/public-load.compare-B.json), [C](../test/public-load.compare-C.json), [D](../test/public-load.compare-D.json), [E](../test/public-load.compare-E.json)에서 재계산할 수 있습니다. 128MB DO heap은 미측정이며 local process RSS로 증명하지 않습니다.

## 전역 batch 처리량 계산

다음은 150 clients, 같은 평균 100/30=3.33messages/초, 각 균일 응답에 페이지 하나를 받는 계산입니다. 전역 5/10초 server batch를 실측하지 않았습니다. 실제 A/B/C는 server 2초 유지입니다.

| 균일 응답 간격 | read requests/초 | 20개 page의 client당 최대 처리량 | strict5/초 흐름에서 tick 사이 최대 유입 |
| --: | --: | --: | --: |
| 2초 | 75 | 10messages/초 | 10개 |
| 5초 | 30 | 4messages/초 | 25개 |
| 10초 | 15 | 2messages/초 | 50개 |

10초마다 한 페이지만 받는 안은 2<3.33으로 평균 유입도 따라가지 못해 제외합니다. 단순 평균 모델의 backlog 증가량은 1.33개/초이고 약 75초에 100개 보관 범위만큼 밀릴 수 있습니다. 이는 정확한 손실 시각 보장이 아닙니다. `has_more`에서도 10초 쉬면 해결되지 않습니다.

5초는 정상 20개 page에서는 평균을 처리하지만 최대 유입 25개/tick을 즉시 처리하지 못합니다. 실제 JSON 64KiB가 page 항목 수 q를 줄이면 처리량은 q/5이고 평균을 따라가려면 q≥17입니다. 그 이하이면 catch-up이 필요합니다. 문자열 escape/닉네임 등의 실제 JSON 크기를 사용하며 본문 2048byte×20만으로 판단하지 않습니다. ring은 100개까지만 보관하고 클라이언트 backlog를 별도 영구 queue에 저장하지 않으므로 더 오래 밀리면 gap입니다.

## 작은 데모와 idle 비용

[Workers 공식 가격](https://developers.cloudflare.com/workers/platform/pricing/)과 [DO 공식 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/), 확인일 2026-10-02를 사용합니다. CPU는 실측이 아닌 **Worker request당 1ms 가정**입니다. DO는 per-room 0.128GB×활성 wall time이며 실제 app heap이 작아도 동일합니다.

다음은 30일 동안 하루 해당 시간만 같은 활동률로 사용하고 나머지는 비접속/정상 퇴장하는 모델입니다. 기존 계정 $5는 이미 지불 중이므로 표에서 제외합니다. 시작 guide/승인 cookie bootstrap/setup, 생산 idle tail, 실제 CPU 변화는 별도입니다. 3방 450 lease 상시활성 최대 부하를 일반 작은 데모 가격이라고 부르지 않습니다.

| 활동 모델 | 하루 | 추가비용: 포함분 전부 남음 | 정확한 포함분 소진 경계 | 기존 DO 청구 단위 안 여유 예제 |
| :-- | --: | --: | --: | --: |
| D: 1방 2participant/0watcher | 1h | $0.00 | $12.66 | $0.0081 |
| D: 동일 | 4h | $0.00 | $12.68 | $0.0323 |
| E: 1방 10participant/10watcher | 1h | $0.00 | $12.81 | $0.1567 |
| E: 동일 | 4h | $0.15 | $13.43 | $0.9267 |
| A: 3방 최대 부하 | 1h / 24h | $4.01 / $187.98 | $19.98 / $191.73 | $7.33 / $191.58 |
| B: 3방 최대 부하 | 1h / 24h | $3.07 / $163.71 | $18.99 / $167.46 | $6.34 / $167.31 |
| C: 3방 최대 부하 | 1h / 24h | $2.94 / $158.62 | $18.85 / $162.37 | $6.20 / $162.22 |

정확한 소진 경계는 Worker requests=10M/CPU=30Mms, DO requests=1M/duration=400,000GB-s인 가정입니다. 여유 예제는 Worker 경계 그대로, DO requests=1.1M/duration=500,000GB-s여서 이미 청구된 첫 단위 안에 공간이 남은 가정입니다. **포함분 소진이 항상 duration $12.50 추가를 뜻하지 않습니다.** 실제 계정 baseline은 조회하지 않았습니다.

예를 들어 D/1h의 사용량은 Worker/DO 요청 각 25,200개, CPU 가정 25,200ms, DO 13,824GB-s입니다. 정확한 경계에서 추가 Worker requests $0.00756, CPU $0.000504, DO requests $0.15, duration $12.50입니다. 기존 첫 DO 청구 단위 여유에서는 두 DO 추가항목이 $0이고 합계 $0.008064입니다. 같은 활동인데 baseline에 따라 청구 차이가 큽니다.

D/E는 정상 leave 후 timer/wait/handler 0을 한 번 확인한 다음 DO를 계속 조회하지 않았습니다. local memory/RSS/대기 시간만으로 Cloudflare hibernation을 증명하지 않습니다. 사용 중에는 1초 진단 RPC를 샘플링했으며 그 트래픽은 비용 rate에서 제외했습니다. 계산에서는 사용 시간 전체의 DO 지속 활성 가정을 두었고 실측 과금 시간이 아닙니다. wait가 없는 client idle 틈은 eligibility에 따라 비과금일 수 있습니다. 소스의 timer는 wait 존재 때만 생기고 finally에서 사라지며, [공식 lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) 및 가격 문서의 idle/hibernation eligibility 조건으로 비접속 시간 duration=0을 가정했습니다. 남은 longpoll은 최대 25초 활성 시간이고 방당 하루 tail 추가량은 `0.128*25*30=96GB-s`입니다. calculator는 이 민감도를 별도 표시하며 24시간 상시활성과 혼동하지 않습니다.

## 동일 총수의 방 분할 모델

추가 10DO 실험은 하지 않았습니다. 총 participant100/watch50, 같은 30초 발언, B에서 관측한 역할별 read-rate/activity, CPU 1ms를 유지하고 발언을 고르게 분산해 retry 없는 수락률 100/30으로 고정한 **계산 모델**입니다. 실제 분할에서 burst/retry/empty timeout/has_more가 바뀌는 효과는 미측정입니다. 따라서 B의 burst 실측 비용과 같은 조건이라고 부르지 않습니다.

| 분할 | room당 유입 평균 | 총 전달 건/초 | 대표 본문 객체 payload/초 | 활성 DO duration 배수 |
| :-- | --: | --: | --: | --: |
| 1×100, watcher50 | 3.33 | 500 | 141,500byte | 1 |
| 5×20, watcher10씩 | 0.67 | 100 | 28,300byte | 5 |
| 10×10, watcher5씩 | 0.33 | 50 | 14,150byte | 10 |

대표 serialized 메시지는 B의 ring 28,300/100=283bytes로 계산했습니다. 실제 읽기 JSON에는 페이지 envelope/구분자도 있으며 calculator는 B의 대표 delta envelope와 read-rate를 함께 표시합니다. 메시지 delivery가 1/10이라고 요금도 1/10이 아닙니다. 이 모델의 총 Worker/DO requests는 동일하고 DO duration은 방 수에 따라 커집니다.

| 분할 / 포함분 남음 추가비용 | 하루1h | 하루4h | 하루24h |
| :-- | --: | --: | --: |
| 1×100 | $0.45 | $3.53 | $37.94 |
| 5×20 | $0.45 | $3.53 | $62.94 |
| 10×10 | $0.45 | $16.03 | $75.44 |

방 수가 적으면 활성 duration 비용이 작습니다. 주제방 분할은 방내 발언량/전달량과 무관한 대화 노출을 줄이는 context UX 차이가 있지만 가격 최소화와 같은 목적은 아닙니다. 10~20명 방이 가득 차면 다음 방을 안내하는 것은 제안이며 자동 방 확장/운영 cap 변경은 구현하지 않았습니다.

## 과거 DEMO proxy 계획: $34.26은 대체된 모델

사용자 14:26:36 확정으로 이전 DEMO all-body-nostore는 폐기합니다. DEMO=작은 익명 공개방+제한 익명 private 생성이며 public/anonymous private는 계속 memory only입니다. admin invite key로 초대+OTP 가입을 완료한 계정은 DEMO에서도 새 private room의 persist opt-in(default OFF)을 허용합니다. HOSTED=OTP 가입, 새 private room 생성 시 persist 선택 default OFF/retention 고지입니다. 서버는 mode 단독이 아닌 DB account entitlement+visibility+유효 creator 권한으로 검증하며 기존 memory room→persist는 불가하고 생성 시 retention/participant notice를 유지합니다. 모든 운영 옵션의 정본은 관리자 UI+DB revision이고 코드 catalog/count는 최초 seed이며 안전 상한은 유지합니다. 이 문서의 새 quota는 **root에 권고하는 초기 계산값**이고 제품 구현이나 운영 변경 승인이 아닙니다.

공개는 1방 10participant/10watcher, B처럼 응답 뒤 agent 5초/watcher 2초(`has_more` 2초)로 시작하는 안을 권고합니다. 계산용 사용시간은 하루 4시간입니다. 제한 private는 동시 2방, 일일 생성 20개, 만료 30분을 제안합니다. private는 별도 실측이 없어 D의 2participant request-rate를 proxy로 쓰며, 일일 private 최대 사용량은 20×0.5=10room-hours입니다. 본문 저장비 0은 **비저장 anonymous private 모델, 초대회원 opt-in 저장 비용 미포함**이라는 범위입니다. 최소 metadata/설정/예산 장부만 포함했으며 DEMO 영속 private의 row/storage/retention 비용은 quota/budget에 추가해야 할 후속 입력입니다. 30일 retention은 새 디자인 시나리오일 뿐 production retention 결정이 아닙니다.

같은 계정의 다른 서비스 포함분을 사용 가능하다고 가정하지 않습니다. 요청별 room DO 1회에 설정 조회/예산 예약 DO 호출 최대 2회를 더하고, 중앙 DO는 비용 계획상 24시간 활성으로 계산합니다(실측 아님). room 총 14room-hours/day, 중앙 24hours/day, Worker CPU 1ms/request 가정입니다. 설정과 예약을 한 RPC 또는 선예약 grant로 합치면 비용이 내려갈 수 있지만 그 최적화를 가격에 미리 반영하지 않았습니다.

| 월 모델 항목 | 사용량/가정 | 포함분 없이 추가비용 또는 계획 배정 |
| :-- | :-- | --: |
| Worker requests | 2,210,400 | $0.66312 |
| Worker CPU | 2,210,400ms 가정 | $0.044208 |
| room+설정/예약 DO requests | 6,631,200, 초과량 올림 | $1.05 |
| DO duration | room193,536+중앙331,776=525,312GB-s, 올림 | $12.50 |
| 기존 계정 기본료의 deployment 배정 | 기존 추가비용 계산에서는 제외했던 $5를 전체 목표에는 배정 | $5.00 |
| 이메일 | 월 OTP 최대1,000/일50 제안, 실제 provider 단가 미확인 | **$10.00 예산** |
| metadata/설정 장부 | SQLite DO 가격 proxy, 읽기4.42M/쓰기2.21M/0.01GB | **$5.00 예산** |
| 비저장 anonymous private 포함 기존 모델 합계 | 측정 proxy+CPU/활성시간 가정+고정 예산, 초대회원 opt-in 저장 비용 미포함 | **$34.26** |

metadata의 포함분 없는 산식은 약 $2.22로 $5 안에 두었습니다. 실제 DB/backend·row 동작이 다르면 다시 계산해야 합니다. 이메일 $10은 견적이 아니라 planning reserve이고 provider 기본료+월1,000회가 그 안에 들어가는지 확인해야 합니다. 맞지 않으면 OTP quota를 낮추고 원자 예약 단가를 바꿉니다. 이메일/metadata 비용을 검증됐다고 쓰지 않습니다.

월 목표 $100은 **toktok deployment 전체**이며 기존 계정 전체 목표나 실제 bill hard cap이 아닙니다. $34.26과 차액 약 $65.74는 초대회원 opt-in 저장 비용을 제외한 기존 모델 값이며 새 전체모드 가격이나 목표 충족을 뜻하지 않습니다. 더 일찍 경고 $25, 새 expensive work allowance cutoff $40을 제안합니다. 처음부터 기본료/이메일/metadata 예산 $20를 떼어 놓고 새 작업과 이미 수락한 작업의 비용을 예약합니다. 일일 expensive admission 100,000건을 별도 제안하며 같은 duration/3DO호출 가정과 CPU 10ms의 admission 모델은 월 $35.35지만 이 역시 초대회원 opt-in 저장 비용 미포함입니다. 이 10ms는 미확인 민감도 값이며 실제 runtime CPU 상한 설정을 구현하지 않았습니다. 영속 private 비용과 quota가 정해진 뒤 전체 목표와 cutoff를 다시 판단해야 합니다.

예산 정확성은 native rate limit에 맡기지 않습니다. [공식 Workers rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)은 per-location eventual이며 전역 정확 회계가 아닙니다. expensive room 호출/longpoll 등록/private 생성/email 발송 직전에 중앙 DO의 **원자 예약** 또는 그 DO가 원자 선예약한 **유한 grant**를 소진해야 합니다. 후속 control-plane 계약에는 다음을 포함합니다.

- settings revision에 결합한 request/CPU/DO request/활성시간/email/metadata 비용 단위를 예약합니다. 조회·예약 호출 자체의 비용도 배정합니다.
- 선예약 grant는 유한 요청 수와 만료, 단일 실행 소유자(room/epoch 등)에 결합합니다. 여러 Worker isolate가 같은 grant 잔량을 독립 소진하지 않습니다. 재시작에서 선예약을 자동 환급하거나 옛 grant를 재사용하지 않습니다.
- room 활성시간은 겹친 wait마다 128MB duration을 중복 청구하는 모델 대신, room별 funded 시간 구간을 원자 선예약합니다. 이미 수락한 최대25초 wait와 expiry 뒤 끝나는 작업까지 예약 구간으로 덮습니다. 소비 못한 grant/진행 작업의 여유도 cutoff 계산에 남깁니다.
- cutoff는 신규 expensive admission을 중단하되 이미 예약·수락한 작업의 응답/정리를 회수합니다. 이 제안은 아직 구현하지 않았으며 canonical schema/DB/controller는 별도 세션이 맡습니다.

[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)는 계정 전체의 정보 알림이고 usage를 멈추거나 제한하지 않습니다. 현재 페이지에 근거 없는 daily/previous-day 도착 시점을 약속하지 않습니다. toktok의 원자 장부/early cutoff와 계정 bill은 다른 표면입니다.

차단 응답도 Worker가 실행된 뒤면 요청/CPU 비용이 듭니다. 30일 동안 100개의 거절 Worker calls/초만 계속돼도 포함분 없는 requests 비용은 **$77.76**, CPU0.1ms 가정은 $0.5184가 추가됩니다. 그 거절 경로가 설정/예약 DO 2회를 계속 호출하면 DO requests 올림 비용도 최대 약 $77.85가 추가될 수 있고 metadata 조회도 별도입니다. central 24h duration 가정은 앞 표에 포함했지만 room DO까지 전달하면 그 비용도 늘어납니다. 1,000calls/초의 Worker requests만으로 $777.60입니다. 예산 초과 캐시/cheap 검사는 expensive work를 줄일 뿐 무한 Worker 호출을 앱 cap으로 봉쇄할 수 없습니다.

edge pre-Worker 통제가 이 잔여 위험을 줄일 수 있지만 root가 보고한 현 403/Free 제약 때문에 해당 zone/account 권한과 실제 실행 순서의 검증이 필요합니다. [공식 WAF rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)이 존재한다고 현재 배포에 설정할 수 있다고 주장하지 않습니다. 이번에는 보안 변경/구매/계정 조회/edge 부하를 하지 않았습니다. 따라서 $40 모델 cutoff와 $100 목표는 실제 무한 edge 폭주에도 통하는 청구 hard stop 보장이 아닙니다.

## 재현 가능한 계산기

```sh
# 저장된 60초 측정만 요약: 새 부하를 생성하지 않음
node test/public-load.analyse.mjs
# 네 청구 항목과 baseline 차이, 작은/최대/분할 모델 출력
node test/public-load.cost.mjs --cpu-ms=1
# 개인 계정 사용량 JSON을 사용하여 정확한 추가비용 계산
node test/public-load.cost.mjs --cpu-ms=1 --baseline=baseline.json --small-participants=8 --small-watchers=3
```

baseline JSON은 `worker_requests`, `worker_cpu_ms`, `do_requests`, `do_gb_s` 네 비음수 숫자입니다. 결과는 `charge(base+toktok)-charge(base)`로 계정 기본료 $5가 상쇄됩니다. Workers 요청/CPU는 포함분 초과량에 공식 rate를 적용하고 DO 요청/duration 초과량은 각각 1M 단위 올림합니다. 청구 단위 내 추가 duration=0/정확한 경계에서 $12.50 예제를 assertion으로 재현합니다.

[23개 상세 비용 rows](../test/public-load.cost.json)에 각 항목의 usage/추가요금, 포함분/baseline, 1h/4h/24h와 idle tail, 대표 payload가 있습니다. 2..10participant/0..10watcher의 혼합점은 E의 역할별 read-rate를 유지한 모델이며 실측 D/E와 구분했습니다. 실제 CPU/사용량/room 배치를 확정한 뒤 다시 계산해야 합니다.

## 과거 대표 adapter 행 계측: 실제 A 경로가 아닌 proxy

2026-10-03 승인된 CF SQLite fixture에서 native cursor.rowsRead/rowsWritten을 합산했습니다. 초기 schema apply는 제외하고 transaction의 marker 확인을 포함합니다. 대표 reservation(장부1개+receipt1개)은 읽기6/쓰기4, receipt cleanup은 읽기8/쓰기1이었습니다. 인덱스 행 동작도 runtime 계수에 포함되며 SQL/secret/body를 출력하지 않았습니다. **이것은 A SettingsStore 전체 예약 경로의 실측이 아닙니다.** persisted body/metadata/guard/alarm, 설정조회와 실제 dedupe cleanup을 따로 계측해야 합니다.

기존 모델의 요청당 쓰기1/metadata $5 예산은 새 원자 장부의 비용을 충분히 반영한 근거가 아닙니다. 이전 $34.26과 $40 cutoff는 재검토가 필요한 과거 proxy입니다. 이번 대표 reserve+cleanup pair만 월2,210,400회로 환산하면 읽기30,945,600/쓰기11,052,000이고 포함분 없이 row비는 $11.0829456입니다. admission과 response가 각각 한 pair라는 **민감도 가정**이면 두 배 $22.1658912이며 duration funding, private body/metadata/alarms와 실제 A 장부는 별도입니다. 이 값을 검증된 deployment 총액으로 더하거나 초기 운영 quota를 자동 변경하지 않습니다.

[공식 SQLite DO 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/)의 읽기25B/쓰기50M/5GB-month 포함분과 초과 읽기 $0.001/M, 쓰기 $1/M, 저장 $0.20/GB-month를 사용했습니다(확인2026-10-03). setAlarm과 delete도 쓰기에 포함됩니다. 다른 서비스가 포함분을 소비했는지는 미확인입니다. 아래 계산기는 대표 행 모델과 baseline 차이만 출력하며 기존 계산기의 Workers/DO requests·duration 청구 올림과 혼동하지 않습니다.

```sh
node test/selfhost-sql-cost.mjs --reserve-cleanup-pairs=2210400
node test/selfhost-sql-cost.mjs --reserve-cleanup-pairs=4420800 --baseline-reads=25000000000 --baseline-writes=50000000 --baseline-gb-month=5
```

core의 admission/response/write는 서로 다른 operation ID이며 0bytes 예약은 건너뜁니다. active_room_seconds는 instance별 request-driven60초 선예약으로 원자 장부에 추가 호출합니다. 실제 CONTROL factory/가격 revision/영속 private quota와 row 계측 이후 root가 전체 $100 목표와 early cutoff를 다시 결정해야 합니다. 무한 Worker 거절 트래픽은 앱 예약으로 청구 hard cap을 보장할 수 없습니다.


## 실제 ControlCore 원자 장부 반영: 최신 후보 profile

2026-10-03 root가 실제 `ControlCore`와 CF Repository를 격리 실행하여 받은 native cursor 합계를 반영합니다. B는 root artifact `20261003-control-budget-cost.json`의 1 PASS 요약과 integration `test/budget-cost-worker.ts`의 계측 경로를 읽었습니다. **artifact 자체에는 행 계수 payload가 없으며 아래 숫자는 root가 전달한 실행 관측입니다.** 비용 산식을 위한 새 runtime/부하/메일/사용자 DB/운영 변경은 하지 않았습니다. 앞의 $34.26/대표 adapter $5 장부 계획은 최신 권고로 사용하지 않습니다. A~E의 seeded 단일 관측과 B/C 199/200 결과는 그대로 보존합니다.

| 실제 native SQL 구간 | rowsRead | rowsWritten |
| :-- | --: | --: |
| 첫 admission 예약 | 17 | 8 |
| 첫 response 예약 | 19 | 8 |
| steady admission 예약 | 21 | 6 |
| 두 예약의 expiry cleanup | 24 | 4 |
| wrapper maintain | 19 | 0 |

보통 정상 요청의 admission+response 예약은 steady 12 written rows, 나중 cleanup은4 rows로 **16 SQL written rows/request**입니다. `setAlarm`은 이 SQL 계수 밖이며 공식 가격상 호출마다1 written row를 추가합니다. wrapper 유지, 설정조회, room metadata/body/dedupe/삭제·alarm, email/OTP도 공짜가 아닙니다. 이 native 한 사례가 모든 도메인·경합·실패·월 데이터 크기의 최대 비용을 증명하지 않습니다.

### 후보 설치 seed와 관계

아래는 root 재산출 후보이며 승인된 운영값 변경이 아닙니다. 코드 안전 상한을 낮추는 최초 seed이고 이후 정본은 관리자 설정 DB revision입니다. 서버 batch2초는 유지하며 agent5초/watcher2초는 B처럼 **응답 뒤 client delay**입니다.

| 후보 항목 | 값 |
| :-- | :-- |
| 공개방 | 2방, 각 participant10/watch10 |
| private 생성/동시 | global active2 / IP active2 / IP 시간3 / 일20 / 월500 |
| anonymous private TTL | 기본30분, 최대1시간 |
| 가입 계정 private TTL | 기본24시간, 최대7일, persist default OFF |
| admission_requests | 월1,000,000 / 일50,000 |
| response_bytes | 월16GiB / 일1GiB |
| active_room_seconds | 월1,500,000 / 일60,000 |
| persistent_write_bytes | 월16MiB / 일1MiB |
| 이메일 | 월1,000 / 일100 |

DEMO에서도 초대+OTP 가입 완료 계정의 새 private만 entitlement/creator 권한 검증 후 persist opt-in을 허용합니다. public/anonymous private는 memory only, 기존 memory→persist 불가입니다. 30일은 계산 기간이며 production retention 결정이 아닙니다. TTL은 계속 활성/예산 사용을 보장하는 시간과 다릅니다.

- 공개2방×하루4시간×30일은864,000 room-seconds입니다. private500개를 각각30분 활성화하면900,000을 더해 **1,764,000>월1,500,000**입니다. 60초 block의 미사용 여유와 처리 꼬리는 이 관계에 추가됩니다. 이 profile은 모든 개별 cap의 동시 소진 보장이 아니라 working-set cutoff입니다.
- authenticated private2방을24시간 계속 쓰면 월5,184,000 room-seconds입니다. 최대7일 TTL이어도 전역 funding 예산이 먼저 소진되면 새 read/send/wait는 닫힙니다.
- admission1M건에 response16GiB를 고르게 나누면 평균17,179.87bytes/응답입니다. 매번64KiB라면262,144회에서 byte cap이 먼저 닫힙니다. API별 quota를 독립 성능 보장처럼 표현하지 않습니다.
- IP당2개는 같은 NAT가 private global2개를 모두 쓸 수 있는 안전 기본값입니다. 다중 IP anonymous Sybil 완전 방지는 아닙니다.

### 재현 산식과 가정

[profile 계산기](../test/selfhost-profile-cost.mjs)는 [저장 JSON](../test/public-load.cost.profile.json)에 native 계수, 후보 cap, 계획 가정, 항목별 사용량과 baseline 차이를 보존합니다. 본문/secret/IP/account 데이터는 없습니다. 기존 부하를 반복하지 않고 순수 산식만 실행합니다.

`N=min(month admissions,30×day admissions)=1,000,000`입니다. persistent bytes는 본문만이 아니라 core가 저장하는 직렬화 메시지와 dedupe key를 함께 예약합니다. 가장 작은 ASCII 저장 메시지 형태는344bytes로 계산하여 `P<=floor(16MiB/344)=48,770`건을 느슨한 계산 상한으로 둡니다. 실제 nickname/text/sequence/escaping이 늘면 허용 건수는 줄어듭니다. metadata·별도 dedupe row·삭제는 bytes quota 자체에 모두 포함된다고 주장하지 않고 SQL 비용 항목으로 따로 계획합니다.

60초 room funding은 `F=1,500,000/60=25,000`회입니다. 모든 요청을 두 번 예약하는 가정에 persist write/P, funding/F, 생성500, 이메일1,000을 더해 총 예약 `O=2N+P+F+500+1000=2,075,270`회로 둡니다. 고유 reservation마다 expiry cleanup1회, normal request마다 config1회, private maintenance는2방×30일×24시간×분당1회=86,400회라는 **계획 가정**입니다. config cache/cleanup batch는 비용을 줄일 수 있고 재시작·오류·auth 추가 작업은 비용을 늘릴 수 있습니다.

root wrapper의 alarm도 core.maintain 뒤 schedule에서 다시 maintain하므로 cleanup 후19 read를 더 계획합니다. alarm 재설정/삭제에는 회당1 written row 여유를 추가하되 이는 native SQL 외 별도 가정입니다. SQL 읽기는 `O×(21 reserve+12 cleanup+19 wrapper+19 cleanup-wrapper)+30N config+100N private-read`입니다. 쓰기는 `O×(6 reserve+2 cleanup+1 setAlarm+1 cleanup-alarm여유)+N private-alarm+N config-alarm+10P body/dedupe/metadata/향후삭제+32,128 join+2,000 init/close+186 첫 day/month counter`로 계획합니다. native 실제 계수인 표와 그 밖의 config30/private-read100/post10/유지 alarm 수 가정은 구분합니다. 전체 auth/metadata/retention row 최대치는 미계측이므로 이 합계를 strict invoice upper bound라고 쓰지 않습니다.

| 월 사용량 항목 | 계산값 |
| :-- | --: |
| Worker requests | 1,000,000 |
| Worker CPU | 10,000,000ms: 요청당10ms 가정 |
| DO requests | 6,236,940: room/config/reserve/cleanup/maintenance 포함 |
| DO duration | 523,776GB-s: room funding1.5M초+Control24h×30일, actor128MB |
| SQLite read / written rows | 277,344,170 / 23,274,714 |
| SQLite live storage | 0.1GB-month: metadata/body/장부 계획값 |

Control의24시간 활성은 보수적인 계획 가정이며 hibernation 실측이 아닙니다. room funding도 실제 청구 duration과 동일한 계측이 아닙니다. Node registry는 제거된 유휴 room을 회수하고 전체100 core에서 새 생성을 제한합니다. CF는 별도 catalog 권한과 전역 funded duration 예산으로 제한하며 Node Map 상한을 CF actor 수 보장으로 바꾸지 않습니다. 비예약 cleanup·거절 응답·이미 수락한 작업의 회수 및 private KV bootstrap 비용에는 별도 headroom을 둡니다.

### 공식 단가와 baseline별 추가비용

[Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)과 [DO/SQLite 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/)을 2026-10-03 확인했습니다. Workers 포함 요청10M/CPU30Mms 뒤 $0.30/M요청/$0.02/Mms, DO 포함 요청1M/duration400kGB-s 뒤 $0.15/M/$12.50/MGB-s입니다. DO compute 초과량은 청구 단위 올림을 적용합니다. SQLite는 읽기25B/쓰기50M/5GB-month 포함 뒤 $0.001/M읽기/$1/M쓰기/$0.20/GB-month입니다.

| 비용 항목 | 포함분 정확히 소진 경계의 추가금 |
| :-- | --: |
| Worker requests / CPU | $0.30 / $0.20 |
| DO requests / duration | $1.05 / $12.50 |
| SQLite reads / writes / storage | $0.277344 / $23.274714 / $0.02 |
| 기존 계정 기본료 제외한 추가금 | **$37.62** |
| deployment 기본료 배정5 + email 계획10 + 미계측 auth/metadata/회수 여유10 | **$25.00 계획 배정** |
| 전체 계획 합계 / $100까지 모델 차액 | **$62.62 / $37.38** |

이메일$10과 미계측$10은 견적/검증된 최대가격이 아닌 planning reserve입니다. 제공자·고정요금·retry·저장량에 따라 부족할 수 있습니다. 기존 계정의 $5를 추가금에서는 빼고 deployment 전체 목표에는 배정했으며, 계정 다른 서비스 비용을 toktok 비용으로 합산하지 않았습니다.

| 계정 baseline 가정 | 기존 $5 제외 추가금 | 위 $25를 더한 계획 합계 |
| :-- | --: | --: |
| 포함분 전부 남음 | $13.40 | $38.40 |
| 각 포함분 정확히 소진 | $37.62 | $62.62 |
| DO 요청1.1M/duration500kGB-s: 기존 첫 청구단위 여유 | $24.97 | $49.97 |

계정 baseline은 조회하지 않았고 잔여 포함분을 보장하지 않습니다. `cost(base+toktok)-cost(base)`를 사용하므로 이미 초과 청구 단위에 여유가 있으면 추가 duration 비용은0일 수 있습니다. 소진하면 매번$12.50이 추가된다는 일반화는 틀립니다.

root integration WT에 현재 `limits.cpu_ms:10` 후보가 들어간 것을 소스 읽기로 확인했습니다. 운영 배포/실제 CPU10ms 소비 성공을 증명한 것은 아닙니다. 같은 N에서 CPU50ms 민감도는 정확소진 경계 전체계획$63.42이며, paid 기본30,000ms를 모두 소비한다는 극단 모델은 CPU항목만$600입니다. 따라서 CPU cap의 실제 적용·짧은 정상 처리 성공을 통합에서 확인해야 합니다. Node selfhost 호스트비용은 별도 cost profile이며 CF 달러단가를 자동 대입하지 않습니다.

### early cutoff 제안과 보장하지 못하는 비용

제안은 **deployment 전체 모델 warning$40 / 신규 expensive work cutoff$60**입니다. 기본료/email/미계측 회수 여유$25를 먼저 배정하고, 이미 수락한 최대25초 wait와 cleanup/거절에 $100까지 최소$40의 모델 headroom을 남기는 방향입니다. 후보 quota의 모두 소진 모델$62.62은 이 cutoff보다 높으므로 일부 작업이 먼저 닫힐 수 있습니다. 이 값은 root 결정 입력이며 관리자/DB settings/운영값을 변경하지 않았습니다.

현재 `budgetDecision`은 kind별 일/월 수량의 원자 cap을 판정합니다. **USD warning/cutoff 표시만으로 실제 가격 원자 예약이 집행되는 것은 아닙니다.** 가격 revision/baseline/이미 수락한 allowance와 후속 cleanup 비용을 금액으로 매핑하는 root 결정이 필요합니다. 정상 admission 자체는 expensive work 전에 원자 선예약하고, duration은 RAM funded_until의60초 block, response는 최종 실제bytes, persist는 DB body 쓰기 전 예약합니다. 유한 grant의 재시작 재사용/중복 소진은 금지하며 admission/response/write ID를 서로 분리합니다.

거절도 Worker 호출비용을 냅니다. accepted admission cap1M이 있어도 30일100거절req/sec는 Worker requests 비용만$77.76, CPU0.1ms 가정$0.5184를 더합니다. 위 $62.62 계획과 합치면 requests만으로$100을 넘으며 추가 Control/SQL 호출은 별도입니다. [native Workers rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)은 per-location eventual이므로 전역 정확 회계가 아니며 [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)도 정보 알림으로 사용량을 멈추지 않습니다. 알림 도착 시각의 근거 없는 정밀 약속은 하지 않습니다.

edge pre-Worker 봉쇄는 현재 root403/Free 제약 때문에 별도 검증이 필요합니다. 앱 cap은 무한 Worker 호출의 청구를 차단하지 못하므로 월$100은 deployment 목표이며 hard cap 보장이 아닙니다. 새 구매/보안/Cloudflare 변경/edge 부하를 하지 않았습니다.

```sh
# 새 부하 없이 최신 actual ControlCore 계수와 계획 가정 재계산
node test/selfhost-profile-cost.mjs --cpu-ms=10
# SQL 포함분까지 포함한 실제 baseline 차이; 비밀없는 숫자 JSON만 입력
node test/selfhost-profile-cost.mjs --cpu-ms=10 --baseline=baseline.json
```

baseline은 `worker_requests, worker_cpu_ms, do_requests, do_gb_s, sql_reads, sql_writes, sql_gb_month`의 비음수 숫자입니다. 계정 credential/SQL/본문을 넣지 않습니다. 설치 seed/운영 cutoff/메일가격/실제 CPU·persist row계측은 root 후속 입력이며 문서 저장을 기능 완료나 $100 목표 달성으로 보고하지 않습니다.
