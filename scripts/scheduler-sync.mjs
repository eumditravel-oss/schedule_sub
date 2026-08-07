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
  node scripts/scheduler-sync.mjs <file.json> [--endpoint <URL>] [--key <TOKEN>]

Options:
  --endpoint  Worker API Base URL (Default: https://concost-dev-scheduler-qa.eumditravel.workers.dev)
  --key       API Key Token (or set SCHEDULER_API_KEY environment variable)
`);
  process.exit(0);
}

const jsonFilePath = args[0];
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

  console.log(`🚀 Starting Scheduler Sync from '${jsonFilePath}' to ${baseUrl}...`);

  // Step 1: Project Upsert
  let projectExternalId = payload.project?.external_id;
  if (payload.project && payload.project.name) {
    console.log(`📁 Synchronizing Project: ${payload.project.name}...`);
    const prjRes = await fetch(`${baseUrl}/api/integrations/v1/projects/upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source,
        external_id: payload.project.external_id,
        name: payload.project.name,
        start_date: payload.project.start_date || '2026-08-01',
        end_date: payload.project.end_date || '2026-08-31',
      }),
    });

    if (!prjRes.ok) {
      const err = await prjRes.json();
      console.error('❌ Project Upsert Failed:', err);
      process.exit(1);
    }
    const prjData = await prjRes.json();
    console.log(`✅ Project Synced: ID=${prjData.project.id} (Created: ${prjData.created})`);
  }

  // Step 2: Task Group Upsert
  let groupExternalId = payload.task_group?.external_id;
  if (payload.task_group && payload.task_group.group_name) {
    console.log(`📂 Synchronizing Task Group: ${payload.task_group.group_name}...`);
    const grpRes = await fetch(`${baseUrl}/api/integrations/v1/task-groups/upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source,
        external_id: payload.task_group.external_id,
        project_external_id: projectExternalId,
        group_name: payload.task_group.group_name,
      }),
    });

    if (!grpRes.ok) {
      const err = await grpRes.json();
      console.error('❌ Task Group Upsert Failed:', err);
      process.exit(1);
    }
    const grpData = await grpRes.json();
    console.log(`✅ Task Group Synced: ID=${grpData.group.id} (Created: ${grpData.created})`);
  }

  // Step 3: Tasks Upsert
  const tasks = payload.tasks || [];
  if (tasks.length > 0) {
    console.log(`📋 Synchronizing ${tasks.length} Tasks...`);

    const formattedTasks = tasks.map((t) => ({
      source,
      external_id: t.external_id,
      project_external_id: projectExternalId,
      task_group_external_id: groupExternalId,
      task_name: t.task_name,
      start_date: t.start_date || null,
      end_date: t.end_date || null,
      assignees: t.assignees || [],
    }));

    const batchRes = await fetch(`${baseUrl}/api/integrations/v1/tasks/batch-upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tasks: formattedTasks }),
    });

    if (!batchRes.ok) {
      const err = await batchRes.json();
      console.error('❌ Batch Tasks Upsert Failed:', err);
      process.exit(1);
    }

    const batchData = await batchRes.json();
    console.log(`🎉 Successfully Processed ${batchData.total_processed} Tasks!`);
  }

  console.log('✨ Sync Completed Cleanly!');
}

syncSchedule().catch((err) => {
  console.error('Fatal Sync Error:', err);
  process.exit(1);
});
