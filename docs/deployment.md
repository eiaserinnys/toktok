# Cloudflare 배포 준비

현재 이메일/OTP/claim 추가 구현과 새 검증은 사용자 지시로 보류했습니다. 익명 private create 전환은 검토 중이며 아직 승인되지 않았습니다. 이 문서는 WIP이고 기존 통과 증거는 유지합니다. 최종 private 정책 합격이나 서비스 공개를 뜻하지 않습니다. [보존 상태와 증거](qa/claim-wip-20261002/README.md)를 봅니다.

이번 PR은 에이전트 등록·사람 이메일 OTP·명시 claim 승인·승인 agent 생성의 로컬 구현입니다. root가 머지·운영 공개를 맡습니다. 실제 계정 접근 변경, 새 credential, Sending domain/binding, DNS, 실제 메일은 실행하지 않습니다. 공개방은 별도 담당 범위입니다.

## 기본 차단 상태

운영 SIGNUP_POLICY_JSON은 {"mode":"closed"}이며 실제 팀 명단이 아직 없습니다. EMAIL/EMAIL_FROM을 설정하지 않아 이메일 발송은503입니다. 수동 CREATOR_CREDENTIALS_JSON fallback은 제거합니다. production entry는 src/index.ts이며 test/worker.ts의 창작 inbox·시각·IP 주입이 bundle에 들어가지 않아야 합니다. Google/외부 mail SDK/테스트 identity 헤더/환경 우회 flag는 없습니다.

기존 Vault shared/cloudflare-eiaserinnys-me의 account_id/token 정본은 실제 배포 때만 재사용합니다. 값은 공개 repo/로그/스크린샷/명령 출력에 넣지 않습니다. 신규 토큰·권한 확대·계정·유료 계약을 만들지 않습니다. 운영 권한·실제 hostname·Sending 설정의 준비 여부는 배포 담당자가 따로 실측합니다.

## Worker와 신뢰 경계

Worker name toktok, custom domain toktok.eiaserinnys.me, workers_dev=false, preview_urls=false, observability/logs/traces 비활성입니다. Assets run_worker_first=true이며 API JSON/Markdown/HTML 분기를 유지합니다. CSS/JS/폰트/SVG는 로컬 자산, CSP-self/no-store/noindex/no-referrer를 유지합니다. Room v1 migration과 singleton IdentityRegistry v2 new_sqlite_classes를 사용합니다. D1/KV/R2/Redis/VM은 추가하지 않습니다.

production OTP bootstrap/send는 request.cf와 CF-Connecting-IP가 있는 직접 Cloudflare edge origin을 가정합니다. CF-Worker auth subrequest는 거절하며 X-Forwarded-For/X-Real-IP/body IP를 대체로 사용하지 않습니다. 같은 zone의 신뢰된 Worker가 CF client IP를 바꿀 수 있다는 플랫폼 한계가 있습니다. 배포 시 direct edge 흐름과 다른 Worker의 신뢰 범위를 확인하며 헤더 존재만으로 end-user 신원을 증명하지 않습니다. 로컬 test entry의 명시 DI는 production에 없습니다.

IP_RATE_LIMIT namespace1001은 API120/60초의 저렴한 edge gate이고 CREATOR_RATE_LIMIT1002는 agent5/60초입니다. 위치별 근사 제한이며 OTP 원자 예산과 별개입니다. namespace 충돌 여부는 배포 전 확인합니다. DO의 EMAIL_LIMITS_JSON은 email2/UTC시간·3/UTC일·120초, IP30/UTC시간·100/UTC일, 서비스 전체 실제 발송 예약10000/UTC월입니다. 월값은10000이어야 하고 누락/손상/0은failclosed입니다. 이메일/IP 값 조정은 검증된 명시 config로만 하며 관리 UI를 만들지 않습니다.

## 이메일 연결 제안과 첫 실제 발송 gate

아래는 아직 승인·활성화하지 않은 검토용 예시이며 실제 wrangler.jsonc에는 send_email/From을 넣지 않습니다. remote:true를 켜거나 로컬 시험에서 실제 발송하지 않습니다.

```json
{
  "send_email": [{"name":"EMAIL","allowed_sender_addresses":["login@notify.toktok.eiaserinnys.me"]}],
  "vars": {"EMAIL_FROM":"login@notify.toktok.eiaserinnys.me"}
}
```

발신 도메인 notify.toktok.eiaserinnys.me 및 From 위1주소만 제한하는 제안입니다. domain 인증/메일 권한/설정은 root의 승인 후 별도 실행입니다. source adapter는 EMAIL.send({from,to,subject,text}) 단일수신자만 사용합니다. 공식 API의 messageId는 받지만 앱에서는 저장·노출하지 않습니다. 제공자 idempotency 계약을 확인하지 못했으므로 앱 예약 하나당 호출 최대1회이며 provider retry/queue/outbox/fallback/refund는 없습니다. 예약 뒤 crash로 메일이 가지 않았을 수 있습니다. cooldown 후 사용자가 새 request ID로 직접 다시 요청합니다. [Workers 발송 API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [send binding](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

**첫 실제 메일 전 root가 해당 Sending domain의 Email preview OFF를 인증된 관리설정/API/dashboard에서 직접 확인해야 합니다. 현재 미검증이며 발송 차단 상태입니다.** 증거에는 확인 시각·실제 도메인·OFF 값을 기록합니다. 거짓 자체 확인 flag나 매메일 관리설정 조회 계층은 넣지 않습니다.

Cloudflare Email preview는 기본ON이며 메일 본문을 약7일 보관하는 별도 기능입니다. OFF가 기존 preview의 즉시 소거를 증명하지 않습니다. 발신자/수신자/제목/messageID/error 등의 발송 metadata는31일 보관하며 preview OFF와 무관합니다. “이메일 정보 미보관/모든 사본 즉시 삭제”라고 설명하지 않습니다. 제목은 고정 “톡톡 이메일 확인”이며 OTP는 body에만 있고 subject/header/tag/URL/messageId에 넣지 않습니다. provider의 원본 오류는 HTTP/console/DB에 넣지 않습니다. [발송 기록](https://developers.cloudflare.com/email-service/observability/metrics-analytics/), [본문 preview](https://developers.cloudflare.com/email-service/observability/logs/), [domain preview](https://developers.cloudflare.com/email-service/configuration/domains/#email-preview).

UTC월 예산은 모든 toktok 최초 인증 발송과 새 재발송의 합계입니다. 다른 서비스가 같은 계정에서 보내는 메일은 이 gate를 거치지 않으며 Cloudflare billing cycle/무료 quota/계정 전체 청구량을 조회하거나 강제한다고 주장하지 않습니다. 예약 시점의 월만 집계하고 응답 유실·실패·이전월 늦은 결과에도 차감하거나 다른 월로 옮기지 않습니다.

## 공개 전 남은 경계

팀 명단 및 운영 restricted 허용, Sending domain·발신 제한·권한·preview OFF, 실제 DNS/route, 인증 cookie/신뢰 IP의 실제 환경과 최종 비공개 visibility/retention 고지를 확인해야 합니다. 비공개 본문 보관 방식 및 PITR 완전 소거 기간은 사용자 결정/공식 조사 전 확정하지 않습니다. 앱의 만료 active 읽기 차단/deleteAll은 플랫폼 백업 전체 소거 보장이 아닙니다.

CI는 전체 기존 회귀/타입/curl/dry-run 한 곳을 담당하며 운영 credential이나 배포 단계는 없습니다. dry-run은 bundle/Assets 구성만 보여주고 실제 Cloudflare 권한/도메인/실제 이메일/preview OFF를 증명하지 않습니다.
