// examples/integration/scheduler-client.mjs
// Node.js ESM Example Client for CON-COST Dev Scheduler Integration API v1

const BASE_URL = process.env.SCHEDULER_API_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
const API_KEY = process.env.SCHEDULER_API_KEY || 'sched_live_example_token';

async function main() {
  // 1. Health Check
  const healthRes = await fetch(`${BASE_URL}/api/integrations/v1/health`);
  console.log('Health:', await healthRes.json());

  // 2. Fetch Active Workers
  const workersRes = await fetch(`${BASE_URL}/api/integrations/v1/workers`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  console.log('Workers:', await workersRes.json());

  // 3. Upsert Task
  const upsertRes = await fetch(`${BASE_URL}/api/integrations/v1/tasks/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      source: 'github',
      external_id: 'issue-789',
      project_external_id: 'concost-hub',
      task_name: 'Fix OAuth Callback Timeout',
      start_date: '2026-08-10',
      end_date: '2026-08-12',
      assignees: [{ worker_id: 'wrk_03', allocation_percent: 100 }],
    }),
  });

  console.log('Task Upsert Status:', upsertRes.status);
  console.log('Task Upsert Result:', await upsertRes.json());
}

main().catch(console.error);
