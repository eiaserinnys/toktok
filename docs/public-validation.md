# 공개 엔진 검증 기록

대상은 `feat/public-memory-rooms`, 기준 `2f666d68`의 독립 엔진입니다. 운영 UI/라우팅/배포와 기존 전체 회귀는 이번 검증 범위가 아닙니다. 기존 전체 회귀는 최종 통합 CI 한 곳에서 수행합니다.

## 명령과 현재 결과

모든 무거운 명령은 eiaserinnys heavy runner, worker 1, 전용 TMPDIR로 실행합니다. 로컬 HTTP fixture는 port 18793, inspector 0, foreground child를 finally에서 회수합니다. account/DNS/production 설정은 변경하지 않습니다.

| Gate | 명령 | 현재 결과 |
| :-- | :-- | :-- |
| RED | `pnpm exec vitest run --config vitest.public.config.ts` | 11 failed; 최초 stub 기능 미구현, 나머지는 eviction fixture 미시작 오류 |
| runtime 1 | 같은 targeted 명령 | 180초 timeout; 판정 없음 |
| 보정 runtime | `--reporter=verbose` | 미소비 응답이 eviction을 붙잡아 30초 timeout 반복; 중단 |
| 최신 계약 runtime | 같은 verbose 명령 | 아래 5개 판정 통과, grant RPC 오류 1개 실패 후 중단 |
| root 허용 선택 runtime | `--testNamePattern="bounds grant\|enforces UTF8\|changes epoch\|batches reads\|reclaims silent\|replaces external\|provides bounded"` | **7 passed / 5 skipped**, 42.19초; 앞서 통과한 5개는 반복하지 않음 |
| tsc | `pnpm exec tsc --noEmit --project tsconfig.public.json` | **PASS, exit 0**; JSON-safe RPC 반환형 및 `runInDurableObject<DurableObject, void/record>`를 명시 |
| HTTP load | `node test/public-load.mjs` | **PASS**, 100+50, 30초 aligned burst 두 구간 |
| dry-run | `pnpm exec wrangler deploy --dry-run --config test/public-wrangler.jsonc --outdir <전용 TMPDIR>/dry-run` | **PASS, exit 0**, upload 34.36KiB / gzip 9.90KiB; 실제 배포 없음 |

runtime에서 allowlist/Origin/notice(46ms), 100 participant/50 watcher 및 중복 join(3982ms), leave/5분 만료(188ms), 30초 operator 재입장/strict room sliding window(995ms), 동시 post 순서/idempotency 및 빈 SQLite storage(702ms)를 확인했습니다. 같은 파일의 나머지 case는 이 수치만으로 통과라고 주장하지 않습니다.

grant/IP 발급한도 case는 RPC exception의 custom status를 보존하지 못해 429 대신 500을 반환했습니다. 예외 전파 대신 JSON-safe status/data/retry 반환 계약으로 고쳐 선택 runtime에서 확인했습니다. root가 허용한 추가 한 번은 body 소비/abort 회수와 두 participant 교대 fixture를 사용했으며 storage/eviction 제품 경로를 바꾸지 않았습니다. timeout을 통과로 해석하지 않습니다.

tsc는 최초 TextDecoder 필수 ignoreBOM 및 테스트 generic 추론에서 실패했고, 보정 중 실제 RPC `unknown` data가 Worker stub 타입에서 never로 변환되는 것도 확인했습니다. 최종 `PublicGrantResult`의 명시적 JSON union과 mutation void/observation record R를 사용한 검사가 exit 0입니다. strict 설정/ts-ignore를 쓰지 않았습니다. 이후 변경은 타입 선언, 문서, 동일 rawcase의 한 행씩 JSON 표기뿐이며 통과한 runtime/load/dry-run을 반복하지 않았습니다.

독립 단계 3 reviewer가 소유 파일을 읽고 심각한 요구 누락/보안/커서/회수 결함 없음으로 통과했습니다. reviewer는 테스트나 부하를 재실행하지 않았습니다. 운영 연결은 여전히 이 검수의 대상이 아닙니다.

## 요구와 검증 축

| 축 | 실제 사례 / 검증 표면 |
| :-- | :-- |
| 본문 보관 | SQLite-class DO 빈 KV/SQL/alarm, UTF-8/body byte/count/time, epoch reset/gap |
| 입장 | participant/watch overflow, 동일 join 재시도, IP/grant admission 및 map full |
| 활동/발언 | leave/idle, operator/IP/strict room, accepted만 cooldown, 동시 순서/동일 ID 충돌 |
| 읽기 | 초기 5분 tail, 실제 JSON 64KiB prefix/cursor, delta/empty timeout, 중복 wait/abort/25초 timeout/response buckets |
| HTTP 부하 | 100 participant+50 watcher, 독립 fixture IP, 30초마다 aligned 100명 발언, client-side Retry-After+jitter |

UTF-8/count/time/byte fixture는 서로 다른 IP의 participant 두 명이 15초마다 교대하여 각각 30초 발언 정책을 지키면서 총 101개를 만듭니다. 상태만 검사하는 response도 arrayBuffer로 소비합니다. abort용 직접 SELF.fetch가 Response를 반환하면 다음 reset 전에 body를 소비합니다. 제품 storage/eviction 경로를 테스트 편의로 바꾸지 않습니다.

## HTTP load와 측정 한계

`test/public-load.verdict.mjs`는 150wait/160handler/64KiB/strict 5개 sliding window/cleanup 위반을 synthetic mutation으로 검출합니다. 실제 load는 30초 aligned burst 두 구간을 한 실행군에서 측정합니다. 처음 100명이 동시에 시도하며 room 거절에 서버 `retry_after_ms`+jitter로 재시도합니다. 서버 자동 재전송은 없습니다. 모든 참가자의 같은 순간 발언 성공을 조건으로 삼지 않습니다.

rawcase는 status/accepted/error_code/retry_after_ms/cursor/page_count/JSON bytes만 저장합니다. 본문, Authorization, lease/grant secret, IP는 증거에 저장하지 않습니다. latency p50/p95는 request 시작부터 body 소비까지입니다. handler/wait 최대치, ring payload bytes 및 egress JSON을 DO 진단에서 가져옵니다. 진단 fixture RPC는 비용 추정 request rate에서 제외합니다.

실행 시각은 2026-10-02T13:09:15Z이며 [본문/secret 없는 rawcase](../test/public-load.result.json)에 원자료가 있습니다.

| 측정 | 첫 30초 | 둘째 30초 |
| :-- | --: | --: |
| 발언 수락 | 100 | 100 |
| 429 | 963 | 277 |
| 사용자 요청 (진단 제외) | 1963 | 1277 |
| 사용자 요청/초 | 65.43 | 42.57 |
| post p50 / p95 ms | 42.73 / 609.40 | 30.53 / 191.61 |
| read p50 / p95 ms | 1927.05 / 1997.92 | 1953.17 / 8024.29 |

관측된 max wait는 150, max handler는 160, max JSON page는 5,873바이트, max ring 직렬화 payload는 28,200바이트입니다. egress data JSON은 8,848,950바이트, 예상 밖 오류는 0입니다. leave 후 handler/wait/participant/watcher/timer는 모두 0이고 ring 100개/28,200바이트는 보관 중입니다. local process RSS 합계 최대 1,139,359,744바이트는 Wrangler/workerd 프로세스 측정값이며 실제 DO heap과 다릅니다.

Node fetch를 중단하고 클라이언트 loop가 끝난 직후에도 서버 진단에는 wait 150개가 남아 있었습니다. 명시 leave로 0을 확인했습니다. 즉 HTTP client abort 즉시 전파를 이 부하 결과만으로 주장하지 않습니다. 별도 runtime case는 Worker fetch→DO fetch signal 취소 및 25초 timeout 회수를 확인했습니다. idle/네트워크 환경 차이에 대한 경계입니다.

128MB 실제 DO heap은 측정하지 못합니다. ring의 직렬화 app payload bytes와 로컬 Wrangler/workerd 프로세스 합계 RSS를 분리합니다. RSS는 Cloudflare DO isolate heap이 아니며 로컬 통과가 Cloudflare 생산 성능 보장은 아닙니다. 종료 후 wait/handler/lease/timer는 0이어야 합니다. ring buffer는 정해진 retention 동안 남는 정상 상태이므로 cleanup에서 buffer 0이라고 주장하지 않습니다.

## 비용 계산 기준

확인일 2026-10-02의 [Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)은 계정 월 $5 Standard, 포함 10M requests/30M CPU-ms, 초과 $0.30/M requests와 $0.02/M CPU-ms입니다. HTTP 대기 wall time 자체는 Workers duration 과금 대상이 아닙니다. CPU는 실측하지 못하므로 계산 시 명시적인 1ms/request 가정을 사용합니다.

[DO 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/)은 포함 1M requests/400,000 GB-s, 초과 $0.15/M requests와 $12.50/M GB-s입니다. DO 메모리는 실제 사용량과 관계없이 128MB(0.128GB)로 계산하며 같은 DO의 동시 요청 duration은 겹쳐 한 번 계산합니다. HTTP longpoll은 활성 duration을 차지합니다. 청구 단위 올림은 계산표에 구분합니다. 계정 공유 포함분은 다른 서비스가 이미 소비했을 수 있습니다.

3방, 하루 H시간, 30일, 실측 사용자 request rate R/방/초를 사용하면 `N=R*3*H*3600*30`, CPU 가정 `N*1ms`, DO duration `D=0.128*3*H*3600*30 GB-s`입니다. 활성 요청 종료 뒤 플랫폼 idle tail은 이 식에 포함하지 않으며 배포/실운영 duration으로 보정해야 합니다. catalog 방 수가 증가하면 N/D는 선형 증가합니다. 계산은 포함분이 전부 남은 경우와 이미 소진된 경우를 따로 보여줍니다. 요청별 payload 요금이나 실제 CPU를 관측하지 않은 값을 측정값으로 부르지 않습니다.

실측 사용자 요청 3,240개/60초로 `R=54`입니다. 매번 입장/퇴장하는 setup 트래픽은 이 steady-state 근사에서 제외합니다. 첫 burst request rate가 더 높았으므로 실제 사용 패턴에 따라 달라집니다. DO 초과량은 공식 규칙대로 requests/GB-s 각각 1M 단위로 올림합니다. Workers CPU는 외부 Worker의 1ms 가정이며 실제 DO CPU 성능 측정값이 아닙니다.

| 3방·30일 | 사용자 requests | DO GB-s | Workers requests / CPU | DO requests / duration | 계정 월 $5 포함 합계 |
| :-- | --: | --: | :-- | :-- | --: |
| 하루 1시간, 포함분 남음 | 17,496,000 | 41,472 | $2.25 / $0.00 | $2.55 / $0.00 | **$9.80** |
| 하루 1시간, 포함분 소진 | 17,496,000 | 41,472 | $5.25 / $0.35 | $2.70 / $12.50 | **$25.80** |
| 하루 24시간, 포함분 남음 | 419,904,000 | 995,328 | $122.97 / $7.80 | $62.85 / $12.50 | **$211.12** |
| 하루 24시간, 포함분 소진 | 419,904,000 | 995,328 | $125.97 / $8.40 | $63.00 / $12.50 | **$214.87** |

$5 기본료는 계정당 한 번이며 이미 지불 중인 계정의 추가비용은 위 합계에서 $5를 빼면 됩니다. Free 계획의 계정 공유 100,000 requests/day로는 이 3방 부하(하루 1시간만으로도 583,200 사용자 requests/day)를 유지할 수 없습니다. 이 표는 실제 청구 보장이 아니라 관측 요청률과 CPU/duration 가정에 따른 계산입니다.

## 미실행 범위

production 배포/부하, browser UI, exact-Origin cookie/nonce 승인 경로, 운영 CF edge provenance, private 전환, 계정/이메일 인증 변경, 전체 기존 회귀를 실행하지 않았습니다. 후속 통합자가 이 경계를 연결하고 확인해야 합니다.
