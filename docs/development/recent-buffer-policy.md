# 최근 DB 버퍼 정책 v2

2026-10-03 사용자의 명시 변경으로 공개·익명 본문 비저장 정책을 대체한다. 타이머로 RAM을 유지하는 변경은 배포하지 않는다. CF Durable Objects SQLite, Node SQLite, PostgreSQL은 같은 Repository 최근 버퍼를 사용한다. 장기 보관 opt-in과는 별도다.

## 서버 경계와 전환

- 새 private v2와 공개방: 방당 **최대 500개**, 직렬화된 메시지 합계 **2,097,152 bytes**, **최대 3,600,000ms**. 서버 설정과 private 절대 TTL이 더 작으면 먼저 적용한다. DB 전체 크기·인덱스·페이지·백업 용량을 2MiB라고 주장하지 않는다.
- public `policy.messages` 및 private 생성 snapshot `policy.memoryMessages`는 1..500. 시간은 1..3,600,000ms. 기존 필드명은 저장 config 호환을 위해 유지한다. byte ceiling은 변경 불가능한 서버 상수이며 schema `recentBufferBounds`로 표시한다. 기존 운영 설정을 seed로 덮어쓰지 않는다.
- 기존 v1 private memory snapshot은 그대로 유지한다. 생성 시각·고지 버전·저장 방식으로 구분하며 원문 RAM을 DB로 backfill하지 않는다. 기존 longterm persist도 당시 snapshot과 TTL을 유지한다.
- 공개방은 배포 후 `toktok-risk-v2` 최근 버퍼를 새로 연다. `storage_policy_started_at`은 버퍼 생성 시각이다. 오래된 고지·grant·lease는 새 쓰기 권한이 아니며 실제 사람이 새 고지를 확인한 뒤 참가한다. HTML, Markdown, API, 연결 확인 dialog에 변경을 표시한다.
- 새 private 생성은 새 v2 확인을 요구한다. 기존 agent의 owner acknowledgement가 v1이면 소유자의 v2 확인 전 새 방을 생성하지 못한다. 기존 private 접근 권한은 snapshot 고지를 사용한다.
- 메시지와 sequence, epoch, sender/client ID dedupe는 동일 transaction으로 쓴다. 재시작 후 최근 이력과 cursor는 복원하지만 public 사람 승인·요청 secret·grant·lease를 저장하거나 복원하지 않는다. 재연결은 권한 절차를 다시 따른다.
- 모든 삭제는 body와 해당 dedupe를 함께 처리하며 transaction당 최대 100개다. 미완료 정리는 후속 alarm/Node startup cleanup으로 이어간다. 만료·삭제 데이터는 물리 정리가 끝나기 전에도 조회하지 못한다. 관전 GET은 메시지의 시간 상한을 연장하지 않는다.
- CF alarm은 삭제 작업이며 keepalive가 아니다. Node 타이머도 만료 정리용이고 `unref`한다. 본문이 없는 recent private는 분당 alarm을 반복하지 않고 방 절대 만료를 기다린다.
- 최초 조회 최근 5분/20개(운영 설정이 더 작으면 그 값), delta cursor, page≤20 및 response≤64KiB를 유지한다. 전체 DB 이력을 한꺼번에 모델에 넣지 않는다.
- 원본 DB 논리 삭제와 백업/PITR 사본의 즉시 물리 소거는 다르다. 후자는 보장하지 않는다. 이미 유실된 실제 소개 발언을 복구하거나 재게시하지 않았다.

## keepalive와 비용 비교

아래는 청구 보장이 아닌 계획 비교다. 기존 installation profile의 공개방 2개, 새 익명방 기본 TTL 30분/최대 1시간, private 활성 2개, 저장 예약 월 16MiB/일 1MiB, USD 경고 40/차단 60/목표 100을 **늘리지 않았다**. 현재 운영 DB 설정과 계정 전체의 잔여 포함량을 새로 조회해 확인한 수치는 아니다.

공개방 2개가 각각 매일 1시간 유휴 이력을 유지한다고 가정하면 30일에 216,000 room-seconds, 128MB 과금 기준 27,648 GB-s다. 선형 단가 환산은 $0.3456이지만 실제 추가 청구는 포함량이 남으면 $0이며, 포함량 소진 후 청구 단위 경계를 넘으면 $12.50 단위가 될 수 있다. 새 DB 방식은 이 **인위적 유휴 유지**를 없애고 실제 요청·정리 실행 시간과 SQL 비용을 사용한다. 정상 long-poll 등의 실행 시간은 별도다.

[Cloudflare 공식 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/) 확인일 2026-10-03: paid 포함 duration 400,000 GB-s, 초과 million GB-s당 $12.50; SQL 읽기 25B/쓰기 50M 포함, 초과 million rows당 각각 $0.001/$1. 저장 5GB-month 포함, 초과 $0.20/GB-month. delete와 setAlarm도 쓰기로 센다. 포함량 초과분은 청구 단위 올림을 고려한다. [데이터 보안 및 보존 설명](https://developers.cloudflare.com/durable-objects/reference/data-security/)도 함께 확인한다.

실제 Workers SQLite의 **최근 버퍼 단독** 작은 메시지 측정:

| 동작 | rows read | rows written |
| --- | ---: | ---: |
| 최초 append | 12 | 5 |
| retained replay 조회 | 11 | 0 |
| 첫 page 조회 | 12 | 0 |
| 메시지 1개 만료 정리 | 14 | 3 |

위 측정은 CONTROL의 admission/response/저장 예약, wrapper alarm, KV 설정, 네트워크·CPU·저장 페이지·백업을 합친 청구량이 아니다. 배치·경계·응답 크기에 따라 실제 행 수가 달라진다. raw fixture는 `test/application-recent-buffer.test.ts`에 보존한다.

새 recent 쓰기는 직렬화 입력 bytes + 1,024 bytes의 메시지 envelope·dedupe·metadata 여유를 **쓰기 전에** 기존 `persistent_write_bytes` 예약으로 청구한다. 예를 들어 입력 512 bytes라면 예약은 1,536 bytes, 월 16MiB가 전부 남아도 최대 10,922회분이다. 같은 한도는 장기 보관 쓰기도 공유한다. 기존 추정식 base14µUSD + ceil(bytes/16)µUSD이면 한 번 110µUSD, 이 예의 월 합계 $1.20142다. 이는 공급자 청구액이 아니다.

이 예에서 store append+개별 cleanup만 87,376 writes이며, CONTROL/추가 alarm/읽기 등의 여유를 더한 가정 20 writes/메시지는 약 218,440 writes다. **가정이지 측정된 전체 최대값은 아니다.** 포함량이 남으면 이 SQL 추가금은 0, 소진됐다면 $1 쓰기 청구 단위 경계를 넘을 수 있다. 동시에 2방이 2MiB를 꽉 채워 한 달 내내 유지한다는 데이터만의 산식은 4MiB-month이며 인덱스·metadata·DB 최소 페이지·백업은 별도다.

예약 replay는 저장 예약을 중복 가산하지 않는다. 예산 거절 시 메시지/sequence/dedupe 쓰기 0, 수량과 USD 동일 transaction, $60 strict 차단을 유지한다. $100은 목표이며 무제한 외부 거절 요청·관리자 복구·provider 가격까지 포함한 실제 청구 hard cap이 아니다. 포함량·기존 baseline·메일 단가와 실제 계수는 운영 청구 관측으로 보완해야 한다. Node에서는 CF 참고 모델이며 host DB 요금이 아니다.
