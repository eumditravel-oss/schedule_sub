#!/usr/bin/env node
// scripts/scheduler-sync.mjs
// CLI Synchronization tool for CON-COST Dev Scheduler Generic Integration API v1

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log(`
CON-COST Dev Scheduler Sync CLI

Usage:
  node scripts/scheduler-sync.mjs <file.json> [--dry-run | --apply] [--endpoint <URL>] [--key <TOKEN>]

Options:
  --dry-run   Preview synchronization changes without mutating database (DEFAULT)
  --apply     Execute actual database synchronization
  --endpoint  Worker API Base URL (Default: https://concost-dev-scheduler-qa.eumditravel.workers.dev)
  --key       API Key Token (or set SCHEDULER_API_KEY environment variable)
`);
  process.exit(0);
}

const jsonFilePath = args[0];
const isApply = args.includes('--apply');
const isDryRun = args.includes('--dry-run') || !isApply;

const endpointIdx = args.indexOf('--endpoint');
const keyIdx = args.indexOf('--key');

const baseUrl =
  endpointIdx !== -1
    ? args[endpointIdx + 1]
    : process.env.SCHEDULER_API_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

const apiKey =
  keyIdx !== -1
    ? args[keyIdx + 1]
    : process.env.SCHEDULER_API_KEY || '';

if (!apiKey) {
  console.error('Error: API Key token is required. Use --key <TOKEN> or set SCHEDULER_API_KEY env var.');
  process.exit(1);
}

if (!fs.existsSync(jsonFilePath)) {
  console.error(`Error: File '${jsonFilePath}' not found.`);
  process.exit(1);
}

async function syncSchedule() {
  const content = fs.readFileSync(jsonFilePath, 'utf8');
  const payload = JSON.parse(content);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const source = payload.source || 'cli-sync';

  console.log(`🚀 Starting Scheduler Sync from '${jsonFilePath}' to ${baseUrl} [${isDryRun ? 'DRY-RUN PREVIEW' : 'ACTUAL APPLY'}]...`);

  const tasks = payload.tasks || [];
  if (tasks.length === 0) {
    console.log('⚠️ No tasks found in payload file.');
    return;
  }

  const formattedTasks = tasks.map((t) => ({
    source,
    external_id: t.external_id,
    project_external_id: payload.project?.external_id,
    task_group_external_id: payload.task_group?.external_id,
    task_name: t.task_name,
    start_date: t.start_date || null,
    end_date: t.end_date || null,
    primary_worker_name: t.primary_worker_name || t.worker_name,
    support_worker_names: t.support_worker_names || [],
    schedule_status: t.schedule_status || 'SCHEDULED',
    progress_mode: t.progress_mode || 'AUTO_TIME',
  }));

  const url = `${baseUrl}/api/integrations/v1/tasks/batch-upsert${isDryRun ? '?dry_run=true' : ''}`;
  const batchRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source,
      dry_run: isDryRun,
      tasks: formattedTasks,
    }),
  });

  if (!batchRes.ok) {
    const err = await batchRes.json();
    console.error('❌ Batch Upsert Failed:', err);
    process.exit(1);
  }

  const batchData = await batchRes.json();

  if (isDryRun) {
    console.log('\n🔍 [DRY-RUN PREVIEW SUMMARY]');
    console.log(`• Run ID: ${batchData.run_id}`);
    console.log(`• Total Processed: ${batchData.total_processed}`);
    console.log(`• Would Create: ${batchData.would_create}`);
    console.log(`• Would Update: ${batchData.would_update}`);
    console.log(`• Would Skip: ${batchData.would_skip}`);
    console.log('\n📋 Proposed Changes Preview:');
    (batchData.changes || []).forEach((c, idx) => {
      console.log(`  ${idx + 1}. [${c.action}] External ID: ${c.external_id} | Task: ${c.task_name}`);
      if (c.action === 'UPDATE') {
        console.log(`     Before: ${c.before?.start_date} ~ ${c.before?.end_date}`);
        console.log(`     After:  ${c.after?.start_date} ~ ${c.after?.after_end_date || c.after?.end_date}`);
      }
    });
    console.log('\n💡 Dry-run completed with ZERO database mutations. Execute with --apply to apply changes.');
  } else {
    console.log('\n✅ [SYNCHRONIZATION COMPLETE]');
    console.log(`• Run ID: ${batchData.run_id}`);
    console.log(`• Created Count: ${batchData.created_count}`);
    console.log(`• Updated Count: ${batchData.updated_count}`);
    console.log(`• Failed Count: ${batchData.failed_count}`);
  }
}

syncSchedule().catch((err) => {
  console.error('❌ CLI Execution Error:', err);
  process.exit(1);
});
