# 릴리스 절차

## 원칙

- QA와 운영은 별도 Worker와 D1을 사용합니다.
- 모든 배포는 하나의 커밋 전체 SHA를 기준으로 합니다.
- 실행하지 않은 테스트나 확인하지 않은 화면 SHA를 `PASS`로 기록하지 않습니다.
- 완료 무결성과 스케줄러 전체 무결성이 모두 `PASS`여야 합니다.
- 운영 배포는 QA 검증 후 사용자의 명시적인 승인으로 진행합니다.

## QA

1. 변경사항을 커밋하고 작업 트리가 깨끗한지 확인합니다.
2. `scripts/deploy-qa-release.ps1`을 실행합니다.
3. 스크립트는 빌드, D1 스키마 사전 점검, QA 배포, 두 무결성 검사, Chromium 릴리스 게이트, 런타임 SHA 검증을 순서대로 수행합니다.
4. 성공하면 `qa/verified-release.json`과 `qa/release-report.json`이 생성됩니다. 이 파일들은 실행 증거이며 Git에는 커밋하지 않습니다.

## 운영

1. QA 증거의 SHA, 테스트 수, 요청 예산, 완료·스케줄러 무결성을 확인합니다.
2. 운영 배포 승인을 받은 뒤 다음 명령을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-production-release.ps1 -ReleaseSha <QA에서 검증된 전체 SHA>
```

3. 스크립트가 운영 D1 사전 점검, 배포, 완료·스케줄러 무결성, QA/운영 SHA 일치를 확인합니다.

## 롤백

배포 뒤 중대한 문제가 확인되면 추가 데이터 변경을 중단하고 Cloudflare Workers 버전 롤백을 우선 검토합니다. D1 스키마나 데이터가 함께 변경된 경우 Worker 롤백만으로 복구되지 않을 수 있으므로, 해당 마이그레이션의 복구 절차와 백업을 별도로 확인해야 합니다.
