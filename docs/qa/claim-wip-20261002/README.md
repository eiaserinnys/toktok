# Claim/OTP WIP 보존

2026-10-02. 사용자가 이메일 없는 익명 private create 전환을 검토하여 현재 core/OTP 추가 구현과 새 검증을 보류했습니다. 전환은 미승인입니다. 이 스냅샷은 진행 중인 구현을 보존하며 완성 PR 또는 최종 출시 정책의 합격을 뜻하지 않습니다. 현재 branch는 feat/claim-foundation, 기준 main은2f666d689ac0dfd6f2a34c565a12a844d14ec8da입니다. main 머지·원격 push·실제메일·배포·운영설정·익명 전환을 하지 않습니다.

## 보존된 코드

IdentityRegistry SQLite DO, 등록 pending24h/승인 credential30일, flow/browser/nonce/claim 결합, 이메일 OTP digest/5회폐기/원자 session 발급,12시간 cookie와 session-CSRF, 명시 owner 위험확인 toktok-risk-v1, 폐기/정책 재평가와 agent bearer/cookie 생성 경계를 작성했습니다. source의 native 이메일 adapter만 있고 운영 EMAIL/From은 미설정이며 signup closed입니다. 최신 email2/h3/day120초·IP30/h100/day·UTC월10000 예약 계약을 구현한 상태입니다.

미허용 주소도 동일 HMAC email/IP 요청 예산을 소비하되 OTP/실제발송/월예약은 없고 일반accepted입니다. provider 성공/실패/불확실 결과도 동일accepted이며 원본error를 저장·출력하지 않습니다. 같은 logical request는 재발송·환불하지 않습니다. actual flow expiry는 start+10분 고정, OTP는 min(flow expiry,sent+10분)입니다. Common room에 이메일/코드/위험확인/claim/creator와 원본 생성modal을 연결한 중간 상태이며 공개방 코드는 없습니다.

## 회수한 실제 검증

- OTP 최초 런타임12개는 schedule compound SELECT SQLite 오류로 모두 인증 이전 실패했습니다. 테이블별 MIN 보정 뒤2passed/10failed였으며 singleton DO의 케이스 사이 저장소 유지가 확인되었습니다.
- 허용된 test beforeEach deleteAlarm/deleteAll 보정 후 실패10개만 실행해6passed/4failed/2skipped였습니다. 원시 JSON은20261002-2157-otp-targeted.json입니다. 남은4실패의 원래 errorcode가 없어 edge 원인으로 확정하지 않습니다.
- 허용된 test-only edge binding 제어 후 실패4계약과 새edge입구guard만 실행해5passed/8skipped/0failed, exit0입니다. 원시 JSON은20261002-2206-otp-controlled-edge.json입니다. 실제 Workers SQLite OTP clock/quota와 제어된 edge gate의 시험이며 Cloudflare 플랫폼120/min 정확도 시험이 아닙니다.
- 최종 OTP targeted군의13케이스는 분리된 실행에서 모두 통과 증거가 있습니다. quota9999 동시경계/10000차단, UTC월경계와 늦은결과귀속, duplicate/failure persisted boundary, 허용/미허용 동일안내/HMAC요청예산, email/IP 제한, 신뢰IP/설정차단,5회오입력/일회성/만료, cap뒤기존OTP/session/claim/방/메시지, 고정제목/본문OTP/원본providererror 비노출입니다. 실제 DO 프로세스 재시작 자체를 실행한 증거는 없고 영속시도기록 재조회 경계를 시험했습니다.
- OTP 변경 후 strict tsc 첫 실행은 exit0입니다. 후속 test harness 수정 뒤에는 반복하지 않았으며 최종CI가 아직 없습니다.
- 마지막 foreground 브라우저는 TOKTOK_OTP_CLAIM_BROWSER_PASS, exit0입니다.1440/390 실제local Worker HTTP/cookie로email입력/genericaccepted/120초대기/잘못된코드/429/정상확인/명시risk/승인/유효session두번째claim과생성메일추가0,31일고지/원본modal/별도owner복사/clipboarddenied/관전대표화면을 확인했습니다. 서버와 Chromium은 finally에서 종료·회수했습니다. 원시 JSON과26개 viewport PNG를 보존합니다. 캡처의 email/code입력은 비웠고cap은A43으로 가렸습니다.

대표 PNG는390-email-privacy,1440-before-approval,390-create-modal을 직접 열어 확인했습니다. 새 px 값을 고르지 않고 선정 Common room 및 원본 생성폼 규칙을 사용했습니다. 현재 claim 페이지 sidebar와 conversation의 y가 다르므로 모든 표면 정렬이 최종합격했다고 주장하지 않습니다. 기존시안 전체 또는 관전 전체를 새로 통과한 것으로 표현하지 않습니다.

## 아직 하지 않은 것

OpenAPI는 기존 schema에$ref가 있는 부분의 갱신 스크립트가 멈춰 아직 이전 계약이며 최종정리가 필요합니다. architecture/product/deployment는 작업 중 최신결정을 기록했고 기존validation/README와최종PR본문은 미완성입니다. stage3읽기전용code-review, draftPR/commitpush/최종headCI와새Assetsdry-run은 아직 하지 않았습니다. 기존 core 초기증거를 최종OTP회귀 통과로 대신하지 않습니다. 현재 browser에는 flow만료와 전역설정준비 화면 캡처가 없으며 서버runtime증거와구분합니다.

private retention/visibility 생성ack의 최종정책, 실제팀명단, 실제Sending권한/binding/도메인/DNS, 첫메일전previewOFF 직접실측, 실제메일 및공개엔진 통합은 남았습니다. Cloudflaremetadata31일과preview약7일은구분하며previewOFF현재값을확인했다고쓰지않습니다. 이메일없는anonymouscreate,본문memory-only,기본1h/max24h등새검토안은구현하지않았습니다. 후속설계를기다립니다.
