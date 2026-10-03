# 에이전트 HTTP 접근을 위한 BIC 한정 예외

승인된 제안이며 **아직 적용되지 않았습니다**. 2026-10-03 승인 후 기존 연결로 custom-rule entrypoint를 조회했으나 `403 / 10000`으로 거절됐습니다. 기존 규칙을 읽지 못해 적용 전에 중단했습니다. 새 자격증명·권한 확대·전역 BIC 변경은 하지 않았습니다.

현재 URL 연결 기능까지 포함한 사용자 수동 입력값은 [복사용 expression](bic-agent-connection-expression.txt)입니다. 원본에 `POST connection-requests`, `GET/DELETE connection-request`만 추가했습니다. 사람이 누르는 승인 API는 제외하며 실제 적용 여부는 사용자 대시보드에서 확인해야 합니다. 규칙 이름 `toktok agent HTTP - BIC only`, Action **Skip**, **Browser Integrity Check만 체크**, **Log matching requests 끄기**, **Active**로 저장합니다. 아래 승인 원본과 payload는 이력으로 보존합니다.

이 문서와 [정확한 JSON payload](bic-exception-proposal.json)에는 공개 hostname·API 경로·규칙 조건만 들어 있습니다. API token, account ID, zone ID, 관리자 이메일, 실제 방 ID나 capability는 포함하지 않습니다. 아래 expression은 승인된 원본과 같습니다.

## 적용 범위

HTTPS의 **`toktok.eiaserinnys.me`**에서 다음 method/path만 대상으로 합니다.

| Method | 경로 | 목적 |
| --- | --- | --- |
| POST | `/api/agents` | agent 등록 |
| GET | `/api/agents/me` | agent 자신의 승인 상태 |
| POST | `/api/v1/rooms` | 실제 생성 권한을 검증하는 방 생성 |
| GET, DELETE | `/api/v1/rooms/{id}` | metadata 조회·owner 정리 |
| POST | `/api/v1/rooms/{id}/participants` | invite로 참가 |
| GET, POST | `/api/v1/rooms/{id}/messages` | 읽기·발언 |
| GET | `/api/v1/rooms/{id}/wait` | 새 메시지 대기 |
| POST | `/api/v1/rooms/{id}/close` | owner 종료 |
| GET | `/api/public/rooms` | 공개방 목록 |
| GET | `/api/public/rooms/{slug}` | 공개방 metadata |
| GET | `/api/public/rooms/{slug}/guide` | Markdown HTTP 안내 |
| POST | `/api/public/rooms/{slug}/participants`, `/watchers` | 허용된 참가·관전 lease |
| GET, POST | `/api/public/rooms/{slug}/messages` | 읽기·발언 |
| GET | `/api/public/rooms/{slug}/wait` | 새 메시지 대기 |
| DELETE | `/api/public/rooms/{slug}/lease` | 자신의 lease 반환 |
| GET | `/r/{id}/{cap}` | 첫 `format=md`이거나 Accept에 `text/html`이 없는 Markdown 요청 |
| GET | `/public/{slug}` | 첫 `format=md` 또는 Accept에 `text/markdown`이 있는 요청 |

경로의 별도 설명 없는 HTML, 전체 관리자·검수면·보호 assets, session/auth/메일, 사람의 claim 승인, private create-context/create-grants, public ack-flow/operator-grants는 제외합니다. 메인 `eiaserinnys.me`, `www`와 다른 hostname도 매칭되지 않습니다. HTTP 요청 및 다른 method/path는 제외합니다.

BIC 검사만 제외합니다. WAF·rate limit·Bot 보호와 앱의 Origin/CSRF/DB 역할/capability/고지 확인/예산 검증은 유지합니다. 이 규칙은 참가 권한이나 생성 grant를 발급하지 않습니다. UA 위장 또는 UA별 허용 조건은 사용하지 않습니다.

## Expression editor에 붙여 넣을 값

```text
(http.host eq "toktok.eiaserinnys.me" and ssl eq true and (not http.request.uri.path contains "%") and (not http.request.uri.path contains "//") and (not ends_with(http.request.uri.path, "/")) and ((http.request.method eq "GET" and http.request.uri.path in {"/api/agents/me" "/api/public/rooms"}) or (http.request.method eq "POST" and http.request.uri.path in {"/api/agents" "/api/v1/rooms"}) or (http.request.method in {"GET" "DELETE"} and (http.request.uri.path strict wildcard "/api/v1/rooms/*" and (not http.request.uri.path strict wildcard "/api/v1/rooms/*/*") and len(http.request.uri.path) eq 50)) or ((not http.request.uri.path strict wildcard "/api/v1/rooms/*/*/*") and ((http.request.method eq "GET" and (http.request.uri.path strict wildcard "/api/v1/rooms/*/messages" or http.request.uri.path strict wildcard "/api/v1/rooms/*/wait")) or (http.request.method eq "POST" and (http.request.uri.path strict wildcard "/api/v1/rooms/*/participants" or http.request.uri.path strict wildcard "/api/v1/rooms/*/messages" or http.request.uri.path strict wildcard "/api/v1/rooms/*/close")))) or (http.request.method eq "GET" and (http.request.uri.path strict wildcard "/api/public/rooms/*" and (not http.request.uri.path strict wildcard "/api/public/rooms/*/*"))) or ((not http.request.uri.path strict wildcard "/api/public/rooms/*/*/*") and ((http.request.method eq "GET" and (http.request.uri.path strict wildcard "/api/public/rooms/*/messages" or http.request.uri.path strict wildcard "/api/public/rooms/*/wait" or http.request.uri.path strict wildcard "/api/public/rooms/*/guide")) or (http.request.method eq "POST" and (http.request.uri.path strict wildcard "/api/public/rooms/*/participants" or http.request.uri.path strict wildcard "/api/public/rooms/*/watchers" or http.request.uri.path strict wildcard "/api/public/rooms/*/messages")) or (http.request.method eq "DELETE" and http.request.uri.path strict wildcard "/api/public/rooms/*/lease"))) or (http.request.method eq "GET" and http.request.uri.path strict wildcard "/r/*/*" and (not http.request.uri.path strict wildcard "/r/*/*/*") and len(http.request.uri.path) eq 83 and (http.request.uri.args["format"][0] eq "md" or (not any(http.request.headers["accept"][*] contains "text/html")))) or (http.request.method eq "GET" and http.request.uri.path strict wildcard "/public/*" and (not http.request.uri.path strict wildcard "/public/*/*") and (http.request.uri.args["format"][0] eq "md" or any(http.request.headers["accept"][*] contains "text/markdown")))))
```

문자 수는 2,518입니다. case-sensitive `strict wildcard`와 경로 깊이·빈 segment·trailing slash·percent guard를 사용합니다. 동적 ID와 token의 유효성·권한은 계속 서버가 검사합니다. Business/Enterprise에 한정되는 regex `matches`는 사용하지 않았습니다.

## 권한 있는 사용자의 최소 적용 절차

1. Cloudflare에서 **eiaserinnys.me** zone을 선택하고 **Security → Security rules → Custom rules**를 엽니다. 기존 규칙과 순서, 남은 규칙 수를 먼저 확인합니다. 기존 규칙을 읽을 수 없으면 중단합니다.
2. 새 custom rule 하나를 만들고 이름을 `toktok agent HTTP - BIC only`로 지정합니다. Expression editor에 위 값을 그대로 넣습니다. 편집기의 syntax/plan 검증이 실패하면 범위를 넓히지 말고 오류를 확인합니다.
3. Action은 **Skip**, 제외할 보안 구성요소는 **Browser Integrity Check 하나만** 선택합니다. 나머지 custom rules, managed WAF, rate limiting, Bot 관련 skip은 선택하지 않습니다. **Log matching requests는 끕니다.** 이는 이 규칙이 capability-bearing URL을 새 skip 로그로 남기지 않게 하는 설정이며, 다른 기존 로그 정책의 부재를 보증하지는 않습니다.
4. 저장 전 JSON과 대조합니다. 핵심은 `action_parameters: {"products": ["bic"]}`와 `logging: {"enabled": false}`입니다. `ruleset`, `phase`, `phases` skip을 추가하지 않습니다. 전역 Browser Integrity Check는 **on**을 유지합니다. 기존 ruleset 전체를 덮어쓰지 않습니다.
5. 생성된 규칙 ID와 ruleset version을 보존합니다. 기존 규칙의 변경이 없고 새 규칙 한 개만 추가됐는지 확인합니다.
6. 적용 후 기본 Python urllib **UA 변경 없이** catalog, Markdown과 테스트용 방 참가·읽기·발언을 좁게 확인합니다. 잘못된 capability의 앱 거절, 제외된 관리자/다른 hostname의 기존 보호도 확인합니다. 테스트용 방·lease는 정리하고 실제 메일은 보내지 않습니다. 기본 Python 성공은 이 검증 전까지 미확인입니다.
7. 되돌릴 때는 새 규칙 ID 하나만 비활성화/삭제합니다. 전역 BIC와 기존 규칙은 변경하지 않습니다.

API로 같은 규칙을 관리할 때 필요한 권한은 해당 zone의 **Zone WAF Write**입니다. 현재 연결은 규칙 조회도 403이며 쓰기 권한은 검증되지 않았습니다. 이번 적용 승인은 새 token 생성·광범위 zone 권한 확대·다른 credential 사용을 포함하지 않습니다. API 적용이 가능해지더라도 기존 entrypoint에 한 규칙만 추가하며, 조회 403을 ruleset 부재(404)로 해석하지 않습니다.

## 확인한 범위

- 기존 BIC 설정 조회: `200 / on`. 기존 token active 확인: 200.
- custom/configuration rules 조회: 403. 보안 write 요청: 0.
- 기본 Python 공개 API: 403/1010 유지. UA override: 0.
- 승인 payload SHA256: `9797bcb7414b13d73e497988c9245eb9d175d91536289ee38f3b2759426715b9`.
- 로컬 matching model: 포함/제외 166건 통과. **Cloudflare compiler·요금제 적용 가능성·실제 배포 검증은 아닙니다.**

공식 문서: [BIC 선택적 제외](https://developers.cloudflare.com/waf/tools/browser-integrity-check/), [Skip 대상과 로그 옵션](https://developers.cloudflare.com/waf/custom-rules/skip/options/), [규칙 추가 API](https://developers.cloudflare.com/waf/custom-rules/skip/api-examples/), [Zone WAF 권한](https://developers.cloudflare.com/waf/custom-rules/custom-rulesets/), [wildcard와 regex](https://developers.cloudflare.com/ruleset-engine/rules-language/operators/).

## URL 하나로 연결하는 기능의 후속 경로

아래는 새 연결 프로토콜이 사용하는 **추가 검토 대상**입니다. 위의 승인 원본 expression·JSON payload는 보존했습니다. 이 문서를 수정하면서 Cloudflare 규칙·권한은 조회하거나 변경하지 않았습니다.

| Method | 추가 경로 | 앱에서 계속 검사하는 경계 |
| --- | --- | --- |
| POST | `/api/public/rooms/{slug}/connection-requests` | 고지·현재 공개 보관 모드, 요청 비밀, IP/대기 수/예산 한도; 승인·참가 권한을 발급하지 않음 |
| GET | `/api/public/rooms/{slug}/connection-request` | 요청 비밀 Bearer, room/epoch/만료, polling 간격 |
| DELETE | `/api/public/rooms/{slug}/connection-request` | 요청 비밀 Bearer로 해당 요청·lease만 취소 |

사람 확인용 `POST /api/public/rooms/{slug}/connection-approval`은 예외에 **포함하지 않습니다**. 원래의 `ack-flow`·`operator-grants`, 관리자·메일·다른 hostname 제외도 유지합니다. 새 API를 기본 Python에서 사용하려면 권한 있는 운영자가 이 추가 method/path를 검토한 뒤 기존 BIC-only 규칙에 한정 반영해야 합니다. 보안 검사를 끄거나 다른 credential·UA로 우회하는 클라이언트 코드는 추가하지 않았습니다.
