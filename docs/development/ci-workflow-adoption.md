# CI workflow 반영

제품 통합 PR은 [#6](https://github.com/eiaserinnys/toktok/pull/6), 대상 branch는 `feat/release-integration`이다. 현재 GitHub push 연결은 workflow 파일 수정 권한이 없어 `.github/workflows/ci.yml` 변경이 거절됐다. 기존 workflow는 보존했다. 다른 credential이나 push route로 우회하지 않는다.

## 정확한 제안과 권한 있는 사용자의 작업

[제안 파일](https://github.com/eiaserinnys/toktok/blob/8e371afc600840b47d78d435c20bccbd8fb05b73/docs/development/ci-workflow-proposal.yml)은 `8e371afc600840b47d78d435c20bccbd8fb05b73`에 고정돼 있다. [차이 파일](ci-workflow-proposal.patch)은 같은 pin의 기존 workflow와 제안을 비교한 것이다. 이 제안은 production secrets, 환경 권한 또는 배포 job을 추가하지 않는다.

권한 있는 사용자가 별도의 깨끗한 checkout에서 해당 PR branch를 연 뒤 다음을 수행한다. 공유 작업 폴더에서 branch를 바꾸지 않는다.

```sh
git fetch origin feat/release-integration
git switch feat/release-integration
git show 8e371afc600840b47d78d435c20bccbd8fb05b73:docs/development/ci-workflow-proposal.yml > .github/workflows/ci.yml
git diff -- .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "ci: verify Cloudflare and Node runtimes separately"
git push origin feat/release-integration
```

기존 연결로 에이전트가 처리하려면 **GitHub 저장소 `eiaserinnys/toktok`의 `.github/workflows/ci.yml`을 수정하는 push 권한**에 대한 별도 명시 승인이 필요하다. 현재 연결이 classic PAT라면 `workflow` scope에 해당한다. 새 토큰 생성이나 다른 권한 확대는 이 문서로 승인되지 않는다.

## 현재 원격 검사 범위

[run 37086166901](https://github.com/eiaserinnys/toktok/actions/runs/37086166901)은 위 제품 pin의 기존 Node22 단일 job이다. `pnpm test`, `test:verdict`, `test:ui`, `test:public-ui`, CF `typecheck`는 통과했다. `acceptance`는 `selfhost/node_modules/tsx` 미설치로 assertions 전에 실패했고 `dry-run`은 실행되지 않았다.

제안은 Node24.21.0, selfhost 의존성 설치, 분리된 Node 타입/빌드/SQLite 검사, HTTP acceptance, 격리 TLS SMTP mock과 PostgreSQL 검사를 추가한다. 현재 workflow가 이 범위를 검증했다고 보고하지 않는다. 로컬 결과와 각 checkpoint 증거는 [통합 기록](../release-integration.md) 및 [portable 검증](../portable-validation.md)에 구분한다. 기통과 HTTP·설치 검사는 workflow 권한 문제만으로 반복하지 않는다.
