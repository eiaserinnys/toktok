# Email Sending 활성화 — 2026-10-03

승인 범위는 `notify.toktok.eiaserinnys.me`의 발신 인증 DNS, `login@notify.toktok.eiaserinnys.me` 하나로 제한한 Workers 발송 binding, 본문 preview OFF, 지정 최초 관리자 bootstrap을 통한 인증 메일 1회다. 기존 수량·주소·IP·추정 비용 한도를 유지한다. 새 토큰 발급, 권한 확대, 유료 플랜 변경은 이 실행에 포함하지 않는다.

## 현재 확인된 상태

- 기존 토큰으로 Worker 설정 GET 200. `EMAIL`과 `EMAIL_FROM`은 없고, 최초 관리자 지정 secret binding은 존재한다. 비밀값은 출력하지 않았다. provider가 없으면 제품은 예약·발송 전에 `AUTH_PROVIDER_UNCONFIGURED`로 닫힌다.
- 대상 zone 조회 GET 200. 해당 zone의 `/email/sending/subdomains`는 403, Cloudflare code 10000이다. 이는 현재 연결의 접근 부족이며 발신 도메인이 없다는 증거가 아니다.
- 권한 이름과 범위를 확인하려던 `/user/tokens/permission_groups`도 403, code 9109였다. 인프라 변경·실제 메일 발송 없이 중지했다.
- Workers 배포 권한과 DNS 권한은 Email Sending 권한과 별개다. 현재 작업을 위해 기존 Workers/DNS 권한을 더 넓힐 근거는 없다.

공식 발송 안내에는 `Email Sending: Edit`가 명시되어 있다. 그러나 이번에 읽은 발신 도메인 API 문서는 Accepted Permissions를 명시하지 않으며, 현재 토큰의 권한 목록도 조회할 수 없다. 따라서 Account/Zone 그룹을 추측해 추가하거나 해당 권한 하나로 도메인 관리 403이 해결된다고 보장하지 않는다. [공식 발송 안내](https://developers.cloudflare.com/email-service/get-started/send-emails/), [권한 목록 안내](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), [발신 도메인 API](https://developers.cloudflare.com/api/resources/email_sending/subresources/subdomains/methods/create/).

기존 API token은 대시보드에서 편집할 수 있다. 토큰 재발급이나 채팅 전달은 필요하지 않으며, 정확한 권한을 확인하기 전에는 다른 광범위 권한을 추가하지 않는다. [공식 token 편집 안내](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

## 사용자가 직접 설정하는 최소 경로

1. Cloudflare의 대상 계정에서 **Compute → Email Service → Email Sending → Onboard Domain**을 연다.
2. Zone `eiaserinnys.me` 안의 발신 도메인 **`notify.toktok.eiaserinnys.me`**를 선택한다. 입력란이 zone 앞부분만 받으면 `notify.toktok`을 입력하고 완성 도메인을 확인한다.
3. 해당 발신 하위 도메인에 표시되는 인증 DNS만 검토하고 등록한다. 메인 도메인의 수신 설정이나 Email Routing을 바꾸지 않는다. 유료 플랜 변경이 요구되면 그 단계에서 중지한다.
4. 등록한 sending domain의 **Settings → Enable email preview**를 **OFF**로 저장한다. 새 도메인은 preview가 기본 ON이므로 시험 발송보다 먼저 확인한다.
5. 도메인 인증 완료와 preview OFF 상태만 전달한다. 이후 배포에서 `EMAIL` binding의 허용 sender를 위 발신 주소 하나로 제한하고 `EMAIL_FROM`을 연결한다. 활성화와 지정 bootstrap 검증이 끝난 뒤에만 승인된 메일 1회를 시험한다.

위 단계는 사용자의 대시보드 작업 안내다. 현재 실행이 차단된 API를 다른 자격증명으로 대신 호출하는 절차가 아니다. [공식 하위 도메인 등록](https://developers.cloudflare.com/email-service/configuration/subdomains/), [preview 설정](https://developers.cloudflare.com/email-service/configuration/domains/#email-preview), [sender 제한](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

DEMO의 일반 미가입 로그인에는 이메일을 보내지 않는다. 유효한 초대의 첫 가입과 지정 bootstrap은 별도 정상 경로이며, HOSTED의 명시적 공개 가입은 운영 설정에 따른다. [발송 대상·가입 중지 경계 검증](../qa/20261003-email-eligibility-validation.md).

## 승인된 발신 연결

2026-10-03 09:13:46 UTC 사용자가 도메인 인증 활성화와 이메일 preview OFF를 완료했다고 확인했다. 403으로 막힌 도메인 관리 API는 재시도하거나 우회하지 않았다. 이 사용자 확인을 근거로 기존 Workers 배포 권한으로 `EMAIL`의 `allowed_sender_addresses`를 승인된 주소 하나로 제한하고 `EMAIL_FROM`을 연결한다. 실제 메일 시험은 정식 bootstrap eligibility 및 발송 한도를 통과하는 1회만 허용하며, 일반 응답 200만으로 제공자 수락이나 수신함 도착을 주장하지 않는다.
