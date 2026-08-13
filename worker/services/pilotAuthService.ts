import type { ActorContextServer } from './v3FoundationService';

export const PILOT_SESSION_COOKIE = '__Host-concost-pilot-session';
export const PILOT_PIN_ALGORITHM = 'PBKDF2-HMAC-SHA-256';
export const PILOT_PIN_ITERATIONS = 210_000;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export type PilotAuthEnv = {
  DB: D1Database;
  ENVIRONMENT_NAME?: string;
  PILOT_SESSION_AUTH_ENABLED?: string;
  TEST_ACTOR_MODE?: string;
  PILOT_SESSION_TTL_SECONDS?: string;
  QA_TEST_ACTOR_SECRET?: string;
};

export class PilotAuthError extends Error {
  constructor(public code: string, public status = 401, public details?: unknown) {
    super(code);
  }
}

export type AuthenticatedActor = ActorContextServer & {
  employeeId: string;
  displayName: string;
  role: string;
  office: string | null;
  timezone: string | null;
  worker: any;
  sessionId: string;
  isQaTestSession: boolean;
};

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromStoredBinary(value: string): Uint8Array {
  // New credentials use a simple hex representation.  Continue accepting the
  // original Base64 records so PIN rotation can be rolled out without making
  // any already-provisioned account unusable.
  if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0) {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }
  return fromBase64(value);
}

function base64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function nowIso(now = new Date()): string { return now.toISOString(); }

function configuredTtlSeconds(env: PilotAuthEnv): number {
  const requested = Number(env.PILOT_SESSION_TTL_SECONDS || SESSION_TTL_SECONDS);
  return Number.isInteger(requested) && requested >= 300 && requested <= SESSION_TTL_SECONDS
    ? requested
    : SESSION_TTL_SECONDS;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index % (left.length || 1)] || 0) ^ (right[index % (right.length || 1)] || 0);
  }
  return difference === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function derivePilotPinHash(pin: string, salt: string, iterations = PILOT_PIN_ITERATIONS): Promise<string> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = fromStoredBinary(salt);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes.buffer as ArrayBuffer, iterations,
  }, material, 256);
  return toHex(new Uint8Array(bits));
}

export function createPilotPinSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') || '';
  for (const item of cookie.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

function clientIp(request: Request): string | null {
  // The value is immediately hashed; raw IP/User-Agent values are never stored.
  return request.headers.get('CF-Connecting-IP') || null;
}

async function audit(db: D1Database, eventType: string, input: { employeeId?: string | null; sessionId?: string | null; metadata?: Record<string, unknown> }) {
  await db.prepare(
    `INSERT INTO pilot_auth_audit_events (id,employee_id,session_id,event_type,event_time_utc,metadata_json)
     VALUES (?,?,?,?,?,?)`,
  ).bind(
    `pae_${crypto.randomUUID()}`, input.employeeId || null, input.sessionId || null, eventType, nowIso(),
    input.metadata ? JSON.stringify(input.metadata) : null,
  ).run();
}

function sessionCookie(token: string, ttlSeconds: number): string {
  // __Host- cookies require Secure + Path=/ and no Domain.  Local unit tests
  // call service helpers directly; deployed QA/production always use HTTPS.
  return `${PILOT_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ttlSeconds}`;
}

export function expiredSessionCookie(): string {
  return `${PILOT_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function actorView(worker: any, policy: any, sessionId: string, isQaTestSession: boolean): AuthenticatedActor {
  return {
    actorMode: isQaTestSession ? 'QA_TEST_SESSION' : 'PILOT_SESSION',
    actorUserId: worker.id,
    actorEmployeeId: worker.id,
    selectedViewEmployeeId: worker.id,
    testSessionId: isQaTestSession ? sessionId : null,
    employeeId: worker.id,
    displayName: worker.name,
    role: worker.access_role,
    office: policy?.office_code || worker.country_code || null,
    timezone: policy?.timezone || null,
    worker,
    sessionId,
    isQaTestSession,
  };
}

async function loadWorkerActor(db: D1Database, employeeId: string, sessionId: string, isQaTestSession: boolean): Promise<AuthenticatedActor> {
  const record = await db.prepare(
    `SELECT w.*, p.office_code, p.timezone
     FROM workers w LEFT JOIN office_work_policies p ON p.country_code=w.country_code
     WHERE w.id=? AND w.is_active=1`,
  ).bind(employeeId).first<any>();
  if (!record) throw new PilotAuthError('SESSION_REVOKED', 401);
  return actorView(record, record, sessionId, isQaTestSession);
}

async function createSession(db: D1Database, request: Request, employeeId: string, env: PilotAuthEnv, isQaTestSession = false) {
  const token = randomToken();
  const csrf = randomToken();
  const sessionId = `${isQaTestSession ? 'qat' : 'pas'}_${crypto.randomUUID()}`;
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + configuredTtlSeconds(env) * 1000).toISOString();
  const [tokenHash, csrfHash, userAgentHash, ipHash] = await Promise.all([
    sha256Hex(token), sha256Hex(csrf), sha256Hex(request.headers.get('User-Agent') || ''),
    clientIp(request) ? sha256Hex(clientIp(request)!) : Promise.resolve(null),
  ]);
  await db.prepare(
    `INSERT INTO pilot_auth_sessions
     (session_id,employee_id,session_token_hash,csrf_token_hash,created_at,expires_at,revoked_at,last_seen_at,created_user_agent_hash,created_ip_hash)
     VALUES (?,?,?,?,?,?,NULL,?,?,?)`,
  ).bind(sessionId, employeeId, tokenHash, csrfHash, createdAt, expiresAt, createdAt, userAgentHash, ipHash).run();
  const actor = await loadWorkerActor(db, employeeId, sessionId, isQaTestSession);
  return {
    data: {
      authenticated: true,
      actor: { employeeId: actor.employeeId, displayName: actor.displayName, role: actor.role, office: actor.office, timezone: actor.timezone },
      csrfToken: csrf,
      expiresAt,
      isQaTestSession,
    },
    actor,
    setCookie: sessionCookie(token, configuredTtlSeconds(env)),
  };
}

function isLockActive(lockedUntil: unknown, now: Date): boolean {
  return typeof lockedUntil === 'string' && !Number.isNaN(Date.parse(lockedUntil)) && Date.parse(lockedUntil) > now.getTime();
}

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (!origin) throw new PilotAuthError('CSRF_REQUIRED', 403);
  if (origin !== new URL(request.url).origin) throw new PilotAuthError('CSRF_INVALID', 403);
}

export async function pilotLogin(request: Request, env: PilotAuthEnv, body: any) {
  if (env.PILOT_SESSION_AUTH_ENABLED !== 'true') throw new PilotAuthError('AUTH_REQUIRED', 401);
  // Login creates a session cookie, so it is covered by same-origin CSRF
  // protection even though no pre-existing session token is available yet.
  requireSameOrigin(request);
  const employeeId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
  const pin = typeof body?.pin === 'string' ? body.pin : '';
  const credential = employeeId
    ? await env.DB.prepare(`SELECT * FROM pilot_auth_credentials WHERE employee_id=?`).bind(employeeId).first<any>()
    : null;
  if (!credential || !/^\d{6}$/.test(pin)) {
    // The audit FK must not become a credential-existence oracle.  Unknown
    // IDs are logged without an employee reference and receive the same 401.
    await audit(env.DB, 'LOGIN_FAILED', { employeeId: credential ? employeeId : null });
    throw new PilotAuthError('LOGIN_FAILED', 401);
  }
  if (Number(credential.is_enabled) !== 1) {
    await audit(env.DB, 'LOGIN_DISABLED', { employeeId });
    throw new PilotAuthError('LOGIN_DISABLED', 403);
  }
  const now = new Date();
  if (isLockActive(credential.locked_until, now)) {
    await audit(env.DB, 'LOGIN_LOCKED', { employeeId });
    throw new PilotAuthError('LOGIN_TEMPORARILY_LOCKED', 429);
  }
  const derived = await derivePilotPinHash(pin, credential.pin_salt, Number(credential.pin_iterations));
  const valid = equalBytes(fromStoredBinary(derived), fromStoredBinary(credential.pin_hash));
  if (!valid) {
    const lockAt = new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString();
    await env.DB.prepare(
      `UPDATE pilot_auth_credentials
       SET failed_attempt_count=failed_attempt_count+1,
           locked_until=CASE WHEN failed_attempt_count+1>=? THEN ? ELSE locked_until END,
           updated_at=?
       WHERE employee_id=? AND is_enabled=1 AND (locked_until IS NULL OR locked_until<=?)`,
    ).bind(LOCKOUT_ATTEMPTS, lockAt, nowIso(now), employeeId, nowIso(now)).run();
    const current = await env.DB.prepare(`SELECT failed_attempt_count,locked_until FROM pilot_auth_credentials WHERE employee_id=?`).bind(employeeId).first<any>();
    const locked = isLockActive(current?.locked_until, new Date());
    await audit(env.DB, locked ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', { employeeId });
    throw new PilotAuthError(locked ? 'LOGIN_TEMPORARILY_LOCKED' : 'LOGIN_FAILED', locked ? 429 : 401);
  }
  const success = await env.DB.prepare(
    `UPDATE pilot_auth_credentials SET failed_attempt_count=0,locked_until=NULL,updated_at=?
     WHERE employee_id=? AND is_enabled=1 AND (locked_until IS NULL OR locked_until<=?)`,
  ).bind(nowIso(now), employeeId, nowIso(now)).run();
  if (!success.meta.changes) {
    await audit(env.DB, 'LOGIN_LOCKED', { employeeId });
    throw new PilotAuthError('LOGIN_TEMPORARILY_LOCKED', 429);
  }
  // Defend against session fixation: a login always rotates the browser's
  // supplied pilot session before a new token is minted.
  const previousToken = cookieValue(request, PILOT_SESSION_COOKIE);
  if (previousToken) {
    await env.DB.prepare(
      `UPDATE pilot_auth_sessions SET revoked_at=? WHERE session_token_hash=? AND revoked_at IS NULL`,
    ).bind(nowIso(now), await sha256Hex(previousToken)).run();
  }
  const session = await createSession(env.DB, request, employeeId, env);
  await audit(env.DB, 'LOGIN_SUCCESS', { employeeId, sessionId: session.actor.sessionId });
  return session;
}

export async function resolveAuthenticatedActor(request: Request, env: PilotAuthEnv): Promise<AuthenticatedActor> {
  if (env.PILOT_SESSION_AUTH_ENABLED !== 'true') throw new PilotAuthError('AUTH_REQUIRED', 401);
  const rawToken = cookieValue(request, PILOT_SESSION_COOKIE);
  if (!rawToken) throw new PilotAuthError('AUTH_REQUIRED', 401);
  const session = await env.DB.prepare(
    `SELECT s.*, c.is_enabled
     FROM pilot_auth_sessions s
     JOIN pilot_auth_credentials c ON c.employee_id=s.employee_id
     WHERE s.session_token_hash=?`,
  ).bind(await sha256Hex(rawToken)).first<any>();
  if (!session) throw new PilotAuthError('AUTH_REQUIRED', 401);
  if (session.revoked_at) throw new PilotAuthError('SESSION_REVOKED', 401);
  if (Date.parse(session.expires_at) <= Date.now()) throw new PilotAuthError('SESSION_EXPIRED', 401);
  if (Number(session.is_enabled) !== 1) {
    await env.DB.prepare(`UPDATE pilot_auth_sessions SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL`)
      .bind(nowIso(), session.session_id).run();
    await audit(env.DB, 'SESSION_REVOKED', { employeeId: session.employee_id, sessionId: session.session_id, metadata: { reason: 'CREDENTIAL_DISABLED' } });
    throw new PilotAuthError('SESSION_REVOKED', 401);
  }
  await env.DB.prepare(`UPDATE pilot_auth_sessions SET last_seen_at=? WHERE session_id=?`).bind(nowIso(), session.session_id).run();
  return loadWorkerActor(env.DB, session.employee_id, session.session_id, session.session_id.startsWith('qat_'));
}

export async function requireCsrf(request: Request, env: PilotAuthEnv, actor?: AuthenticatedActor): Promise<AuthenticatedActor> {
  const resolved = actor || await resolveAuthenticatedActor(request, env);
  const origin = request.headers.get('Origin');
  if (!origin) throw new PilotAuthError('CSRF_REQUIRED', 403);
  if (origin !== new URL(request.url).origin) throw new PilotAuthError('CSRF_INVALID', 403);
  const csrf = request.headers.get('X-CSRF-Token');
  if (!csrf) throw new PilotAuthError('CSRF_REQUIRED', 403);
  const session = await env.DB.prepare(`SELECT csrf_token_hash FROM pilot_auth_sessions WHERE session_id=? AND revoked_at IS NULL`)
    .bind(resolved.sessionId).first<any>();
  if (!session || !equalBytes(encoder.encode(await sha256Hex(csrf)), encoder.encode(session.csrf_token_hash))) {
    throw new PilotAuthError('CSRF_INVALID', 403);
  }
  return resolved;
}

export async function getPilotSession(request: Request, env: PilotAuthEnv) {
  const actor = await resolveAuthenticatedActor(request, env);
  // Rotate the CSRF proof on a session read.  The database keeps only its hash
  // while a refreshed browser can resume mutations without exposing the
  // HttpOnly session token to JavaScript.
  const csrfToken = randomToken();
  const csrfHash = await sha256Hex(csrfToken);
  await env.DB.prepare(`UPDATE pilot_auth_sessions SET csrf_token_hash=?,last_seen_at=? WHERE session_id=? AND revoked_at IS NULL`)
    .bind(csrfHash, nowIso(), actor.sessionId).run();
  const session = await env.DB.prepare(`SELECT expires_at FROM pilot_auth_sessions WHERE session_id=?`).bind(actor.sessionId).first<any>();
  return {
    authenticated: true,
    actor: { employeeId: actor.employeeId, displayName: actor.displayName, role: actor.role, office: actor.office, timezone: actor.timezone },
    csrfToken,
    expiresAt: session?.expires_at || null,
    isQaTestSession: actor.isQaTestSession,
  };
}

export async function logoutPilotSession(request: Request, env: PilotAuthEnv) {
  const actor = await requireCsrf(request, env);
  await env.DB.prepare(`UPDATE pilot_auth_sessions SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL`)
    .bind(nowIso(), actor.sessionId).run();
  await audit(env.DB, 'LOGOUT', { employeeId: actor.employeeId, sessionId: actor.sessionId });
}

export async function createQaTestSession(request: Request, env: PilotAuthEnv, body: any) {
  if (env.ENVIRONMENT_NAME !== 'qa' || env.TEST_ACTOR_MODE !== 'true') {
    throw new PilotAuthError('QA_TEST_AUTH_DISABLED', 404);
  }
  requireSameOrigin(request);
  const supplied = request.headers.get('X-QA-Test-Secret') || '';
  if (!env.QA_TEST_ACTOR_SECRET || !equalBytes(encoder.encode(supplied), encoder.encode(env.QA_TEST_ACTOR_SECRET))) {
    throw new PilotAuthError('QA_TEST_SECRET_INVALID', 403);
  }
  const employeeId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
  const credential = employeeId ? await env.DB.prepare(
    `SELECT is_enabled FROM pilot_auth_credentials WHERE employee_id=?`,
  ).bind(employeeId).first<any>() : null;
  if (!credential || Number(credential.is_enabled) !== 1) throw new PilotAuthError('LOGIN_DISABLED', 403);
  const session = await createSession(env.DB, request, employeeId, env, true);
  await audit(env.DB, 'LOGIN_SUCCESS', { employeeId, sessionId: session.actor.sessionId, metadata: { qa_test_session: true } });
  return session;
}

export async function authorizeEmployeeRead(db: D1Database, actor: AuthenticatedActor, targetEmployeeId: string): Promise<void> {
  if (actor.employeeId === targetEmployeeId || actor.worker.access_role === 'VIEWER') return;
  const isManager = Number(actor.worker.can_manage_country_calendar) === 1 || Number(actor.worker.can_manage_integrations) === 1 || Number(actor.worker.can_manage_schedule_engine) === 1;
  if (!isManager) throw new PilotAuthError('EMPLOYEE_READ_FORBIDDEN', 403);
  const target = await db.prepare(
    `SELECT 1 AS allowed FROM pilot_employee_supervision s
     JOIN workers w ON w.id=s.employee_id AND w.is_active=1
     WHERE s.manager_employee_id=? AND s.employee_id=? AND s.is_active=1`,
  ).bind(actor.employeeId, targetEmployeeId).first<any>();
  if (!target) throw new PilotAuthError('EMPLOYEE_READ_FORBIDDEN', 403);
}

export function authorizeWorklogWrite(actor: AuthenticatedActor, subjectEmployeeId: string): void {
  if (actor.worker.access_role !== 'EDITOR') throw new PilotAuthError('ACTOR_PERMISSION_DENIED', 403);
  if (actor.employeeId !== subjectEmployeeId) throw new PilotAuthError('WORKLOG_SUBJECT_MISMATCH', 403);
}
