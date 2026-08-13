#!/usr/bin/env node
/**
 * Provision one pilot PIN without ever persisting its plaintext value.
 *
 * Usage:
 *   node scripts/auth/set-pilot-pin.mjs --target qa --employee <worker-id>
 *   node scripts/auth/set-pilot-pin.mjs --target qa --employee <worker-id> --generate
 *   node scripts/auth/set-pilot-pin.mjs --target qa --employee <worker-id> --pin-env QA_PILOT_PIN
 *
 * Production is deliberately explicit and requires the exact D1 database ID:
 *   ... --target production --employee <worker-id> --confirm-production-db-id <id>
 */
import { stdin as input } from 'node:process';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const TARGETS = {
  qa: { database: 'concost-db-qa', id: 'cae30591-5d3f-4441-8684-b79a9e789359' },
  production: { database: 'concost-db', id: 'feb39a05-c98e-455f-a2b1-ff75e1c0b94f' },
};
const ITERATIONS = 30_000;
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] || null;
};
const targetName = flag('--target');
const employeeId = flag('--employee');
const generate = args.includes('--generate');
const pinEnvName = flag('--pin-env');

if (!targetName || !TARGETS[targetName] || !employeeId || !/^[A-Za-z0-9_-]+$/.test(employeeId)) {
  console.error('Usage: --target qa|production --employee <worker-id> [--generate]');
  process.exit(2);
}
const target = TARGETS[targetName];
if (targetName === 'production' && flag('--confirm-production-db-id') !== target.id) {
  console.error('Production requires --confirm-production-db-id with the exact configured database ID.');
  process.exit(2);
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const sqlQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const randomPin = () => String(webcrypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

if (generate && pinEnvName) {
  console.error('Choose either --generate or --pin-env, not both.');
  process.exit(2);
}

let pin = '';
if (pinEnvName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(pinEnvName)) {
    console.error('--pin-env must name a valid environment variable.');
    process.exit(2);
  }
  pin = process.env[pinEnvName] || '';
} else if (generate) {
  pin = randomPin();
  // This is the only intentional plaintext display. It is never written to a
  // file, SQL command, evidence artifact, source file, or audit event.
  console.log(`Generated pilot PIN (record it securely now): ${pin}`);
} else {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    console.error('Interactive PIN entry requires a TTY. Use --generate for a one-time generated PIN.');
    process.exit(2);
  }
  process.stdout.write('Pilot PIN (six digits): ');
  input.setRawMode(true);
  input.resume();
  pin = await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const value = chunk.toString('utf8');
      if (value === '\u0003') { cleanup(); reject(new Error('PIN entry cancelled')); return; }
      if (value === '\r' || value === '\n') { cleanup(); process.stdout.write('\n'); resolve(pin); return; }
      if (value === '\u007f') { pin = pin.slice(0, -1); return; }
      if (/^\d$/.test(value) && pin.length < 6) pin += value;
    };
    const cleanup = () => { input.off('data', onData); input.setRawMode(false); input.pause(); };
    input.on('data', onData);
  });
}
if (!/^\d{6}$/.test(pin)) {
  console.error('PIN must contain exactly six digits.');
  process.exit(2);
}

const saltBytes = webcrypto.getRandomValues(new Uint8Array(16));
const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITERATIONS }, material, 256);
const hash = b64(new Uint8Array(bits));
const salt = b64(saltBytes);
const now = new Date().toISOString();
const sql = `
BEGIN;
INSERT INTO pilot_auth_credentials (employee_id,pin_hash,pin_salt,pin_algorithm,pin_iterations,is_enabled,failed_attempt_count,locked_until,created_at,updated_at,updated_by)
VALUES (${sqlQuote(employeeId)},${sqlQuote(hash)},${sqlQuote(salt)},'PBKDF2-HMAC-SHA-256',${ITERATIONS},1,0,NULL,${sqlQuote(now)},${sqlQuote(now)},'SET_PILOT_PIN_SCRIPT')
ON CONFLICT(employee_id) DO UPDATE SET pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,pin_algorithm=excluded.pin_algorithm,pin_iterations=excluded.pin_iterations,is_enabled=1,failed_attempt_count=0,locked_until=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
UPDATE pilot_auth_sessions SET revoked_at=${sqlQuote(now)} WHERE employee_id=${sqlQuote(employeeId)} AND revoked_at IS NULL;
INSERT INTO pilot_auth_audit_events (id,employee_id,session_id,event_type,event_time_utc,metadata_json)
VALUES ('pae_pin_' || lower(hex(randomblob(16))),${sqlQuote(employeeId)},NULL,'PIN_CHANGED',${sqlQuote(now)},'{"source":"admin_script"}');
COMMIT;`;

const wrangler = process.platform === 'win32' ? '.\\node_modules\\.bin\\wrangler.cmd' : './node_modules/.bin/wrangler';
const result = spawnSync(wrangler, ['d1', 'execute', target.database, '--remote', '--command', sql], {
  cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32',
});
// Scrub the only plaintext reference before process exit whenever possible.
pin = '';
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Pilot credential updated for ${employeeId} on ${targetName}. Existing sessions were revoked.`);
