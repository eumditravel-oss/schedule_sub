// scripts/test-budget-proxy-simulation.mjs
// Node.js test script to verify fail-closed proxy request budget enforcement
import http from 'http';

const PROXY_PORT = 4180;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;

function makeRequest(pathStr) {
  return new Promise((resolve, reject) => {
    http.get(`${PROXY_URL}${pathStr}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: json });
        } catch {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

async function runSimulation() {
  console.log('[SIMULATION] Testing Hard Budget Limit = 10 requests on Proxy...');

  // Reset proxy
  await makeRequest('/__proxy_reset');

  // Send 10 requests
  for (let i = 1; i <= 10; i++) {
    const res = await makeRequest('/api/version');
    console.log(`  Request #${i}: HTTP ${res.statusCode}`);
  }

  // Send 11th request (should be BLOCKED locally with 429)
  console.log('[SIMULATION] Sending 11th Request (Expecting HTTP 429 Local Block)...');
  const res11 = await makeRequest('/api/version');
  console.log(`  Request #11: HTTP ${res11.statusCode}, Error Code: ${res11.data?.error?.code}`);

  if (res11.statusCode !== 429 || res11.data?.error?.code !== 'RELEASE_REQUEST_BUDGET_EXCEEDED') {
    console.error('❌ SIMULATION FAILED: 11th request was NOT blocked locally!');
    process.exit(1);
  }

  // Query evidence
  const evidenceRes = await makeRequest('/__proxy_evidence');
  const evidence = evidenceRes.data;
  console.log('[SIMULATION] Final Proxy Evidence:', JSON.stringify(evidence, null, 2));

  if (
    evidence.forwarded_requests === 10
    && evidence.blocked_requests === 1
    && evidence.proxy_errors === 0
    && evidence.by_status?.['200'] === 10
    && evidence.by_status?.['429'] === 1
    && evidence.budget_exceeded === true
  ) {
    console.log('✅ PROXY BUDGET HARD FAIL-CLOSED VERIFIED: Exactly 10 requests forwarded, 11th request blocked locally (0 remote calls for #11).');
    process.exit(0);
  } else {
    console.error('❌ SIMULATION FAILED: Evidence numbers do not match expected fail-closed state.');
    process.exit(1);
  }
}

runSimulation().catch((err) => {
  console.error('[SIMULATION ERROR]', err);
  process.exit(1);
});
