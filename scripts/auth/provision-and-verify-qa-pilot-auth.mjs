#!/usr/bin/env node
/**
 * QA-only pilot-auth release helper.
 *
 * Generates a fresh QA bootstrap secret and four role PINs in memory, stores
 * only derived credential material in QA D1, deploys the current commit to
 * the QA Worker, then verifies the deployed HTTPS contract.  Plaintext values
 * are never printed, written to a file, or placed in a command-line argument.
 *
 * This intentionally has no production option.
 */
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const QA_DATABASE = 'concost-db-qa';
const QA_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
const QA_WORKER_ENV = 'qa';
const PIN_ITERATIONS = 30_000;
const roleEmployees = {
  primary: 'wrk_03',
  support: 'wrk_05',
  manager: 'wrk_02',
  executive: 'wrk_00_ceo',
};

const root = process.cwd();
const wrangler = process.platform === 'win32' ? '.\\node_modules\\.bin\\wrangler.cmd' : './node_modules/.bin/wrangler';
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const sqlQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const now = () => new Date().toISOString();
const getRandom = (length) => {
  const bytes = new Uint8Array(length);
  webcrypto.getRandomValues(bytes);
  return bytes;
};
const randomPin = () => String(webcrypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: options.stdin === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input: options.stdin,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] || ''} failed with exit code ${result.status}`);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed`);
  return String(result.stdout || '').trim();
}

async function pinMaterial(pin) {
  const salt = hex(getRandom(16));
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(salt, 'hex'), iterations: PIN_ITERATIONS,
  }, material, 256);
  return { salt, hash: hex(new Uint8Array(bits)) };
}

async function provision(secret, pins) {
  // The secret is passed through the child process stdin, never as an arg.
  run(wrangler, ['secret', 'put', 'QA_TEST_ACTOR_SECRET', '--env', QA_WORKER_ENV], { stdin: secret });
  const materials = Object.fromEntries(await Promise.all(
    Object.entries(pins).map(async ([role, pin]) => [role, await pinMaterial(pin)]),
  ));
  const timestamp = now();
  const credentialSql = Object.entries(roleEmployees).map(([role, employeeId]) => {
    const material = materials[role];
    return `INSERT INTO pilot_auth_credentials (employee_id,pin_hash,pin_salt,pin_algorithm,pin_iterations,is_enabled,failed_attempt_count,locked_until,created_at,updated_at,updated_by)
      VALUES (${sqlQuote(employeeId)},${sqlQuote(material.hash)},${sqlQuote(material.salt)},'PBKDF2-HMAC-SHA-256',${PIN_ITERATIONS},1,0,NULL,${sqlQuote(timestamp)},${sqlQuote(timestamp)},'QA_PILOT_RELEASE_HELPER')
      ON CONFLICT(employee_id) DO UPDATE SET pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,pin_algorithm=excluded.pin_algorithm,pin_iterations=excluded.pin_iterations,is_enabled=1,failed_attempt_count=0,locked_until=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by;`;
  }).join('\n');
  const sql = `${credentialSql}
    UPDATE pilot_auth_sessions SET revoked_at=${sqlQuote(timestamp)}
      WHERE employee_id IN (${Object.values(roleEmployees).map(sqlQuote).join(',')}) AND revoked_at IS NULL;
    INSERT INTO pilot_employee_supervision (manager_employee_id,employee_id,is_active,created_at,updated_at,updated_by)
      VALUES (${sqlQuote(roleEmployees.manager)},${sqlQuote(roleEmployees.primary)},1,${sqlQuote(timestamp)},${sqlQuote(timestamp)},'QA_PILOT_RELEASE_HELPER'),
             (${sqlQuote(roleEmployees.manager)},${sqlQuote(roleEmployees.support)},1,${sqlQuote(timestamp)},${sqlQuote(timestamp)},'QA_PILOT_RELEASE_HELPER')
      ON CONFLICT(manager_employee_id,employee_id) DO UPDATE SET is_active=1,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
    INSERT INTO pilot_auth_audit_events (id,employee_id,session_id,event_type,event_time_utc,metadata_json)
      VALUES ('pae_qa_fixture_' || lower(hex(randomblob(16))),NULL,NULL,'QA_CREDENTIALS_PROVISIONED',${sqlQuote(timestamp)},'{"plaintext":"never-stored"}');`;
  // On Windows Wrangler is a .cmd shim. Passing SQL as an argv value through
  // cmd.exe can split SQL tokens, so use a short-lived file instead. It has
  // only one-way PBKDF2 material, never a plaintext PIN or QA secret.
  const sqlDirectory = mkdtempSync(join(tmpdir(), 'concost-qa-auth-'));
  const sqlFile = join(sqlDirectory, 'pilot-fixture.sql');
  try {
    writeFileSync(sqlFile, sql, { encoding: 'utf8', mode: 0o600 });
    run(wrangler, ['d1', 'execute', QA_DATABASE, '--remote', '--env', QA_WORKER_ENV, '--file', sqlFile]);
  } finally {
    rmSync(sqlDirectory, { recursive: true, force: true });
  }
}

async function response(url, path, init = {}) {
  const result = await fetch(`${url}${path}`, {
    redirect: 'manual',
    ...init,
    headers: { Origin: url, ...(init.headers || {}) },
  });
  const body = await result.json().catch(() => ({}));
  return { result, body };
}

async function waitForQaDeployment(url, expectedSha) {
  const deadline = Date.now() + 60_000;
  let lastObserved = 'unavailable';
  while (Date.now() < deadline) {
    try {
      const { result, body } = await response(url, '/api/build-info');
      lastObserved = `${result.status}:${body?.data?.commit || 'unknown'}`;
      if (result.status === 200 && body?.success && body?.data?.commit === expectedSha) return;
    } catch {
      lastObserved = 'network error';
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`QA deployment did not expose expected build ${expectedSha}; last observed ${lastObserved}`);
}

function expectStatus(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`);
}

function cookiePair(result) {
  const raw = result.headers.get('set-cookie') || '';
  if (!/HttpOnly; Secure; SameSite=Strict; Path=\//.test(raw)) throw new Error('Session cookie is missing required flags');
  const pair = raw.split(';')[0];
  if (!pair.startsWith('__Host-concost-pilot-session=')) throw new Error('Session cookie is missing __Host prefix');
  return pair;
}

async function login(url, employeeId, pin) {
  const { result, body } = await response(url, '/api/auth/pilot/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, pin }),
  });
  expectStatus(result.status, 200, `login ${employeeId}`);
  if (!body.success || !body.data?.csrfToken) throw new Error(`login ${employeeId}: malformed response`);
  return { cookie: cookiePair(result), csrf: body.data.csrfToken };
}

async function verifyRemoteApi(url, secret, pins) {
  const primary = await login(url, roleEmployees.primary, pins.primary);
  const primaryHeaders = { Cookie: primary.cookie, 'X-CSRF-Token': primary.csrf };
  const session = await response(url, '/api/auth/pilot/session', { headers: { Cookie: primary.cookie } });
  expectStatus(session.result.status, 200, 'session lookup');
  if (session.body.data?.actor?.employeeId !== roleEmployees.primary) throw new Error('Session actor did not remain primary');

  const missingCsrf = await response(url, '/api/v3/worklogs/morning', {
    method: 'POST', headers: { Cookie: primary.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  expectStatus(missingCsrf.result.status, 403, 'missing CSRF write');

  const spoofedHeader = await response(url, `/api/v3/capacity/day?employee_id=${roleEmployees.support}&local_work_date=2026-08-13`, {
    headers: { Cookie: primary.cookie, 'x-actor-employee-id': roleEmployees.manager, 'x-test-actor': roleEmployees.manager },
  });
  expectStatus(spoofedHeader.result.status, 403, 'header actor spoof');

  const bootstrapInvalid = await response(url, '/api/qa/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QA-Test-Secret': 'invalid-secret' }, body: JSON.stringify({ employeeId: roleEmployees.primary }),
  });
  expectStatus(bootstrapInvalid.result.status, 403, 'invalid QA bootstrap secret');
  const bootstrapValid = await response(url, '/api/qa/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QA-Test-Secret': secret }, body: JSON.stringify({ employeeId: roleEmployees.primary }),
  });
  expectStatus(bootstrapValid.result.status, 200, 'valid QA bootstrap secret');
  if (bootstrapValid.body.data?.isQaTestSession !== true) throw new Error('QA bootstrap did not mark its test session');

  const support = await login(url, roleEmployees.support, pins.support);
  const supportSpoof = await response(url, `/api/v3/capacity/day?employee_id=${roleEmployees.primary}&local_work_date=2026-08-13`, {
    headers: { Cookie: support.cookie, 'x-actor-employee-id': roleEmployees.primary },
  });
  expectStatus(supportSpoof.result.status, 403, 'support-to-primary spoof');

  const executive = await login(url, roleEmployees.executive, pins.executive);
  const executiveWrite = await response(url, '/api/admin/backfill-assignees', {
    method: 'POST', headers: { Cookie: executive.cookie, 'X-CSRF-Token': executive.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  expectStatus(executiveWrite.result.status, 403, 'executive manager-write spoof');

  const manager = await login(url, roleEmployees.manager, pins.manager);
  const managerHeaders = { Cookie: manager.cookie };
  const supervised = await response(url, `/api/v3/capacity/day?employee_id=${roleEmployees.primary}&local_work_date=2026-08-13`, { headers: managerHeaders });
  expectStatus(supervised.result.status, 200, 'manager supervised read');
  const outsideScope = await response(url, '/api/v3/capacity/day?employee_id=wrk_04&local_work_date=2026-08-13', { headers: managerHeaders });
  expectStatus(outsideScope.result.status, 403, 'manager outside supervision');

  const logout = await response(url, '/api/auth/pilot/logout', { method: 'POST', headers: primaryHeaders });
  expectStatus(logout.result.status, 200, 'logout');
  const revoked = await response(url, '/api/auth/pilot/session', { headers: { Cookie: primary.cookie } });
  expectStatus(revoked.result.status, 401, 'revoked session reuse');

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failed = await response(url, '/api/auth/pilot/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: roleEmployees.executive, pin: '000000' }),
    });
    expectStatus(failed.result.status, attempt === 5 ? 429 : 401, `wrong PIN attempt ${attempt}`);
  }
  // Restore the intentionally locked QA executive test fixture for future QA use.
  await provision(secret, pins);
}

async function verifyBrowser(url, employeeId, pin) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${url}/login`, { waitUntil: 'networkidle' });
    await page.locator('select').selectOption(employeeId);
    await page.locator('input[type="password"]').fill(pin);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((target) => !target.pathname.endsWith('/login'));
    const cookies = await page.context().cookies(url);
    const session = cookies.find((cookie) => cookie.name === '__Host-concost-pilot-session');
    if (!session?.httpOnly || !session.secure || session.sameSite !== 'Strict' || session.path !== '/') {
      throw new Error('Browser did not receive a secure __Host session cookie');
    }
  } finally {
    await browser.close();
  }
}

const args = new Set(process.argv.slice(2));
if (!args.has('--qa-only')) {
  console.error('This QA-only release helper requires --qa-only. It has no production mode.');
  process.exit(2);
}

const secret = b64url(getRandom(32));
const pins = Object.fromEntries(Object.keys(roleEmployees).map((role) => [role, randomPin()]));
const buildSha = commandOutput('git', ['rev-parse', 'HEAD']);
const buildTimestamp = now();

try {
  await provision(secret, pins);
  run('npm.cmd', ['run', 'build']);
  run(wrangler, ['deploy', '--env', QA_WORKER_ENV, '--var', `BUILD_SHA:${buildSha}`, '--var', `BUILD_TIMESTAMP:${buildTimestamp}`]);
  await waitForQaDeployment(QA_URL, buildSha);
  await verifyRemoteApi(QA_URL, secret, pins);
  await verifyBrowser(QA_URL, roleEmployees.primary, pins.primary);
  console.log(`QA pilot-auth provisioning, HTTPS security checks, and browser login passed for commit ${buildSha}.`);
} finally {
  // Keep the raw values process-local for the shortest possible lifetime.
  for (const role of Object.keys(pins)) pins[role] = '';
}
