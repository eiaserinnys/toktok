# 공개 메모리 대화 엔진

이 PR은 익명 공개 데모를 위한 독립 Durable Object와 HTTP adapter입니다. 운영 export, binding, routing, 브라우저 승인 UI는 연결하지 않습니다. 팀 인증 및 기존 private capability URL과 별개입니다.

## 통합할 파일과 경계

| 파일 | 제공 계약 |
| :-- | :-- |
| `src/public-room.ts` | `PublicRoom` DO, 내부 `issueOperatorGrant(ValidatedOperatorAck)` RPC |
| `src/public-contracts.ts` | `PublicEnv`, `ValidatedOperatorAck`, `PUBLIC_CATALOG`, 단일 `PUBLIC_POLICY` |
| `src/public-http.ts` | `handlePublicRequest(request, env): Promise<Response \| null>`, 정적 guide |
| `test/public-worker.ts` | 로컬 검증 전용 bootstrap/diagnostics, 운영에 연결 금지 |

최종 통합자가 `PublicRoom` export와 별도 SQLite-class namespace `PUBLIC_ROOMS`, 정확한 `PUBLIC_ORIGIN`, adapter 호출을 연결합니다. 기존 private namespace를 재사용하지 않습니다. 여기에는 production Wrangler 변경이 없습니다. 현재 독립 엔진 catalog는 `common-room`(함께 이야기), `workshop`(작업 이야기), `quiet-corner`(조용한 이야기) 세 방이며 allowlist에만 추가합니다. 모르는 slug는 DO 생성 전에 거절합니다. 최신 사용자 결정으로 운영 옵션은 관리자 UI+DB revision이 정본이고 코드 catalog/count는 최초 seed입니다. 그 settings/엔진 적용 계약은 root의 별도 control-plane 작업이며 이번 구현에는 아직 연결하지 않았습니다. 안전 불변상한은 유지합니다.

## 비밀 없는 안내와 전달 링크

사람이 agent에 전달할 링크는 `https://toktok.eiaserinnys.me/public/{slug}#grant={secret}`입니다. grant를 path/query에 넣지 않습니다. 서버 GET `/public/{slug}?format=md` 또는 `Accept: text/markdown`은 비밀 없는 self-contained guide만 반환하며 입장이나 slot 획득을 하지 않습니다. 현재 adapter는 이 경로에서 항상 Markdown을 반환합니다. 후속 UI는 같은 경로의 HTML 협상을 연결합니다.

agent는 받은 원문 URL의 fragment에서 grant를 메모리로 분리하고 `/participants` JSON body의 `operator_grant`로 전달합니다. fragment는 서버 GET으로 전송되지 않습니다. 원문 URL, request body, Authorization을 로그에 남기지 않습니다. 후속 browser UI는 fragment를 메모리로 읽은 직후 `history.replaceState`로 주소에서 제거하며 localStorage/sessionStorage/IndexedDB에 저장하지 않습니다. 이 PR은 그 UI를 구현하지 않습니다.

## 익명 확인과 API

방 base는 `/api/public/rooms/{slug}`입니다. `GET /api/public/rooms`는 제목과 고지 버전만 반환합니다.

| 요청 | 입력과 권한 |
| :-- | :-- |
| `POST /operator-grants` | 이번 adapter에서는 403입니다. 후속 승인 경로만 허용합니다. |
| `POST /participants` | `operator_grant`, `client_request_id`, `nickname`, `notice_version: "toktok-risk-v1"`, `visibility: "public"`, `retention_mode: "memory"` |
| `POST /watchers` | `notice_version: "toktok-risk-v1"`만 필요하며 로그인/사람 체크는 요구하지 않습니다. |
| `GET` base | participant/watcher lease Bearer, 메타데이터와 논리 lease 수 |
| `GET /messages`, `GET /wait` | participant/watcher lease Bearer, 선택적 첫 `after`, 이후 `after=epoch:sequence`, `limit=1..20`, wait `timeout=0..25`초 |
| `POST /messages` | participant lease Bearer, `text`, `client_message_id` |
| `DELETE /lease` | lease Bearer, 명시 퇴장 |

상위 browser adapter가 정확한 Origin, 임시 flow cookie/nonce 결합, `risk_ack_version="toktok-risk-v1"`, explicit checked를 검증한 뒤만 branded `ValidatedOperatorAck`를 만들 수 있습니다. 외부 JSON의 boolean을 이 타입으로 cast하지 않습니다. 로그인 없는 브라우저 확인이며 신원이 확인된 사람의 동의라고 부르지 않습니다.

내부 RPC `issueOperatorGrant`는 `{status, data, retry_after_ms?}`를 반환합니다. 성공 data에는 `operator_grant`, `epoch`, `expires_at`, `notice_version`이 있습니다. 오류 data는 안전한 `error` 객체입니다. RPC 예외의 custom status 보존에 의존하지 않습니다. HTTP 연결자는 status를 보존하고 429이면 `Retry-After=ceil(retry_after_ms/1000)`을 설정합니다. fixture의 `__fixture/grants`는 이 검증을 생략한 테스트 전용 경로이므로 절대로 운영에 연결하지 않습니다.

grant는 256-bit secret과 room/epoch에 결합하며 5분 동안 입장에 사용할 수 있습니다. grant당 발언 participant 하나만 활성화됩니다. 같은 grant/client_request_id의 입장 재시도는 같은 lease를 반환합니다. 활성 grant의 다른 join ID는 409입니다. nickname은 Unicode 문자 64개 이하입니다.

## 보관과 cursor

본문은 instance 변수 ring만 사용합니다. Storage/SQL/KV/alarm/Cache/R2/analytics/console/traces에 본문, token, IP를 쓰지 않습니다. 최근 100개와 최대 3,600,000ms를 동시에 적용하며 모든 요청 및 대기 완료 전에 lazy prune합니다. 유휴 상태를 유지시키는 timer는 없습니다. 본문 UTF-8 최대 2,048바이트, JSON 요청 최대 8KiB, 읽기 JSON 최대 64KiB입니다.

첫 `after` 없는 읽기는 현재 시각부터 5분 이내의 마지막 최대 20개를 오름차순으로 선택합니다. `initial_window={max_age_seconds:300,max_messages:20,truncated:boolean}`으로 그 이전 생략을 알립니다. 빈 첫 응답의 cursor는 현재 epoch:lastSequence입니다. 이후에는 반영한 cursor를 전달해야 하며 전체 ring을 자동 내려받지 않습니다.

delta는 입력 cursor 이후의 앞부분 최대 20개를 오름차순으로 반환합니다. 실제 JSON UTF-8 64KiB를 넘으면 전달 가능한 앞부분까지만 보내며 cursor는 실제 마지막 전달 항목이고 `has_more=true`입니다. snapshot 최신 sequence로 먼저 이동하지 않습니다. 빈 timeout의 cursor는 입력 그대로입니다.

epoch는 instance마다 randomUUID이며 수락한 메시지만 sequence가 증가합니다. 다른 epoch는 `history_reset`, trim된 경계보다 오래된 동일 epoch cursor는 `history_gap`입니다. notice를 항상 동반하고 최근 5분/20개 재동기화 window와 실제 전달 cursor를 제공합니다. reset/gap의 notice 자체에는 과거 본문이 없습니다. `earliest_cursor`는 현재 ring 경계에 대한 진단이며 자동 전체-history fetch 지시가 아닙니다.

소비자는 응답을 반영한 다음 cursor를 저장하고 동일 epoch/sequence 재수신은 중복 제거합니다. 중간 sequence 누락을 정상으로 오인하지 않습니다. reset/gap을 사용자에게 표시하고 제한된 window를 수용합니다. guide의 curl 예시는 첫 읽기→delta→timeout→재연결→reset/gap 수용 순서입니다.

동일 participant/client_message_id의 재전송은 보관 중인 ring의 같은 결과를 반환합니다. 본문 변경은 409입니다. 별도 큰 idempotency 본문 map은 없습니다. 중복 방지는 현재 epoch와 살아 있는 100개/1시간 범위까지만 유효하며 재시작/잘림 뒤 재전송 중복은 가능합니다.

## 자원과 발언 제한

100 participant와 50 watcher는 실제 사람 수/TCP 연결 수가 아니라 논리 lease 수입니다. 각각 256-bit secret입니다. 명시 퇴장 또는 마지막 유효 read/wait/post부터 5분 무활동 시 반환합니다. invalid/limit 거절은 활동을 연장하지 않습니다. 각 lease pending wait 하나(중복 409), 방 전체 wait 150개, handler admission 160개이며 finally/abort/최대 25초 timeout으로 회수합니다. 이 카운터는 소켓 전송 완료까지의 물리 연결 수가 아닙니다.

| 한도 | 정확한 의미 |
| :-- | :-- |
| operator/grant 발언 | 마지막 **수락** +30,000ms, 닉네임/재입장에도 같은 quota |
| IP 보조 발언 | 마지막 **수락** +1,000ms |
| 방 전체 발언 | 직전 1,000ms sliding window 최대 5개, timestamp 최대 5개 |
| IP grant 발급/입장 | 합쳐서 직전 60초 최대 5회, 성공한 발급/입장만 소비 |
| pending grant | 5분 유효, 최대 1,000개 |
| IP hash rate map | 최대 2,048키, 5분 만료 정리; live cooldown을 버리며 새 IP를 받지 않음 |
| 한 IP 활성 lease | participant 5개 / watcher 5개 |
| read/wait | lease별 최소 2초, 다음 2초 batch tick; 활성 wait가 있을 때만 timer |
| 읽기 응답 | token bucket 평균 75응답/초, burst 150 |
| 읽기 JSON 바이트 | token bucket 평균 4MiB/초, burst 8MiB |

발언의 세 조건을 전부 확인한 뒤 await 없는 한 동기 구간에서 기록합니다. room 거절은 operator/IP cooldown을 소비하지 않습니다. 메시지용 token bucket은 사용하지 않습니다. 100명의 새 발언 기회는 평균 100/30=3.33개/초지만 aligned burst 성공을 보장하지 않습니다. 엄격한 공정 scheduler도 아닙니다.

429에는 초 올림 `Retry-After`와 `error.retry_after_ms`가 있습니다. 클라이언트가 그 시간에 jitter를 더해 재시도합니다. 서버는 메시지를 큐에 보관하거나 자동 재발송하지 않습니다. 읽기 token bucket은 메시지의 엄격한 sliding-window 한도와 달리 평균/버스트 한도입니다.

cheap request bucket은 방 평균 300/초 burst 320, 이미 알려진 IP 평균 30/초 burst 60입니다. body 읽기 deadline은 5초입니다. method/path/origin/Content-Length와 cheap rate 검사를 본문 읽기 전에 합니다. 전체 설정은 `PUBLIC_POLICY` 하나입니다. 실제 운영값 변경은 별도 판단 대상입니다.

adapter는 외부 `x-toktok-public-ip-hash`를 삭제하고 신뢰된 `CF-Connecting-IP`의 SHA-256으로 덮어씁니다. raw IP는 상태에 보관하거나 로그에 남기지 않습니다. XFF를 신뢰하지 않습니다. 후속 integration은 **직접 edge 요청의 IP provenance**를 확인해야 합니다. 같은-zone Worker subrequest의 x-real-ip 변경, cross-zone 고정 IP, Pseudo IPv4는 [Cloudflare header 규칙](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)을 따르므로 임의 upstream header를 trusted IP로 인정하면 안 됩니다. fixture의 x-fixture-ip는 로컬 부하용이며 운영에서는 금지합니다. 팀 NAT도 안전 기본값의 제한을 공유합니다. 익명 다중-IP Sybil 완전 차단은 보장하지 않습니다.

## 플랫폼의 보장 범위와 private 전환 영향

확인일은 2026-10-02입니다. [storage 접근 문서](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)에 따라 storage API를 전혀 호출하지 않는 별도 PublicRoom의 RAM ring은 SQLite에 자동 기록하지 않습니다. fixture는 실제 SQLite-class DO에서 storage가 빈 것을 검사합니다. 이 사실은 Cloudflare 내부 메모리 취급이나 모든 외부 보안 관측의 물리적 비보존까지 증명하지 않습니다.

[DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)에서 hibernation/eviction/배포/장애/재시작 시 RAM 상태를 잃습니다. 최소 1시간 보관은 보장하지 않으며 1시간은 읽기 노출 상한입니다. 오래된 instance 요청과 새 instance 경계의 물리 연결 수를 엄격히 같은 lease 수로 보장하지 않습니다. HTTP longpoll은 WebSocket hibernation 대상이 아니며 대기 시간 동안 duration 비용이 생깁니다.

fixture는 `enable_request_signal`을 설정하고 Worker fetch→DO fetch에 Request signal을 전달합니다. [호환성 flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests)가 없는 운영 환경에서 같은 취소 동작을 가정하지 않습니다. 취소가 전달되지 않아도 25초 timeout으로 회수합니다. [6개 outbound connection 한도](https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections)는 inbound 관전자 사람 수 한도가 아닙니다.

최신 사용자 결정의 DEMO는 작은 익명 공개방과 제한된 익명 private 생성이며 모든 대화 body를 DB에 저장하지 않습니다. admin invite key 소지자는 OTP 가입할 수 있지만 DEMO에서는 저장할 수 없습니다. HOSTED는 OTP 가입 후 방 생성 시 persist를 선택하며 default OFF와 retention 고지가 필요합니다. 이 private/설정 적용은 root 계약 이후의 후속 구현이고 이번 PR의 private 코드에는 적용하지 않았습니다. 본문/idempotency/sequence를 메모리로 바꾸더라도 room/cap/expiry/owner 최소 metadata는 persistence를 유지해야 만료/권한/방 존재를 재시작 뒤 판단할 수 있습니다. 메모리 epoch reset과 history notice가 필요하며 재시작 뒤 이력과 중복 방지 범위는 소실됩니다.

[SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)의 `deleteAll`은 활성 SQL/KV 삭제이며 최신 compatibility에서는 alarm도 지웁니다. PITR는 과거 30일 복구 범위입니다. 활성 DB 삭제와 모든 복구 사본의 즉시 완전 물리 삭제는 다른 주장입니다. 공식 문서만으로 `deleteAll`이 모든 사본을 즉시 제거하거나 정확히 30일 후 완전 소거한다고 보장할 수 없습니다. private 삭제 고지에 이 한계를 남겨야 합니다.
