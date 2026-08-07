# examples/integration/scheduler-client.ps1
# PowerShell Example Client for CON-COST Dev Scheduler Integration API v1

$baseUrl = $env:SCHEDULER_API_URL
if (-not $baseUrl) { $baseUrl = "https://concost-dev-scheduler-qa.eumditravel.workers.dev" }

$apiKey = $env:SCHEDULER_API_KEY
if (-not $apiKey) { $apiKey = "sched_live_example_token" }

$headers = @{
  "Content-Type"  = "application/json"
  "Authorization" = "Bearer $apiKey"
}

# 1. Health Check
$health = Invoke-RestMethod -Uri "$baseUrl/api/integrations/v1/health" -Method Get
Write-Host "Health: $($health | ConvertTo-Json -Compress)"

# 2. Upsert Task
$body = @{
  source = "powershell-ci"
  external_id = "ps-task-202"
  task_name = "PowerShell Build Artifact Upload Task"
  start_date = "2026-08-20"
  end_date = "2026-08-22"
  assignees = @(
    @{ worker_id = "wrk_03"; allocation_percent = 100 }
  )
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod -Uri "$baseUrl/api/integrations/v1/tasks/upsert" -Method Post -Headers $headers -Body $body
Write-Host "Upsert Result: $($result | ConvertTo-Json -Compress)"
