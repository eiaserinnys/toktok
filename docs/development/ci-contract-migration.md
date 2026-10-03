# 통합 CI 계약 이관

기존 foundation 10개/routing 3개는 legacy IdentityRegistry 직접 SQL와 `/api/rooms` 생성 경로를 전제로 한다. 이 파일을 현재 제품의 통과 증거로 사용하지 않는다. 원본은 그대로 보존하며 실행 정본은 `application-runtime.test.ts`와 `application-remaining.test.ts`의 같은 root HTTP/실제 CONTROL·PrivateRoom·PublicRoom이다. OTP13/claim9는 현재 DB account·invite·session fixture로 이관해 독립 Workers pool에서 실행한다.

| 이전 요구 | 현행 외부 계약과 CI |
| --- | --- |
| 생성 권한·Origin | runtime authority/lost-result + runtime mail-cap/claim. 익명은 context+명시 grant 후 제한적으로 허용 |
| capability·GET 무입장 | runtime private + remaining capabilities. 토큰4개/43자, missing401/bad403, ownerHTML403 |
| 순서·중복·reply | runtime 2sender3왕복 + remaining12concurrent/reply변경·위조거절 |
| page/restart | runtime3page + memory epoch reset + B persisted restart. memory105개 복원을 요구하지 않음 |
| timeout/wake/abort | runtimewait + remaining실제1초timeout·등록wait발신 + B abort/shutdown/동일cap409 |
| close/delete/expiry | runtimeclose + remaining unread먼저/emptywait410, persist DELETE body/dedupe0, expiry wait410 |
| input/header | remainingtypedpolicy/UTF8·JSON/query/no-store/noindex/nosniff/CORS |
| static/negotiation/error | runtimeassets/entry HTML·Markdown·JSON, invalid403/deleted410/unknown404, GETschema0 |

`test/public-room.test.ts`는 public core의 기존 안전/lease/throttle/cursor 의미를 유지하되 thin wrapper의 `core`를 명시적으로 관측하고 fixture budget을 주입한다. public UI 통합 2개는 기존 assertion을 유지하며 새 실제 application host를 사용한다. UI renderer·registry·edge 음성 대조 및 generated safety 일치도 CI에 포함한다.

CF job은 Workers source/fixtures 타입과 local Workers runtime을 확인한다. Node job은 선택 adapter의 타입, SQLite installer/backup/startup, shared HTTP, SMTP loopback, 격리 PostgreSQL을 확인한다. Node driver를 CF 빌드의 필수 의존성으로 넣지 않는다. CI에는 실제 서비스 배포·발신·관리자 비밀·사용자 DB가 없다.

각 targeted 실행의 최초 실패/보정 증거는 별도 JSON/log에 보존한다. CI 전체 결과가 나오기 전 일부 통과를 전체 성공으로 보고하지 않는다. native RPC의 upstream producer cancellation 추가 관측 실패는 별도 diagnostic이며 local reader 해제/응답·handler 정리와 구분한다.
