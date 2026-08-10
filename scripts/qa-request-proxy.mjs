// scripts/qa-request-proxy.mjs
// Local Counting Proxy for measuring exact HTTP requests to QA Worker with hard fail-closed budget limit
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const PORT = parseInt(process.env.PROXY_PORT || '4179', 10);
const TARGET_HOST = process.env.PROXY_TARGET_HOST || 'concost-dev-scheduler-qa.eumditravel.workers.dev';
const REQUEST_BUDGET = parseInt(process.env.PROXY_REQUEST_BUDGET || '1500', 10);
const SIMULATION_MODE = process.env.PROXY_SIMULATION_MODE === 'true';
const EVIDENCE_FILE = path.join(process.cwd(), 'qa', 'request-proxy-evidence.json');

let totalRequests = 0;
let forwardedRequests = 0;
let blockedRequests = 0;
const byMethod = {};
const byPath = {};

function buildEvidenceObj() {
  return {
    total: totalRequests,
    forwarded_requests: forwardedRequests,
    blocked_requests: blockedRequests,
    budget: REQUEST_BUDGET,
    budget_exceeded: forwardedRequests >= REQUEST_BUDGET || blockedRequests > 0,
    simulation_mode: SIMULATION_MODE,
    by_method: byMethod,
    by_path: byPath,
    target_host: TARGET_HOST,
    timestamp: new Date().toISOString()
  };
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // Control Endpoint: Get evidence & dump to file
  if (parsedUrl.pathname === '/__proxy_evidence') {
    const evidence = buildEvidenceObj();
    fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(evidence));
    return;
  }

  // Control Endpoint: Reset counters
  if (parsedUrl.pathname === '/__proxy_reset') {
    totalRequests = 0;
    forwardedRequests = 0;
    blockedRequests = 0;
    Object.keys(byMethod).forEach(k => delete byMethod[k]);
    Object.keys(byPath).forEach(k => delete byPath[k]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'RESET' }));
    return;
  }

  // Control Endpoint: Stop proxy server
  if (parsedUrl.pathname === '/__proxy_stop') {
    const evidence = buildEvidenceObj();
    fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(evidence));
    server.close();
    return;
  }

  // FAIL-CLOSED BUDGET GUARD CHECK (Blocks remote request forwarding if budget exceeded)
  if (forwardedRequests >= REQUEST_BUDGET) {
    totalRequests++;
    blockedRequests++;
    console.warn(`[PROXY BUDGET GUARD BLOCKED] Request #${totalRequests} (Forwarded: ${forwardedRequests}/${REQUEST_BUDGET}) -> ${req.method} ${parsedUrl.pathname}`);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        code: 'RELEASE_REQUEST_BUDGET_EXCEEDED',
        message: `QA Worker request budget limit (${REQUEST_BUDGET}) reached. Remote request blocked before forwarding.`
      }
    }));
    return;
  }

  // Increment counters for target request
  totalRequests++;
  forwardedRequests++;
  byMethod[req.method] = (byMethod[req.method] || 0) + 1;
  byPath[parsedUrl.pathname] = (byPath[parsedUrl.pathname] || 0) + 1;

  // SIMULATION MODE: Respond locally with mock HTTP 200 without making remote network calls
  if (SIMULATION_MODE) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'SIMULATED_OK', data: { commit: 'simulated_commit_sha' } }));
    return;
  }

  // Prepare HTTPS proxy request options
  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: TARGET_HOST,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[PROXY ERROR] ${req.method} ${req.url} -> ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'PROXY_ERROR', message: err.message } }));
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[QA REQUEST PROXY] Listening on http://127.0.0.1:${PORT} -> https://${TARGET_HOST} (Hard Budget: ${REQUEST_BUDGET}, Simulation: ${SIMULATION_MODE})`);
});
