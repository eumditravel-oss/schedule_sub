# scripts/deploy-production-release.ps1
# Production Deployment Script for CON-COST Dev Scheduler (Requires Explicit Approved Release SHA)

param(
  [string]$ReleaseSha
)

$ErrorActionPreference = "Stop"

if (-not $ReleaseSha -or $ReleaseSha.Trim() -eq "") {
  Write-Error "RELEASE_SHA_REQUIRED: You must specify -ReleaseSha <approved-sha> to deploy to Production."
  exit 1
}

$ReleaseSha = $ReleaseSha.Trim()

# 1. Verify working directory is clean
$status = (git status --porcelain -uno)
if ($status) {
  Write-Error "Git working directory is not clean. Please commit or stash changes before deploying."
  exit 1
}

# 2. Verify git HEAD commit SHA matches ReleaseSha
$headSha = (git rev-parse HEAD).Trim()
if ($headSha -ne $ReleaseSha) {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: Git HEAD ($headSha) does not match the provided -ReleaseSha ($ReleaseSha)."
  exit 1
}

# 3. PRE-DEPLOYMENT QA VERIFICATION (Must pass BEFORE Wrangler deploy is ever called)
Write-Host "Verifying Production Pre-Deployment QA Verification Manifest..." -ForegroundColor Yellow

$evidencePath = "$PSScriptRoot/../qa/verified-release.json"
if (-not (Test-Path $evidencePath)) {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: Missing QA evidence manifest qa/verified-release.json. Run scripts/deploy-qa-release.ps1 first."
  exit 1
}

$evidenceContent = Get-Content $evidencePath | ConvertTo-Json -Depth 4 | ConvertFrom-Json
$evidence = Get-Content $evidencePath -Raw | ConvertFrom-Json

if ($evidence.sha -ne $ReleaseSha) {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: qa/verified-release.json SHA ($($evidence.sha)) does not match ReleaseSha ($ReleaseSha)."
  exit 1
}

if ($evidence.core_gate_passed -ne 21) {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: qa/verified-release.json core_gate_passed ($($evidence.core_gate_passed)) is not 21."
  exit 1
}

if ($evidence.phase_b_gate_passed -ne 4) {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: qa/verified-release.json phase_b_gate_passed ($($evidence.phase_b_gate_passed)) is not 4."
  exit 1
}

if ([int]$evidence.remote_request_count -gt 1500) {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: qa/verified-release.json remote_request_count ($($evidence.remote_request_count)) exceeded 1500 limit."
  exit 1
}

# Live QA /api/version Query (1 call)
Write-Host "Querying Live QA Environment /api/version..." -ForegroundColor Yellow
try {
  $qaVersionRes = Invoke-RestMethod -Uri "https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/version" -Method Get
  $liveQaSha = $qaVersionRes.data.commit
  if ($liveQaSha -ne $ReleaseSha) {
    Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: Live QA /api/version commit ($liveQaSha) does not match ReleaseSha ($ReleaseSha)."
    exit 1
  }
  Write-Host "Live QA Runtime SHA Verification Passed: $liveQaSha" -ForegroundColor Green
} catch {
  Write-Error "PRODUCTION_RELEASE_NOT_QA_VERIFIED: Failed to query Live QA /api/version: $_"
  exit 1
}

$deployedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host "Pre-Deployment Verification PASSED. Deploying Approved Commit SHA: $ReleaseSha to PRODUCTION at $deployedAt" -ForegroundColor Green

# 4. Build frontend production dist bundle
$env:VITE_BUILD_SHA = $ReleaseSha
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm run build failed."
  exit 1
}

# 5. Verify Production D1 Database Schema Preflight
Write-Host "Verifying Production D1 Database Schema Preflight..." -ForegroundColor Yellow
cmd /c "node scripts/check-schema.cjs production"
if ($LASTEXITCODE -ne 0) {
  Write-Error "SCHEMA_MIGRATION_REQUIRED: Production D1 database tasks table is missing required column schedule_revision."
  exit 1
}

# 6. Deploy Production Worker
Write-Host "Deploying Production Worker..." -ForegroundColor Yellow
cmd /c "npx wrangler deploy --var BUILD_SHA:$ReleaseSha --var ENVIRONMENT_NAME:production"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Production Worker deployment failed."
  exit 1
}

# 7. Verify Production Completion Integrity Health Check & Golden Smoke
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

# 8. Perform Bounded 5-Way SHA Verification (Max 3 retries)
Write-Host "Performing Bounded 5-Way SHA Verification (Max 3 retries)..." -ForegroundColor Yellow
$qaVer = ""
$prodVer = ""
$retry = 0

while ($retry -lt 3) {
  try {
    $nowTicks = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $qaVer = (Invoke-RestMethod -Uri "https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/version?t=$nowTicks" -Headers @{ "Cache-Control" = "no-cache" }).data.commit
    $prodVer = (Invoke-RestMethod -Uri "https://concost-dev-scheduler.eumditravel.workers.dev/api/version?t=$nowTicks" -Headers @{ "Cache-Control" = "no-cache" }).data.commit
    if ($qaVer -eq $ReleaseSha -and $prodVer -eq $ReleaseSha) {
      break
    }
  } catch {}
  $retry++
  Start-Sleep -Seconds 3
}

if ($ReleaseSha -ne $qaVer -or $ReleaseSha -ne $prodVer) {
  Write-Error "BUILD_SHA_MISMATCH: Git HEAD ($ReleaseSha) does not match QA ($qaVer) or Production ($prodVer)."
  exit 1
}
Write-Host "5-Way SHA Verification Passed for PRODUCTION: $ReleaseSha" -ForegroundColor Green

# 9. Ensure Git working directory remains clean
$postStatus = (git status --porcelain -uno)
if ($postStatus) {
  Write-Error "GIT_DIRTY_AFTER_RELEASE: Production deployment caused unexpected modifications to tracked git files."
  exit 1
}

Write-Host "Production Deployment successfully completed for Approved SHA $ReleaseSha!" -ForegroundColor Green
