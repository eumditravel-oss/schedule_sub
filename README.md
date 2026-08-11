# CON-COST 개발팀 프로젝트 스케줄러

React와 Cloudflare Workers/D1으로 만든 사내 프로젝트·작업 일정 관리용 간트 차트입니다.

이 저장소는 빠른 검증을 위해 만든 임시 내부 도구입니다. 로그인과 세션 인증은 의도적으로 구현하지 않았으며, 화면의 작업자 선택은 표시 언어와 편집자 기록을 위한 프로필 선택일 뿐 인증 수단이 아닙니다. 외부 공개나 신뢰할 수 없는 사용자가 접근하는 환경에는 그대로 사용하면 안 됩니다.

## 주요 기능

- `/projects`: 전체·진행·완료 프로젝트 일정과 월/일 간트 보기
- `/projects/:projectId`: 공정 그룹, 세부 작업, 담당자, 휴일·휴가를 반영한 일정 보기
- 한국·베트남 근무일, 공휴일, 베트남 토요일 근무, 개인 휴가 반영
- 프로젝트 완료·복원, 일정 이동, 작업 충돌, 외부 연동 API
- A4/A3 인쇄 보고서와 색상/흑백 달력 패턴

## 기술 구성

- React 18, TypeScript, React Router 7, Vite 8, Tailwind CSS
- Cloudflare Workers, D1, Workers AI, 정적 자산 바인딩
- Vitest 4, Playwright, Wrangler 4

## 로컬 실행

```bash
npm install
npm run d1:migrate:local
npm run build
```

두 터미널에서 Worker와 Vite를 각각 실행합니다.

```bash
# 터미널 1: 로컬 D1을 사용하는 Worker API
npm run dev:worker

# 터미널 2: 프런트엔드 개발 서버
npm run dev
```

Vite의 `/api` 프록시는 기본적으로 `http://127.0.0.1:8787`만 사용합니다. QA 데이터가 바뀌는 원격 테스트는 일반 테스트와 분리돼 있습니다.

## 검증 명령

```bash
npm run typecheck
npm run typecheck:worker-bindings
npm run lint
npm test
npm run build
```

`npm test`는 로컬 단위·계약 테스트만 실행합니다. 실제 QA D1을 변경하는 테스트는 의도적으로 별도 명령으로만 실행됩니다.

```bash
npm run test:qa-remote
```

## 배포

직접 `wrangler deploy`를 실행하지 않습니다. 배포 스크립트가 커밋 SHA와 배포 시각을 주입하고, 무결성 검사와 QA 브라우저 게이트를 통과한 증거를 생성합니다.

```powershell
# 1. 커밋된 깨끗한 작업 트리에서 QA 배포·검증
powershell -ExecutionPolicy Bypass -File scripts/deploy-qa-release.ps1

# 2. QA 증거 확인 및 운영 배포 승인 후
powershell -ExecutionPolicy Bypass -File scripts/deploy-production-release.ps1 -ReleaseSha <검증된 전체 SHA>
```

세부 절차는 [docs/RELEASE.md](docs/RELEASE.md), D1 변경 규칙은 [docs/MIGRATION_POLICY.md](docs/MIGRATION_POLICY.md)를 참고합니다.
