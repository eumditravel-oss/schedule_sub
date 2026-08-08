# scripts/deploy-release.ps1
# Automated release script for CON-COST Dev Scheduler

$ErrorActionPreference = "Stop"

# 1. Verify working directory is clean
$status = (git status --porcelain)
if ($status) {
  Write-Error "Git working directory is not clean. Please commit or stash changes before releasing."
  exit 1
}

# 2. Extract git full commit SHA
$sha = (git rev-parse HEAD).Trim()
$deployedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host "Releasing Commit SHA: $sha deployed at $deployedAt" -ForegroundColor Green

# 3. Build frontend production dist bundle
$env:VITE_BUILD_SHA = $sha
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm run build failed."
  exit 1
}

# 3.5 Verify D1 Database Required Schema (Preflight Guard)
Write-Host "Verifying QA D1 Database Schema Preflight..." -ForegroundColor Yellow
$qaSchemaCheck = (cmd /c "npx wrangler d1 execute concost-db-qa -e qa --remote --command=""PRAGMA table_info(tasks);""") | Out-String
if ($qaSchemaCheck -notmatch "schedule_revision") {
  Write-Error "SCHEMA_MIGRATION_REQUIRED: QA D1 database tasks table is missing required column schedule_revision."
  exit 1
}

Write-Host "Verifying Production D1 Database Schema Preflight..." -ForegroundColor Yellow
$prodSchemaCheck = (cmd /c "npx wrangler d1 execute concost-db --remote --command=""PRAGMA table_info(tasks);""") | Out-String
if ($prodSchemaCheck -notmatch "schedule_revision") {
  Write-Error "SCHEMA_MIGRATION_REQUIRED: Production D1 database tasks table is missing required column schedule_revision."
  exit 1
}

# 4. Deploy QA Worker
Write-Host "Deploying QA Worker..." -ForegroundColor Yellow
cmd /c "npx wrangler deploy -e qa --var BUILD_SHA:$sha --var ENVIRONMENT_NAME:qa --var DEPLOYED_AT:$deployedAt"
if ($LASTEXITCODE -ne 0) {
  Write-Error "QA Worker deployment failed."
  exit 1
}

# 4.5 Verify QA Completion Integrity Health Check
Write-Host "Verifying QA Completion Integrity Health Check..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
try {
  $qaHealthRes = Invoke-RestMethod -Uri "https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/health/completion-integrity" -Method Get
  $qaData = $qaHealthRes.data
  if ($qaData.inconsistent_projects -gt 0 -or $qaData.inconsistent_tasks -gt 0) {
    Write-Error "COMPLETION_INTEGRITY_REGRESSION: QA environment has $($qaData.inconsistent_projects) inconsistent projects and $($qaData.inconsistent_tasks) inconsistent tasks."
    exit 1
  }
  Write-Host "QA Completion Integrity Verification Passed (Completed Projects: $($qaData.completed_projects), Inconsistent Projects: $($qaData.inconsistent_projects), Inconsistent Tasks: $($qaData.inconsistent_tasks))" -ForegroundColor Green
} catch {
  Write-Error "QA Completion Integrity Health Check request failed: $_"
  exit 1
}

# 5. Run QA Critical Release Gate Spec Suite (17 Specs)
Write-Host "Running QA Critical Release Gate Verification (17 Specs)..." -ForegroundColor Yellow
$criticalReleaseSpecs = @(
  "tests/e2e/gantt-inline-content.spec.ts",
  "tests/e2e/task-modal-runtime.spec.ts",
  "tests/e2e/mobile-logo-header.spec.ts",
  "tests/e2e/vietnam-saturday-calendar.spec.ts",
  "tests/e2e/final-hierarchy-and-compact.spec.ts",
  "tests/e2e/mobile-progress-contract.spec.ts",
  "tests/e2e/mobile-week-agenda.spec.ts",
  "tests/e2e/mobile-thirty-day-calendar.spec.ts",
  "tests/e2e/open-api-production-entry.spec.ts",
  "tests/e2e/integration-key-management-ui.spec.ts",
  "tests/e2e/header-all-tab-api-responsive.spec.ts",
  "tests/e2e/project-all-status-tab.spec.ts",
  "tests/e2e/project-overview-name-readability.spec.ts",
  "tests/e2e/today-summary-monthly-completion.spec.ts",
  "tests/e2e/task-group-drag-drop.spec.ts",
  "tests/e2e/completion-integrity-guard.spec.ts",
  "tests/e2e/project-actions-regression.spec.ts"
)

foreach ($testFile in $criticalReleaseSpecs) {
  Write-Host "Running Critical Release Gate Spec: $testFile" -ForegroundColor Cyan
  cmd /c "npx playwright test --workers=1 --project=chromium $testFile"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "QA Critical Release Gate verification failed on $testFile."
    exit 1
  }
}

# 6. Deploy Production Worker
Write-Host "Deploying Production Worker..." -ForegroundColor Yellow
cmd /c "npx wrangler deploy --var BUILD_SHA:$sha --var ENVIRONMENT_NAME:production --var DEPLOYED_AT:$deployedAt"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Production Worker deployment failed."
  exit 1
}

# 6.5 Verify Production Completion Integrity Health Check
Write-Host "Verifying Production Completion Integrity Health Check..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
try {
  $prodHealthRes = Invoke-RestMethod -Uri "https://concost-dev-scheduler.eumditravel.workers.dev/api/health/completion-integrity" -Method Get
  $prodData = $prodHealthRes.data
  if ($prodData.inconsistent_projects -gt 0 -or $prodData.inconsistent_tasks -gt 0) {
    Write-Error "COMPLETION_INTEGRITY_REGRESSION: Production environment has $($prodData.inconsistent_projects) inconsistent projects and $($prodData.inconsistent_tasks) inconsistent tasks."
    exit 1
  }
  Write-Host "Production Completion Integrity Verification Passed (Completed Projects: $($prodData.completed_projects), Inconsistent Projects: $($prodData.inconsistent_projects), Inconsistent Tasks: $($prodData.inconsistent_tasks))" -ForegroundColor Green
} catch {
  Write-Error "Production Completion Integrity Health Check request failed: $_"
  exit 1
}

Write-Host "Release completed successfully for SHA $sha!" -ForegroundColor Green
