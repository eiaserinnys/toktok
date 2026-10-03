# 통합 상태

Cloudflare와 Node는 `src/application.ts`의 같은 HTTP handler를 사용한다. 인증·관리자·예산은 ControlHttpPort, 공개방과 비공개방은 같은 memory/private core의 플랫폼 wrapper로 연결한다. 각 서버는 backend 하나만 초기화하며 기존 SQL namespace를 자동 변환하지 않는다.

## 현재 확인

- CF production slice 최초 strict typecheck exit0. 이후 first-window 정본 설정을 병합했으므로 최종 통합 타입검사가 남는다.
- 실제 Node24 HTTP + SQLite 첫 gate 1 PASS: OTP→명시 관리자 bootstrap→QA 401/200 및 최종 CSP→private create/grant→join/post/read/close. 메일은 메모리 fake sender만 사용했다. 실제 메일/운영 관리자 발급이 아니다.
- Node 전체 타입 첫 실행은 `Request.cf`와 새 `inspect(id)` 접점 두 오류였다. CF metadata 타입은 국소 보정했으며 B의 fresh actor ID 복원 checkpoint 이후 보정 확인 예정이다.
- root 보호 QA 경계 2 PASS, ControlCore SQLite SQL cost 계수 1 PASS. 원시 수치는 `test/control-budget-sql.result.json`; 비용 모델은 운영 invoice 보장이 아니다.

## 연결과 적용

운영 entry는 새 CONTROL/PRIVATE_ROOMS namespace를 사용한다. legacy Room export는 migration history만 유지하며 기존 `/api/rooms` 생성 경로는 새 앱에서 열지 않는다. DB 설정 refresh 상한은 10초이고 역할·CSRF·소유권은 매 요청 domain에서 확인한다. public catalog/policy는 DB 설정을 읽어 RAM core에 revision으로 적용한다. private 생성 정책은 immutable snapshot으로 고정한다.

관리자 QA HTML/자산/API prefix는 DB role 검사 전에 Assets로 가지 않는다. 최종 CSP는 route 소유 정책으로 적용해 내부 secure()가 QA의 connect-src/form-action 제한을 덮어쓰지 못한다. 공개 shared code와 관리자 fixture/controller의 의존 방향을 분리한다.

최초 빈 DB만 demoInstallationProfile을 seed한다. 현재 후보는 공개2방 각10/10, private 동시2개, 제한된 생성/작업량이다. persisted private는 가입·entitlement·명시opt-in 확인이 필요하다. 숫자는 초기 설정이며 관리자 DB UI에서 안전 범위 내 변경한다. USD 경고/차단 표시와 정확한 작업량 enforcement/비용 가정의 최종 정합성 검증은 아직 남아 있다. 어떤 설정도 Cloudflare invoice hard cap을 보장하지 않는다.

## 남은 수용 검증

실제 CF HTTP와 기존 fixture 이관, Node/CF 최종 strict/CI, 새 shared auth/admin/private 화면·registry·390/1440 브라우저, 실제 Cloudflare endpoint/curl/node 및 challenge 여부가 남는다. SMTP/Cloudflare 발신 설정은 인프라 권한과 분리하며 실제 발송 전 preview OFF 등 별도 승인·확인이 필요하다. 이 문서를 배포 완료나 전체 시각 합격으로 해석하지 않는다.
