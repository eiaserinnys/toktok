# 인증 메일 발송 대상 검증 — 2026-10-03

사용자 요구는 DEMO에서 임의의 미가입 주소에 로그인 메일을 보내지 않는 것이다. 기존 계정, 유효한 초대를 통한 첫 가입, 사전 지정 최초 관리자 bootstrap을 구분하며 HOSTED 공개 가입은 운영자가 선택한 가입 정책으로만 허용한다. 실제 수신자·발신 설정·자격증명은 이 문서에 포함하지 않는다.

## 결과와 제품 보완

DEMO의 일반 미가입 로그인은 이미 generic 응답으로 억제되고 있었다. 새 검증에서 **초대 가입 흐름을 시작한 후 운영자가 가입을 `closed`로 바꾸어도 발송과 첫 가입 완료가 계속 허용되는 결함**을 확인했다. `src/control-policy.ts`의 `signupEligible` 신규 가입 조건에 현재 정책이 `closed`가 아니라는 조건 하나를 추가했다. 발송 시점과 OTP 완료 시점이 같은 정본 함수를 사용한다.

- 기존 계정의 로그인과 기존 세션은 가입 중지와 별개로 유지한다.
- 지정 bootstrap은 기존의 정확한 주소 일치·미소비·관리자 부재 조건을 유지한다. OTP 완료로는 member 세션만 생기며 별도 CSRF와 명시 confirm 이후에만 최초 admin이 된다.
- 초대 기반 새 가입은 현재 정책이 `closed`이면 새 메일을 보내지 않는다. 이미 발급된 새 가입 OTP도 완료 시 `403 ADMISSION_DENIED`로 거부하며 계정·세션을 만들지 않는다. 앞서 발송한 메일 예산은 환급하지 않는다. 기존 OTP 레코드는 원래 만료까지 남아 있을 수 있으나 closed 상태에서 가입 권한은 주지 않는다.
- 기본값, 발송 한도, 허용 대상 확대, 메일 제공자, DNS, 자격증명은 변경하지 않았다.

## 실제 처리 순서

| 단계 | 정본과 동작 |
|---|---|
| HTTP 입구 | `identity-http.ts`의 정확한 Origin, 직접 브라우저 경계, edge IP 제한, 입력·flow cookie 검증. provider 미설정은 발송 예약 전에 503으로 닫힌다. |
| 흐름·중복 | `OtpStore.reserve`가 flow/browser/현재 claim과 request ID·email 결합을 확인한다. 같은 요청 replay는 재발송하지 않는다. |
| 공통 사전 한도 | 주소별 cooldown/hour/day, IP hour/day, UTC email quantity와 estimated budget를 eligibility 조회 전에 같은 control TX에서 확인한다. 제한 상태의 eligible/suppressed 주소는 같은 오류·Retry-After를 사용한다. |
| 발송 자격 | `ControlDomain.emailEligible`는 DB account, 현재 유효한 invitation, bootstrap eligibility와 `signupEligible`를 사용한다. 초대는 raw 입력을 믿지 않고 선검증된 browser-bound flow의 invitation ID로 다시 조회한다. |
| 자격 있음 | 같은 TX에서 이메일 수량·비용 예약과 OTP digest를 저장한다. commit 후에만 HTTP handler가 sender를 호출한다. |
| 자격 없음 | OTP code와 이메일 예산 예약·sender 호출은 없다. 동일한 남용 제한을 적용하기 위해 주소/IP의 해시 기반 카운터·cooldown과 suppressed receipt는 저장한다. 외부 receipt는 `attempted`와 같은 안내·키·Retry-After 형식이다. |
| 첫 가입 완료 | nonce/browser/OTP를 확인한 뒤 현재 자격을 다시 판단하고, 초대 소비·계정 생성·세션 생성을 같은 TX에서 처리한다. |

`HOSTED/open`은 명시적인 signup flow에 한해 일반 미가입 주소 인증을 허용한다. `HOSTED/invite`에는 초대가 필요하며 `HOSTED/closed`는 새 가입을 받지 않는다. open이어도 **login** flow가 미가입 주소 발송 수단이 되지는 않는다. 초대는 특정 이메일에 묶인 allowlist가 아니라 bearer 초대 권한이다. 유효한 초대를 소지한 가입 시도는 가입 완료 전까지 정상 발송 한도를 적용받으며, 최초 성공으로 소비된 뒤에는 다른 bound flow도 새 가입 메일을 보내지 못한다.

소스상 이메일 한도 상한은 주소 2/hour·3/day·120초 간격, IP 30/hour·100/day, 월 10,000이다. 실제 DB 설정이나 workload/USD 예산이 더 낮으면 그 한도가 먼저 적용된다. 이번 검증은 운영 DB의 현재 값을 조회하거나 변경한 증거가 아니다.

## 새 검증과 원시 결과

전용 파일 `test/control-email-eligibility.test.ts` / `test/control-email-eligibility-vitest.config.ts`를 사용했다. 실제 Workers SQLite namespace, `SELF.fetch`, 생산 identity/admin/control handler와 Repository TX를 통과한다. 기존 테스트 worker가 제공하는 시간·신뢰 IP·메모리 fake sender만 대체했다. 실제 외부 이메일 발송은 0이다.

| 새 범위 | 최초 | 보완 후 |
|---|---|---|
| 잘못된 초대와 flow 생성 후 revoked/used/expired 초대 | PASS — 발송·이메일 수량·OTP code 0 | 재실행 안 함 |
| 유효 초대 첫 가입과 소비 후 두 번째 flow 억제, 기존 계정과 일반 미가입 login 구분 | PASS | 재실행 안 함 |
| bootstrap 관리자 존재/consumed 차단, member 세션과 별도 confirm+CSRF | fixture FAIL — 1시간 후 만료된 suppressed receipt를 2로 기대 | PASS — suppressed 2는 시간 이동 전에 확인, 최종 만료 0 |
| HOSTED open signup와 login, invite/closed 미초대 signup 구분 | PASS | 재실행 안 함 |
| DEMO closed 전환 후 발송·이미 발급 OTP 완료 | 제품 FAIL — 발송 2·가입 200 | PASS — 추가 발송 0·가입 403·새 계정/세션 0; 기존 계정 로그인 200 |
| HOSTED closed 전환 후 발송·이미 발급 OTP 완료 | 제품 FAIL — 발송 2·가입 200 | PASS — 같은 경계 확인 |

최초 **3 passed / 3 failed**, exit 1, test 955ms. 원시 파일:

- [initial JSON](../../test/control-email-eligibility-initial.json)
- [initial log](../../test/control-email-eligibility-initial.log)

실패한 3개만 보완 실행: **3 passed / 3 skipped**, exit 0, test 728ms. 원시 파일:

- [correction JSON](../../test/control-email-eligibility-correction.json)
- [correction log](../../test/control-email-eligibility-correction.log)

명령은 다음과 같으며 두 번 모두 host-wide heavy runner, worker 1, 300초 상한을 사용했다.

```sh
python3 "$AGENT_COMMON_FILES_DIR/skills/heavy-work-verify/scripts/heavy_verify.py" --timeout 300 -- \
  pnpm exec vitest run --config test/control-email-eligibility-vitest.config.ts --maxWorkers 1 \
  --reporter default --reporter json --outputFile test/control-email-eligibility-initial.json

python3 "$AGENT_COMMON_FILES_DIR/skills/heavy-work-verify/scripts/heavy_verify.py" --timeout 300 -- \
  pnpm exec vitest run --config test/control-email-eligibility-vitest.config.ts --maxWorkers 1 \
  -t 'bootstrap mail|closing signup' --reporter default --reporter json \
  --outputFile test/control-email-eligibility-correction.json
```

로그에는 status/code와 발송·수량·비용·계정/세션 건수만 남긴다. 테스트 입력 주소는 `.example` 창작 주소이며 OTP, cookie, invitation code, request payload는 출력하지 않는다. invitation 상태 변경과 bootstrap marker/consumed 상태는 테스트 DB fixture이며 실제 운영 초대나 관리자 설정 변경이 아니다. 정상 초대의 실제 첫 가입/소비도 별도 새 case에서 실행했다.

## 기존 증거 재사용과 한계

기존 `otp.test.ts`의 generic unknown 응답, 중복 발송 방지, flow/browser/nonce, 주소/IP/month 한도, Origin/edge, 월 cap 뒤 이미 발급된 OTP 완료는 이번에 반복하지 않았다. `control-email-preflight.test.ts`의 quantity/estimate 초과 때 eligible/suppressed 동일 거부와 부분 쓰기 0도 기존 증거로 남긴다. 이번 제품 변경은 한도·세션·OTP 비교·provider 계약을 바꾸지 않는다.

이 검증은 응답의 계정 존재 여부 차이를 막는 계약을 확인하며 네트워크 시간의 완전한 동일성을 입증한 것은 아니다. SMTP/Cloudflare 발송 전달성, 실제 사용자 메일 수신, 운영 bootstrap 값, DNS·preview 설정, 최종 배포는 범위 밖이다. 전체 auth/core/runtime/typecheck를 재실행하지 않았다. 최종 통합과 독립 읽기 전용 검수는 root 인계 항목이다.

Root는 변경된 한 조건과 reserve/complete 공용 호출, 새 테스트의 실제 handler 경계를 독립 읽기 검수했다. 새로운 blocker는 없었다. 일반 `test:auth` config에도 이 테스트 파일을 추가해 후속 CI에 포함했다. 로컬에서 기존 성공 테스트를 다시 실행하지 않았다.
