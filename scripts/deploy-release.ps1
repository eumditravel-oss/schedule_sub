# scripts/deploy-release.ps1
# Master Release Entrypoint for CON-COST Dev Scheduler

param(
  [Parameter(Mandatory=$false)]
  [string]$Target,

  [Parameter(Mandatory=$false)]
  [string]$ReleaseSha
)

$ErrorActionPreference = "Stop"

if (-not $Target -or ($Target -ne "QA" -and $Target -ne "Production")) {
  Write-Error "RELEASE_TARGET_REQUIRED: You must specify -Target QA or -Target Production. Automatic pipeline execution without an explicit target parameter is prohibited."
  exit 1
}

if ($Target -eq "QA") {
  Write-Host "Routing deployment request to QA Pipeline..." -ForegroundColor Yellow
  powershell -ExecutionPolicy Bypass -File scripts/deploy-qa-release.ps1
  exit $LASTEXITCODE
}

if ($Target -eq "Production") {
  if (-not $ReleaseSha) {
    Write-Error "RELEASE_SHA_REQUIRED: Deploying to Production requires an explicit approved -ReleaseSha parameter."
    exit 1
  }
  Write-Host "Routing deployment request to Production Pipeline for approved SHA $ReleaseSha..." -ForegroundColor Yellow
  powershell -ExecutionPolicy Bypass -File scripts/deploy-production-release.ps1 -ReleaseSha $ReleaseSha
  exit $LASTEXITCODE
}
