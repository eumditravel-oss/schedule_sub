# scripts/deploy-qa-release.ps1
# QA Release & Critical Gate Verification Script for CON-COST Dev Scheduler

$ErrorActionPreference = "Stop"

$globalQaBudget = 1500

# 1. Verify working directory is clean
$status = (git status --porcelain)
if ($status) {
  Write-Error "Git working directory is not clean. Please commit or stash changes before releasing."
  exit 1
}

# 2. Extract git full commit SHA
$sha = (git rev-parse HEAD).Trim()
$deployedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host "Releasing Candidate Commit SHA: $sha to QA at $deployedAt (Global QA Budget: $globalQaBudget)" -ForegroundColor Green

# 3. Build frontend production dist bundle
$env:VITE_BUILD_SHA = $sha
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm run build failed."
  exit 1
}

# 3.5 Verify D1 Database Required Schema (Preflight Guard)
Write-Host "Verifying QA D1 Database Schema Preflight..." -ForegroundColor Yellow
cmd /c "node scripts/check-schema.cjs qa"
if ($LASTEXITCODE -ne 0) {
  Write-Error "SCHEMA_MIGRATION_REQUIRED: QA D1 database tasks table is missing required column schedule_revision."
  exit 1
}

# 4. Deploy QA Worker
Write-Host "Deploying QA Worker..." -ForegroundColor Yellow
cmd /c "npx wrangler deploy -e qa --var BUILD_SHA:$sha --var BUILD_TIMESTAMP:$deployedAt --var DEPLOYED_AT:$deployedAt --var ENVIRONMENT_NAME:qa"
if ($LASTEXITCODE -ne 0) {
  Write-Error "QA Worker deployment failed."
  exit 1
}

# 4.5 Verify QA Completion and Scheduler Integrity Health Checks (Max 3 retries, 5s backoff)
Write-Host "Verifying QA Completion and Scheduler Integrity Health Checks (Max 3 retries, 5s backoff)..." -ForegroundColor Yellow
$qaHealthRequestCount = 0
$qaVerified = $false
for ($retry = 0; $retry -lt 3; $retry++) {
  try {
    Start-Sleep -Seconds 5
    $qaHealthRequestCount++
    $qaHealthRes = Invoke-RestMethod -Uri "https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/health/completion-integrity" -Method Get
    $qaData = $qaHealthRes.data
    if ($qaData.inconsistent_projects -gt 0 -or $qaData.inconsistent_tasks -gt 0) {
      Write-Error "COMPLETION_INTEGRITY_REGRESSION: QA environment has $($qaData.inconsistent_projects) inconsistent projects and $($qaData.inconsistent_tasks) inconsistent tasks."
      exit 1
    }
    $qaHealthRequestCount++
    $qaSchedulerRes = Invoke-RestMethod -Uri "https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/health/scheduler-integrity" -Method Get
    $qaSchedulerData = $qaSchedulerRes.data
    if ($qaSchedulerData.status -ne "PASS") {
      Write-Error "SCHEDULER_INTEGRITY_REGRESSION: QA scheduler integrity status is $($qaSchedulerData.status)."
      exit 1
    }
    Write-Host "QA Completion and Scheduler Integrity Verification Passed (Scheduler: $($qaSchedulerData.status), Inconsistent Projects: $($qaData.inconsistent_projects), Inconsistent Tasks: $($qaData.inconsistent_tasks))" -ForegroundColor Green
    $qaVerified = $true
    break
  } catch {
    Write-Host "QA Health check attempt $($retry + 1) failed ($($_)), retrying in 5s..." -ForegroundColor Yellow
  }
}
if (-not $qaVerified) {
  Write-Error "QA Completion Integrity Health Check failed after retries."
  exit 1
}

# 5. DYNAMIC PROXY BUDGET CALCULATION & FAIL-BEFORE-PROXY GUARD
$versionReserveCount = 1
$proxyBudget = $globalQaBudget - $qaHealthRequestCount - $versionReserveCount
Write-Host "Calculated Proxy Budget: $proxyBudget (Global: $globalQaBudget, Health Used: $qaHealthRequestCount, Version Reserved: $versionReserveCount)" -ForegroundColor Yellow

if ($proxyBudget -le 0) {
  Write-Error "RELEASE_REQUEST_BUDGET_EXCEEDED: QA Health check consumed entire request budget ($qaHealthRequestCount requests). Proxy execution aborted."
  exit 1
}

# 5.5 Start Local QA Counting Proxy Server with Calculated Budget
Write-Host "Starting Local QA Counting Proxy on http://127.0.0.1:4179 (Budget: $proxyBudget)..." -ForegroundColor Yellow
$env:PROXY_REQUEST_BUDGET = [string]$proxyBudget
$nodePath = (Get-Command node -ErrorAction Stop).Source
$proxyScriptPath = (Resolve-Path "$PSScriptRoot/qa-request-proxy.mjs").Path
$proxyWorkingDirectory = (Resolve-Path "$PSScriptRoot/..").Path
$proxyProcess = Start-Process -FilePath $nodePath -ArgumentList @($proxyScriptPath) -WorkingDirectory $proxyWorkingDirectory -WindowStyle Hidden -PassThru

$proxyReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  $proxyProcess.Refresh()
  if ($proxyProcess.HasExited) {
    break
  }
  try {
    $proxyStartupEvidence = Invoke-RestMethod -Uri "http://127.0.0.1:4179/__proxy_evidence" -Method Get -TimeoutSec 2
    if ($proxyStartupEvidence.budget -eq $proxyBudget) {
      $proxyReady = $true
      break
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}

if (-not $proxyReady) {
  if (-not $proxyProcess.HasExited) {
    Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Write-Error "QA_PROXY_START_FAILED: Counting proxy did not become ready on 127.0.0.1:4179."
  exit 1
}
Write-Host "QA Counting Proxy readiness verification passed." -ForegroundColor Green

# Reset Proxy Counter
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:4179/__proxy_reset" -Method Post | Out-Null
} catch {
  Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
  Write-Error "QA_PROXY_RESET_FAILED: $_"
  exit 1
}

# 6. Run QA Release Gate Suite (21 Core + 4 Phase B = 25 Total Specs)
Write-Host "Running QA Release Gate Verification (21 Core + 4 Phase B = 25 Total Specs) via Proxy..." -ForegroundColor Yellow
$env:TEST_BASE_URL = "http://127.0.0.1:4179"

$coreSpecs = @(
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
  "tests/e2e/project-actions-regression.spec.ts",
  "tests/e2e/deadline-real-engine-parity.spec.ts",
  "tests/e2e/cross-project-primary-conflict-regression.spec.ts",
  "tests/e2e/warning-explainability.spec.ts",
  "tests/e2e/task-save-persistence-gantt-regression.spec.ts"
)

$phaseBSpecs = @(
  "tests/e2e/runtime-react-crash-regression.spec.ts",
  "tests/e2e/vietnam-bulk-holiday-save-regression.spec.ts",
  "tests/e2e/holiday-editor-cross-country-permission.spec.ts",
  "tests/e2e/upcoming-progress-ux.spec.ts"
)

$allSpecs = $coreSpecs + $phaseBSpecs

Write-Host "Core Critical Specs: $($coreSpecs.Count)/21" -ForegroundColor Cyan
Write-Host "Phase B Acceptance Specs: $($phaseBSpecs.Count)/4" -ForegroundColor Cyan
Write-Host "Total Release Specs: $($allSpecs.Count)/25" -ForegroundColor Cyan

foreach ($testFile in $allSpecs) {
  Write-Host "Running QA Release Gate Spec: $testFile" -ForegroundColor Cyan
  cmd /c "npx playwright test --workers=1 --project=chromium $testFile"
  if ($LASTEXITCODE -ne 0) {
    # Check proxy evidence for budget_exceeded before exiting
    try {
      $evidenceCheck = Invoke-RestMethod -Uri "http://127.0.0.1:4179/__proxy_evidence" -Method Get
      if ($evidenceCheck.budget_exceeded) {
        Write-Error "RELEASE_REQUEST_BUDGET_EXCEEDED: Proxy request budget limit reached ($($evidenceCheck.forwarded_requests)/$($evidenceCheck.budget)). Remaining specs cancelled."
      }
      Invoke-RestMethod -Uri "http://127.0.0.1:4179/__proxy_stop" -Method Post | Out-Null
    } catch {}
    Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Error "QA Release Gate verification failed on $testFile."
    exit 1
  }
}

# 7. Retrieve Measured HTTP Requests from Local Proxy & Stop Proxy Server
$measuredE2ERequests = 0
try {
  $proxyEvidence = Invoke-RestMethod -Uri "http://127.0.0.1:4179/__proxy_stop" -Method Post
  $measuredE2ERequests = [int]$proxyEvidence.forwarded_requests
} catch {}
Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue

# 7.5 VERSION REQUEST PRE-CHECK & QUERY
$projectedTotal = $qaHealthRequestCount + $measuredE2ERequests + $versionReserveCount
if ($projectedTotal -gt $globalQaBudget) {
  Write-Error "RELEASE_REQUEST_BUDGET_EXCEEDED: Health ($qaHealthRequestCount) + E2E ($measuredE2ERequests) + Version (1) projected total ($projectedTotal) exceeds global budget ($globalQaBudget). Version check aborted."
  exit 1
}

Write-Host "Querying Live QA Environment /api/version..." -ForegroundColor Yellow
$qaRuntimeSha = ""
try {
  $nowTicks = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $qaVerRes = Invoke-RestMethod -Uri "https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/version?t=$nowTicks" -Headers @{ "Cache-Control" = "no-cache" }
  $qaRuntimeSha = $qaVerRes.data.commit
  if ($qaRuntimeSha -ne $sha) {
    Write-Error "QA_RUNTIME_SHA_MISMATCH: Live QA Worker version commit ($qaRuntimeSha) does not match candidate SHA ($sha)."
    exit 1
  }
  Write-Host "Live QA Runtime SHA Verification Passed: $qaRuntimeSha" -ForegroundColor Green
} catch {
  Write-Error "Failed to query Live QA /api/version: $_"
  exit 1
}

# 7.6 TOTAL QA WORKER REQUEST VERIFICATION
$totalQAWorkerRequests = $qaHealthRequestCount + $measuredE2ERequests + $versionReserveCount
$remainingBudget = $globalQaBudget - $totalQAWorkerRequests

Write-Host "Measured Total Remote QA Requests: $totalQAWorkerRequests (Health: $qaHealthRequestCount, E2E: $measuredE2ERequests, Version: 1, Remaining: $remainingBudget)" -ForegroundColor Yellow

if ($totalQAWorkerRequests -gt $globalQaBudget) {
  Write-Error "RELEASE_REQUEST_BUDGET_EXCEEDED: Actual total QA Worker request count ($totalQAWorkerRequests) exceeded global budget ($globalQaBudget)."
  exit 1
}
Write-Host "Global Request Budget Verification Passed (Total: $totalQAWorkerRequests <= Limit: $globalQaBudget)" -ForegroundColor Green

# 8. Generate Untracked Evidence Manifest: qa/verified-release.json
Write-Host "Generating Untracked Evidence Manifest (qa/verified-release.json)..." -ForegroundColor Yellow
$evidenceObj = @{
  sha = $sha
  qa_runtime_sha = $qaRuntimeSha
  core_gate_passed = 21
  phase_b_gate_passed = 4
  total_gate_passed = 25
  global_request_budget = $globalQaBudget
  health_requests = $qaHealthRequestCount
  e2e_forwarded_requests = $measuredE2ERequests
  version_requests = 1
  total_remote_requests = $totalQAWorkerRequests
  remote_request_count = $totalQAWorkerRequests
  remaining_budget = $remainingBudget
  completion_integrity = "PASS"
  scheduler_integrity = "PASS"
  verified_at = $deployedAt
}
$evidenceJson = $evidenceObj | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText("$PSScriptRoot/../qa/verified-release.json", $evidenceJson)

# 9. Generate untracked QA Release Evidence Reports
Write-Host "Generating QA Release Evidence Reports..." -ForegroundColor Yellow
cmd /c "node scripts/generate-test-inventory.mjs"
$env:RELEASE_FRONTEND_SHA = $sha
$env:RELEASE_BUILD_INDICATOR_SHA = $sha
$env:RELEASE_GATE_STATUS = "PASS"
$env:RELEASE_CHROMIUM_STATUS = "PASS"
cmd /c "node scripts/generate-release-report.mjs"

# 10. Ensure Git working directory remains clean (except untracked qa/ artifacts)
$postStatus = (git status --porcelain -uno)
if ($postStatus) {
  Write-Error "GIT_DIRTY_AFTER_RELEASE: QA release pipeline caused unexpected modifications to tracked git files."
  exit 1
}

Write-Host "QA Release and 25-Spec Verification completed successfully for SHA $sha!" -ForegroundColor Green
Write-Host "NOTE: Production deployment is BLOCKED. To deploy to Production after approval, use scripts/deploy-production-release.ps1 -ReleaseSha $sha" -ForegroundColor Yellow
