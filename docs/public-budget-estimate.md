# 원자 예약용 Cloudflare 참고 추정 모델

USD warning/cutoff를 수량 예약과 같은 transaction에서 집행하기 위한 root/A 구현 입력입니다. 이 문서와 숫자 fixture는 제품 장부를 구현하지 않습니다. 포함분 잔여는0으로 가정하며 실제 invoice 회계, Cloudflare billing hard cap 또는 selfhost 호스트 가격이 아닙니다. warning$40/cutoff$60/target$100은 초기 seed 후보입니다.

## 값과 누적식

| 항목 | microUSD 정수 | 의미 |
| :-- | --: | :-- |
| UTC 월 fixed reserve | 25,000,000 | 첫 신규 성공 예약 때 한 번 배정합니다. |
| 신규 성공 reservation 기본값 | 14 | CONTROL/SQL/정리 비용의 계획값입니다. |
| admission_requests | 3 × amount | 요청/CPU/room·config 호출 계획값입니다. |
| response_bytes | ceil(amount / 65536) | 응답 처리 여유이며 Cloudflare egress 단가가 아닙니다. |
| active_room_seconds | 2 × amount | 128MB actor의 선예약 초입니다. |
| persistent_write_bytes | ceil(amount / 16) | body/dedupe 쓰기·정리·보관 여유입니다. |
| email_attempts | 10,000 × amount | 제공자 미확정 $0.01/회 계획값입니다. |

`delta = 14 + kindWeight(amount)`이며 성공한 신규 예약만 누적합니다. amount는 양의 정수이고 204/0byte 응답은 core에서 예약을 생략합니다. admission/response/persist/duration은 각각 고유 서버 ID이며 같은 개별 예약의 재시도만 같은 ID입니다.

receipt에 최초 amount/kind/price_revision/UTC period/charge를 보존합니다. 동일 성공 receipt replay는 추가0이며 설정이나 달이 바뀌어도 다시 과금·새 월 fixed 배정하지 않습니다. 다른 kind/amount는409, 만료 ID는 기존 계약대로 거절합니다. 일 수량·월 수량·일 variable microUSD·월 fixed+variable microUSD와 receipt를 같은 원자 transaction에서 판정·기록하며 감소/refund하지 않습니다. 월 fixed를 매일 넣지 않습니다. 이 모델의 세부 테이블/설정 schema와 구현은 A/root 소유입니다.

**모든 kind에 같은 cutoff를 적용합니다.** response를 면제하거나 parent-linked completion grant를 추가하지 않습니다. cutoff 직전에 수락한 작업도 최종 response 예약 실패로 성공 응답을 받지 못할 수 있습니다. 생성 결과 유실은 raw cap을 DB에 저장하지 않는 기존409 CREATE_RESULT_NOT_RECOVERABLE/room_id 계약, 메시지는 동일 client_message_id 및 전달 cursor로 재연결하는 계약을 유지합니다. 서버 자동 재전송은 없습니다.

## 요율의 근거와 미측정 부분

가격 확인일은2026-10-03입니다. [Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)은 요청 $0.30/M, CPU $0.02/M ms이며, [DO 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/)은 요청 $0.15/M, duration $12.50/M GB-s, SQLite 쓰기 $1/M rows·읽기 $0.001/M rows입니다. 여기서는 계정 공유 포함분을 공제하지 않습니다.

root의 실제 ControlCore+CFRepository selected 계수는 steady reserve21 read/6 written, 2예약 cleanup24 read/4 written, wrapper maintain19 read/0 written입니다. alarm의 setAlarm은 SQL 밖 별도 written1입니다. 기존 비용 fixture의 한 cleanup/alarm씩 귀속 가정으로 reservation당 read71/written10, DO2호출을 계획했습니다. USD 장부 추가 read/write는 아직 native 계측하지 않았습니다.

base14µ는 SQL written10µ + read0.071µ + DO0.30µ + 새 USD 장부 write2µ 가정 + 여유1.629µ입니다. cleanup마다 별도 Worker 요청을 추가하지 않는 현재 wrapper 구조를 가정하며, 후속 실제 SQL 변경이 있으면 계수를 갱신해야 합니다. 14µ가 모든 악의적/실패 경로의 측정된 최대가격이라는 뜻은 아닙니다.

admission3µ는 Worker request0.30µ + CPU10ms 가정0.20µ + room/config DO0.30µ + config/private read130rows0.13µ + room/config alarm2µ =2.93µ를 올린 값입니다. 실제 CPU와 actor residency는 미측정이며 root의 runtime cap 적용 확인이 필요합니다. 1초 duration은0.128GB × $12.50/M =1.6µ에 여유를 더해2µ로 잡았습니다.

persist16bytes당1µ는 현재 최소344bytes stored message와 body/dedupe 쓰기+eventual cleanup10rows 계획의 약0.0291µ/byte보다 높은0.0625µ/byte입니다. metadata join/init와 USD 장부의 새 writes, retention storage와 큰/작은 record 분포는 완전 실측이 아니며 fixed/headroom에 일부 배정합니다. 제공자 email 고정료·실제 발송 단가·메일 retention은 미확정입니다. email0.01을 검증된 제공자 가격으로 쓰지 않습니다.

## 월 fixed와 남은 headroom

| fixed 배정 | USD |
| :-- | --: |
| deployment 기본료 배정 | 5.0000 |
| 중앙 DO 최대31일 상시 활성의 linear duration 가정 | 4.28544 |
| DO duration 청구단위 올림 여유 | 12.5000 |
| DO request 청구단위 올림 여유 | 0.1500 |
| 초기 장부·cleanup·관리자 복구·미측정 여유 | 3.06456 |
| 합계 | 25.0000 |

UTC month의31일도 fixed 안에 계획하며, 아래 trial 비교는 기존과 같은30일 투영입니다. DO duration 올림 여유는 linear 계획 위에 배정하는 보수적 값이며 invoice를 그대로 복제하지 않습니다. 실제 baseline이 이미 초과 청구단위 중간이면 추가 청구0인 경우도 있습니다. 이전 비용 문서의 $25(기본료5+email10+미측정10)와 이 fixed25는 구성과 쓰임이 다릅니다. 이메일은 이제 kind weight로 별도 누적합니다.

cutoff60까지는 fixed 뒤 variable35가 남고 target100과의 차이40은 이미 admitted 작업·거절 Worker·설정조회·관리자 복구·미측정 비용을 위한 계획 여유입니다. strict cutoff가 이 경로의 실제 청구를 모두 막지는 못합니다. [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)는 정보 알림이며 사용량 제한이 아니고, native per-location eventual rate limit도 전역 원자 회계가 아닙니다. edge pre-Worker 제어의 현403/Free 제약은 별도 검증이 필요합니다.

## 작은 데모와 quota 충돌

기존 D/E 단일 seeded 60초 측정의 요청수를 재사용한 계산이며 새 부하는 실행하지 않았습니다. 모든 측정 요청을 보수적으로 admitted로 취급하고 응답당64KiB 이하1µ, 하루한번 종료 꼬리의 추가60초 funding block까지 배정했습니다. server2초 batch와 B의 response 뒤 agent5초/watcher2초 delay 조건입니다. 60초 trial의 rate가 매일 동일하다는 가정이며 운영 월 관측 결과가 아닙니다.

| 1방 모델 | 하루 활성 | 월 요청 가정 | 추정 USD | 판정 |
| :-- | --: | --: | --: | :-- |
| D: participant2/watch0 | 1h | 25,200 | 26.051620 | warning/cutoff 아래입니다. |
| D: participant2/watch0 | 4h | 100,800 | 29.194420 | warning/cutoff 아래입니다. |
| E: participant10/watch10 | 1h | 489,600 | 40.912420 | warning을 넘지만 cutoff 아래입니다. |
| E: participant10/watch10 | 4h | 1,958,400 | 88.637620 | 요청 quota1M과 USD cutoff를 먼저 넘습니다. |

E4h는 지원 보장/정상 완료 가격이 아닙니다. 요청만1M으로 잘리고 활성 funding은 보수적으로4h를 그대로 두면57.968820 모델이며 email/persist 등 추가 사용이 더해집니다. participant2~10의 작은1h 데모가 즉시 cutoff되는 모델은 아니지만 4h상시 watcher와 발언·읽기율이 높아지면 먼저 닫힐 수 있습니다. topic UX와 최대 부하를 작은 일반 데모의 가격으로 혼동하지 않습니다.

기존 후보 수량cap을 독립적으로 모두 대입한 느슨한 모델은72.152626입니다. 이 값은 fixed25 + base29.053780 + admission3.001500 + response1 + active3 + persist1.097346 + email10입니다. 그 전에 USD60으로 닫히므로 모든 수량cap의 동시 소진을 약속하지 않습니다. public2방 각4h/day864k room-seconds와 anonymous500방 각30m900k의 합1.764M도 월 duration1.5M을 넘습니다. authenticated private2개를 항상24h 유지하면5.184M으로 더 넘습니다. 이 cutoff의 목적은 working set 비용을 일찍 제한하는 것이며 개별 cap이 모두 독립 보장이라는 뜻이 아닙니다.

## 재현과 구현 경계

`node test/selfhost-budget-estimate.mjs`는 저장된 cost profile의 계수와 위 정수 요율로 `test/public-load.budget-estimate.json`을 재생성합니다. body/secret/IP/계정 정보는 입력·출력에 없습니다. 이 파일은 fixture이며 production import하지 않습니다. 예시 비용과 실제 invoice의 차이는 [현재 비용 비교](public-cost-comparison.md)에 baseline별로 분리합니다.

source의 USD 장부, 관리자 UI, 운영 설정, billing·provider·메일·새 부하 실행은0건입니다. Node SQLite/PG selfhost에서는 같은 앱 추정 cutoff를 사용할 수 있어도 호스트/DB/SMTP 비용은 별도 cost profile입니다. Cloudflare 단가를 자체 설치 invoice로 자동 대입하지 않습니다.
