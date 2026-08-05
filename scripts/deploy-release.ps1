# scripts/deploy-release.ps1
# Automated release script for CON-COST Dev Scheduler

$ErrorActionPreference = "Stop"

# 1. Verify working directory is clean
$status = (git status --porcelain)
if ($status) {
  Write-Error "Git working directory is not clean. Please commit or stash changes before releasing."
  exit 1
}

# 2. Extract git short commit SHA
$sha = (git rev-parse --short HEAD).Trim()
$deployedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host "Releasing Commit SHA: $sha deployed at $deployedAt" -ForegroundColor Green

# 3. Build frontend production dist bundle
$env:VITE_BUILD_SHA = $sha
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm run build failed."
  exit 1
}

# 4. Deploy QA Worker
Write-Host "Deploying QA Worker..." -ForegroundColor Yellow
cmd /c "npx wrangler deploy -e qa --var BUILD_SHA:$sha --var ENVIRONMENT_NAME:qa --var DEPLOYED_AT:$deployedAt"
if ($LASTEXITCODE -ne 0) {
  Write-Error "QA Worker deployment failed."
  exit 1
}

# 5. Run QA E2E Test Suite
Write-Host "Running QA E2E Verification..." -ForegroundColor Yellow
cmd /c "npx playwright test tests/e2e/gantt-inline-content.spec.ts tests/e2e/project-actions-regression.spec.ts tests/e2e/task-modal-runtime.spec.ts"
if ($LASTEXITCODE -ne 0) {
  Write-Error "QA E2E verification failed."
  exit 1
}

# 6. Deploy Production Worker
Write-Host "Deploying Production Worker..." -ForegroundColor Yellow
cmd /c "npx wrangler deploy --var BUILD_SHA:$sha --var ENVIRONMENT_NAME:production --var DEPLOYED_AT:$deployedAt"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Production Worker deployment failed."
  exit 1
}

Write-Host "Release completed successfully for SHA $sha!" -ForegroundColor Green
