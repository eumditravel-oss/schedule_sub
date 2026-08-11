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
const EXCLUDE_WORKFORCE_ALLOCATIONS = process.env.PROXY_EXCLUDE_WORKFORCE_ALLOCATIONS === 'true';
const EVIDENCE_FILE = path.join(process.cwd(), 'qa', 'request-proxy-evidence.json');
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

let totalRequests = 0;
let forwardedRequests = 0;
let blockedRequests = 0;
let proxyErrors = 0;
let excludedWorkforceAllocationRequests = 0;
const byMethod = {};
const byPath = {};
const byStatus = {};

function withoutHopByHopHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HOP_BY_HOP_HEADERS.has(name.toLowerCase()))
  );
}

function recordStatus(statusCode) {
  const key = String(statusCode);
  byStatus[key] = (byStatus[key] || 0) + 1;
}

function buildEvidenceObj() {
  return {
    total: totalRequests,
    forwarded_requests: forwardedRequests,
    blocked_requests: blockedRequests,
    proxy_errors: proxyErrors,
    excluded_workforce_allocation_requests: excludedWorkforceAllocationRequests,
    budget: REQUEST_BUDGET,
    budget_exceeded: forwardedRequests >= REQUEST_BUDGET || blockedRequests > 0,
    simulation_mode: SIMULATION_MODE,
    exclude_workforce_allocations: EXCLUDE_WORKFORCE_ALLOCATIONS,
    by_method: byMethod,
    by_path: byPath,
    by_status: byStatus,
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
    proxyErrors = 0;
    excludedWorkforceAllocationRequests = 0;
    Object.keys(byMethod).forEach(k => delete byMethod[k]);
    Object.keys(byPath).forEach(k => delete byPath[k]);
    Object.keys(byStatus).forEach(k => delete byStatus[k]);
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

  // Workforce allocation percentages are explicitly outside the current release
  // scope. Keep browser behavior deterministic without spending remote QA budget.
  if (
    EXCLUDE_WORKFORCE_ALLOCATIONS
    && req.method === 'GET'
    && /^\/api\/projects\/[^/]+\/worker-allocations$/.test(parsedUrl.pathname)
  ) {
    totalRequests++;
    excludedWorkforceAllocationRequests++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: [] }));
    return;
  }

  // FAIL-CLOSED BUDGET GUARD CHECK (Blocks remote request forwarding if budget exceeded)
  if (forwardedRequests >= REQUEST_BUDGET) {
    totalRequests++;
    blockedRequests++;
    recordStatus(429);
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
    recordStatus(200);
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
      ...withoutHopByHopHeaders(req.headers),
      host: TARGET_HOST,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const statusCode = proxyRes.statusCode || 502;
    recordStatus(statusCode);
    res.writeHead(statusCode, withoutHopByHopHeaders(proxyRes.headers));
    proxyRes.pipe(res, { end: true });
  });
  let clientAborted = false;
  let downstreamClosed = false;

  proxyReq.setTimeout(30_000, () => {
    proxyReq.destroy(new Error('Upstream QA request timed out after 30 seconds.'));
  });

  proxyReq.on('error', (err) => {
    if (clientAborted || downstreamClosed) return;
    proxyErrors++;
    recordStatus(502);
    console.error(`[PROXY ERROR] ${req.method} ${req.url} -> ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'PROXY_ERROR', message: err.message } }));
    } else {
      res.destroy(err);
    }
  });

  req.on('aborted', () => {
    clientAborted = true;
    proxyReq.destroy();
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      downstreamClosed = true;
      proxyReq.destroy();
    }
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[QA REQUEST PROXY] Listening on http://127.0.0.1:${PORT} -> https://${TARGET_HOST} (Hard Budget: ${REQUEST_BUDGET}, Simulation: ${SIMULATION_MODE})`);
});

server.on('clientError', (err, socket) => {
  console.error(`[PROXY CLIENT ERROR] ${err.message}`);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  }
});
