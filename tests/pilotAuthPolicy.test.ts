import { describe, expect, it } from 'vitest';
import {
  authorizeEmployeeRead,
  authorizeWorklogWrite,
  createPilotPinSalt,
  createQaTestSession,
  derivePilotPinHash,
  expiredSessionCookie,
  getPilotSession,
  logoutPilotSession,
  pilotLogin,
  PilotAuthError,
  PILOT_PIN_ITERATIONS,
  requireCsrf,
  resolveAuthenticatedActor,
  sha256Hex,
} from '../worker/services/pilotAuthService';
import worker, { canManageCountryCalendar, canManageOfficialSchedule } from '../worker/index';

function authDb() {
  const credentials = new Map<string, any>();
  const sessions = new Map<string, any>();
  const audits: any[] = [];
  const queries: string[] = [];
  const workers = new Map<string, any>([
    ['primary', { id: 'primary', name: 'Primary', is_active: 1, access_role: 'EDITOR', country_code: 'KR', can_manage_schedule_engine: 0, can_manage_country_calendar: 0, can_manage_integrations: 0 }],
    ['manager', { id: 'manager', name: 'Manager', is_active: 1, access_role: 'EDITOR', country_code: 'KR', can_manage_schedule_engine: 1, can_manage_country_calendar: 1, can_manage_integrations: 0 }],
    ['calendar', { id: 'calendar', name: 'Calendar', is_active: 1, access_role: 'EDITOR', country_code: 'KR', can_manage_schedule_engine: 0, can_manage_country_calendar: 1, can_manage_integrations: 0 }],
    ['other', { id: 'other', name: 'Other', is_active: 1, access_role: 'EDITOR', country_code: 'VN', can_manage_schedule_engine: 0, can_manage_country_calendar: 0, can_manage_integrations: 0 }],
    ['ceo', { id: 'ceo', name: 'CEO', is_active: 1, access_role: 'VIEWER', country_code: 'KR', can_manage_schedule_engine: 0, can_manage_country_calendar: 0, can_manage_integrations: 0 }],
  ]);
  const supervision = new Set(['manager:primary']);
  const db: any = {
    prepare(sql: string) {
      queries.push(sql);
      let args: any[] = [];
      const statement: any = {
        bind(...values: any[]) { args = values; return statement; },
        async first() {
          if (sql.includes('FROM pilot_auth_credentials WHERE employee_id')) return credentials.get(args[0]) || null;
          if (sql.includes('SELECT failed_attempt_count,locked_until')) {
            const value = credentials.get(args[0]); return value ? { failed_attempt_count: value.failed_attempt_count, locked_until: value.locked_until } : null;
          }
          if (sql.includes('FROM workers w LEFT JOIN office_work_policies')) return workers.get(args[0]) || null;
          if (sql.includes('FROM workers WHERE id = ?')) return workers.get(args[0]) || null;
          if (sql.includes('FROM pilot_auth_sessions s')) {
            const session = [...sessions.values()].find((item) => item.session_token_hash === args[0]);
            return session ? { ...session, is_enabled: credentials.get(session.employee_id)?.is_enabled } : null;
          }
          if (sql.includes('SELECT expires_at FROM pilot_auth_sessions')) {
            const session = sessions.get(args[0]); return session ? { expires_at: session.expires_at } : null;
          }
          if (sql.includes('SELECT csrf_token_hash FROM pilot_auth_sessions')) {
            const session = sessions.get(args[0]); return session && !session.revoked_at ? { csrf_token_hash: session.csrf_token_hash } : null;
          }
          if (sql.includes('FROM pilot_employee_supervision')) return supervision.has(`${args[0]}:${args[1]}`) ? { allowed: 1 } : null;
          if (sql.includes('SELECT is_enabled FROM pilot_auth_credentials')) return credentials.get(args[0]) || null;
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO pilot_auth_sessions')) {
            const [session_id, employee_id, session_token_hash, csrf_token_hash, created_at, expires_at, last_seen_at, created_user_agent_hash, created_ip_hash] = args;
            sessions.set(session_id, { session_id, employee_id, session_token_hash, csrf_token_hash, created_at, expires_at, last_seen_at, created_user_agent_hash, created_ip_hash, revoked_at: null });
          } else if (sql.includes('INSERT INTO pilot_auth_audit_events')) {
            audits.push({ event_type: args[3], employee_id: args[1], session_id: args[2] });
          } else if (sql.includes('failed_attempt_count=failed_attempt_count+1')) {
            const item = credentials.get(args[3]);
            if (item && (!item.locked_until || Date.parse(item.locked_until) <= Date.parse(args[4]))) {
              item.failed_attempt_count += 1;
              if (item.failed_attempt_count >= args[0]) item.locked_until = args[1];
            }
          } else if (sql.includes('SET failed_attempt_count=0,locked_until=NULL')) {
            const item = credentials.get(args[1]);
            if (item && (!item.locked_until || Date.parse(item.locked_until) <= Date.parse(args[2]))) { item.failed_attempt_count = 0; item.locked_until = null; return { meta: { changes: 1 } }; }
            return { meta: { changes: 0 } };
          } else if (sql.includes('SET revoked_at')) {
            const item = sessions.get(args[1]) || [...sessions.values()].find((row) => row.session_token_hash === args[1]);
            if (item) item.revoked_at = args[0];
          } else if (sql.includes('SET last_seen_at')) {
            const item = sessions.get(args[1]); if (item) item.last_seen_at = args[0];
          } else if (sql.includes('SET csrf_token_hash')) {
            const item = sessions.get(args[2]); if (item) { item.csrf_token_hash = args[0]; item.last_seen_at = args[1]; }
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db, credentials, sessions, audits, workers, queries };
}

const envFor = (db: any) => ({ DB: db, ENVIRONMENT_NAME: 'qa', PILOT_SESSION_AUTH_ENABLED: 'true', TEST_ACTOR_MODE: 'true', PILOT_SESSION_TTL_SECONDS: '43200', QA_TEST_ACTOR_SECRET: 'qa-test-secret' });
const request = (cookie?: string, csrf?: string, options: { origin?: string; qaSecret?: string; path?: string } = {}) => new Request(`https://scheduler-qa.example${options.path || '/api/auth/pilot/session'}`, {
  headers: {
    ...(cookie ? { Cookie: cookie } : {}),
    ...(csrf || options.origin ? { Origin: options.origin || 'https://scheduler-qa.example' } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...(options.qaSecret ? { 'X-QA-Test-Secret': options.qaSecret } : {}),
  },
});

function routeRequest(path: string, options: { cookie?: string; csrf?: string; headers?: Record<string, string>; body?: unknown; method?: string } = {}) {
  return new Request(`https://scheduler-qa.example${path}`, {
    method: options.method || 'POST',
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.csrf ? { Origin: 'https://scheduler-qa.example', 'X-CSRF-Token': options.csrf } : {}),
      ...(options.headers || {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function routeLogin(state: ReturnType<typeof authDb>, employeeId: string) {
  await seedCredential(state, employeeId);
  return pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId, pin: '123456' });
}

async function seedCredential(state: ReturnType<typeof authDb>, employeeId = 'primary', pin = '123456') {
  const salt = createPilotPinSalt();
  state.credentials.set(employeeId, { employee_id: employeeId, pin_hash: await derivePilotPinHash(pin, salt), pin_salt: salt, pin_iterations: PILOT_PIN_ITERATIONS, is_enabled: 1, failed_attempt_count: 0, locked_until: null });
}

describe('Checkpoint 4.1 pilot authentication primitives', () => {
  it('uses a per-credential PBKDF2 salt instead of a plain SHA-256 PIN hash', async () => {
    const first = createPilotPinSalt();
    const second = createPilotPinSalt();
    expect(first).not.toBe(second);
    expect(await derivePilotPinHash('123456', first, PILOT_PIN_ITERATIONS)).not.toBe(
      await derivePilotPinHash('123456', second, PILOT_PIN_ITERATIONS),
    );
  });

  it('expires only the HttpOnly host cookie on logout/session revocation', () => {
    const cookie = expiredSessionCookie();
    expect(cookie).toContain('__Host-concost-pilot-session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).not.toContain('Domain=');
  });

  it('logs in with a hashed PIN, rotates a host-only cookie, and never stores the raw token', async () => {
    const state = authDb(); await seedCredential(state);
    const login = await pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' });
    const cookie = login.setCookie.match(/__Host-concost-pilot-session=([^;]+)/)?.[1] || '';
    expect(login.data.actor.employeeId).toBe('primary');
    expect(login.setCookie).toContain('HttpOnly; Secure; SameSite=Strict; Path=/');
    expect([...state.sessions.values()][0].session_token_hash).toBe(await sha256Hex(cookie));
    expect(JSON.stringify([...state.sessions.values()])).not.toContain(cookie);
  });

  it('locks the credential after five failed attempts and keeps a correct PIN locked', async () => {
    const state = authDb(); await seedCredential(state);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '000000' })).rejects.toMatchObject({ code: 'LOGIN_FAILED', status: 401 });
    }
    await expect(pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '000000' })).rejects.toMatchObject({ code: 'LOGIN_TEMPORARILY_LOCKED', status: 429 });
    await expect(pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' })).rejects.toMatchObject({ code: 'LOGIN_TEMPORARILY_LOCKED', status: 429 });
  });

  it('requires a live session plus same-origin CSRF, and logout revokes reuse', async () => {
    const state = authDb(); await seedCredential(state);
    const login = await pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' });
    const cookie = login.setCookie.split(';')[0];
    const active = await resolveAuthenticatedActor(request(cookie), envFor(state.db) as any);
    await expect(requireCsrf(request(cookie), envFor(state.db) as any, active)).rejects.toMatchObject({ code: 'CSRF_REQUIRED' });
    await expect(requireCsrf(request(cookie, 'wrong'), envFor(state.db) as any, active)).rejects.toMatchObject({ code: 'CSRF_INVALID' });
    await logoutPilotSession(request(cookie, login.data.csrfToken), envFor(state.db) as any);
    await expect(resolveAuthenticatedActor(request(cookie), envFor(state.db) as any)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('uses explicit supervision for employee reads and preserves self/executive read rules', async () => {
    const state = authDb();
    const makeActor = (employeeId: string) => ({ employeeId, worker: state.workers.get(employeeId), actorMode: 'PILOT_SESSION' as const, actorUserId: employeeId, actorEmployeeId: employeeId, selectedViewEmployeeId: employeeId, testSessionId: null, displayName: employeeId, role: state.workers.get(employeeId).access_role, office: null, timezone: null, sessionId: 's', isQaTestSession: false });
    await expect(authorizeEmployeeRead(state.db, makeActor('primary') as any, 'other')).rejects.toMatchObject({ code: 'EMPLOYEE_READ_FORBIDDEN' });
    await expect(authorizeEmployeeRead(state.db, makeActor('manager') as any, 'primary')).resolves.toBeUndefined();
    await expect(authorizeEmployeeRead(state.db, makeActor('manager') as any, 'other')).rejects.toMatchObject({ code: 'EMPLOYEE_READ_FORBIDDEN' });
    await expect(authorizeEmployeeRead(state.db, makeActor('ceo') as any, 'other')).resolves.toBeUndefined();
    expect(() => authorizeWorklogWrite(makeActor('primary') as any, 'other')).toThrow(PilotAuthError);
  });

  it('rejects cross-origin login, rotates a pre-existing session, and blocks disabled credentials', async () => {
    const state = authDb(); await seedCredential(state);
    await expect(pilotLogin(request(), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' })).rejects.toMatchObject({ code: 'CSRF_REQUIRED', status: 403 });
    await expect(pilotLogin(request(undefined, undefined, { origin: 'https://attacker.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' })).rejects.toMatchObject({ code: 'CSRF_INVALID', status: 403 });
    const first = await pilotLogin(request(undefined, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' });
    const firstCookie = first.setCookie.split(';')[0];
    const second = await pilotLogin(request(firstCookie, undefined, { origin: 'https://scheduler-qa.example' }), envFor(state.db) as any, { employeeId: 'primary', pin: '123456' });
    expect(second.setCookie).not.toContain(firstCookie.split('=')[1]);
    await expect(resolveAuthenticatedActor(request(firstCookie), envFor(state.db) as any)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    state.credentials.get('primary').is_enabled = 0;
    await expect(resolveAuthenticatedActor(request(second.setCookie.split(';')[0]), envFor(state.db) as any)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('isolates QA bootstrap by environment, mode, same-origin request, and secret', async () => {
    const state = authDb(); await seedCredential(state);
    const qaRequest = (secret?: string, origin = 'https://scheduler-qa.example') => request(undefined, undefined, { origin, qaSecret: secret, path: '/api/qa/auth/session' });
    await expect(createQaTestSession(qaRequest('wrong'), envFor(state.db) as any, { employeeId: 'primary' })).rejects.toMatchObject({ code: 'QA_TEST_SECRET_INVALID', status: 403 });
    await expect(createQaTestSession(qaRequest('qa-test-secret', 'https://attacker.example'), envFor(state.db) as any, { employeeId: 'primary' })).rejects.toMatchObject({ code: 'CSRF_INVALID', status: 403 });
    await expect(createQaTestSession(qaRequest('qa-test-secret'), { ...envFor(state.db), ENVIRONMENT_NAME: 'production', TEST_ACTOR_MODE: 'false' } as any, { employeeId: 'primary' })).rejects.toMatchObject({ code: 'QA_TEST_AUTH_DISABLED', status: 404 });
    await expect(createQaTestSession(qaRequest('qa-test-secret'), envFor(state.db) as any, { employeeId: 'primary' })).resolves.toMatchObject({ data: { isQaTestSession: true } });
  });

  it('enforces session and CSRF at Worker routes before spoofed actor values can reach business services', async () => {
    const state = authDb();
    const spoofed = routeRequest('/api/v3/worklogs/morning', {
      headers: { 'x-actor-employee-id': 'primary', 'x-editor-name': 'Primary', 'Idempotency-Key': 'spoofed-no-session' },
      body: { employee_id: 'primary', local_work_date: '2026-08-13', entries: [] },
    });
    const unauthenticated = await worker.fetch(spoofed, envFor(state.db) as any);
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json() as any).error.code).toBe('AUTH_REQUIRED');

    const login = await routeLogin(state, 'other');
    const cookie = login.setCookie.split(';')[0];
    const noCsrf = await worker.fetch(routeRequest('/api/v3/worklogs/morning', {
      cookie, headers: { 'x-actor-employee-id': 'primary', 'Idempotency-Key': 'spoofed-no-csrf' },
      body: { employee_id: 'primary', local_work_date: '2026-08-13', entries: [] },
    }), envFor(state.db) as any);
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json() as any).error.code).toBe('CSRF_REQUIRED');
  });

  it('uses the session actor rather than headers or body subjects at Worker routes', async () => {
    const state = authDb();
    const supportLogin = await routeLogin(state, 'other');
    const supportResult = await worker.fetch(routeRequest('/api/v3/worklogs/morning', {
      cookie: supportLogin.setCookie.split(';')[0], csrf: supportLogin.data.csrfToken,
      headers: { 'x-actor-employee-id': 'primary', 'x-editor-id': 'primary', 'x-selected-view-employee-id': 'primary', 'Idempotency-Key': 'support-spoof-primary' },
      body: { employee_id: 'primary', local_work_date: '2026-08-13', entries: [] },
    }), envFor(state.db) as any);
    expect(supportResult.status).toBe(403);
    expect((await supportResult.json() as any).error.code).toBe('WORKLOG_SUBJECT_MISMATCH');

    const executiveLogin = await routeLogin(state, 'ceo');
    const executiveResult = await worker.fetch(routeRequest('/api/v3/worklogs/morning', {
      cookie: executiveLogin.setCookie.split(';')[0], csrf: executiveLogin.data.csrfToken,
      headers: { 'x-actor-employee-id': 'primary', 'x-editor-name': 'Primary', 'Idempotency-Key': 'ceo-spoof-primary' },
      body: { employee_id: 'primary', local_work_date: '2026-08-13', entries: [] },
    }), envFor(state.db) as any);
    expect(executiveResult.status).toBe(403);
    expect((await executiveResult.json() as any).error.code).toBe('WORKLOG_READ_ONLY_ACTOR');
  });

  it('limits official project and task schedule mutations to schedule managers', async () => {
    const state = authDb();
    const supportLogin = await routeLogin(state, 'other');
    const supportCookie = supportLogin.setCookie.split(';')[0];
    const before = state.queries.length;
    const deniedTaskPatch = await worker.fetch(routeRequest('/api/tasks/task-a', {
      method: 'PATCH', cookie: supportCookie, csrf: supportLogin.data.csrfToken,
      headers: { 'x-actor-employee-id': 'manager' }, body: { progress: 100, primary_worker_id: 'primary' },
    }), envFor(state.db) as any);
    expect(deniedTaskPatch.status).toBe(403);
    expect((await deniedTaskPatch.json() as any).error.code).toBe('SCHEDULE_MANAGER_REQUIRED');

    const deniedProjectCreate = await worker.fetch(routeRequest('/api/projects', {
      method: 'POST', cookie: supportCookie, csrf: supportLogin.data.csrfToken,
      body: { name: 'spoofed official project', start_date: '2026-08-13', end_date: '2026-08-14' },
    }), envFor(state.db) as any);
    expect(deniedProjectCreate.status).toBe(403);
    expect((await deniedProjectCreate.json() as any).error.code).toBe('SCHEDULE_MANAGER_REQUIRED');
    expect(state.queries.slice(before).some((sql) => /(?:INSERT INTO projects|UPDATE tasks|DELETE FROM tasks)/i.test(sql))).toBe(false);

    const managerLogin = await routeLogin(state, 'manager');
    const managerResult = await worker.fetch(routeRequest('/api/tasks/task-a', {
      method: 'PATCH', cookie: managerLogin.setCookie.split(';')[0], csrf: managerLogin.data.csrfToken,
      body: { progress: 100, primary_worker_id: 'primary' },
    }), envFor(state.db) as any);
    // The in-memory fixture has no task-a and therefore returns 404 only
    // after passing the manager gate.  This proves the gate is role-specific.
    expect(managerResult.status).toBe(404);

    expect(canManageOfficialSchedule(state.workers.get('other'))).toBe(false);
    expect(canManageOfficialSchedule(state.workers.get('manager'))).toBe(true);
    expect(canManageOfficialSchedule(state.workers.get('ceo'))).toBe(false);
  });

  it('keeps country calendar and task-shifting calendar writes behind their respective capabilities', async () => {
    const state = authDb();
    const supportLogin = await routeLogin(state, 'other');
    const supportCookie = supportLogin.setCookie.split(';')[0];
    const before = state.queries.length;
    for (const [path, body] of [
      ['/api/calendar/manual-holidays/month', { country_code: 'KR', year: 2026, month: 8, holidays: [] }],
      ['/api/calendar/vietnam-saturdays', { year: 2026, month: 8, saturdays: [], shift_schedule: true }],
    ] as const) {
      const denied = await worker.fetch(routeRequest(path, {
        method: 'PUT', cookie: supportCookie, csrf: supportLogin.data.csrfToken, body,
      }), envFor(state.db) as any);
      expect(denied.status).toBe(403);
      expect((await denied.json() as any).error.code).toBe('CALENDAR_MANAGER_REQUIRED');
    }
    expect(state.queries.slice(before).some((sql) => /(?:country_holidays|calendar_overrides|UPDATE tasks)/i.test(sql))).toBe(false);
    expect(canManageCountryCalendar(state.workers.get('other'))).toBe(false);
    expect(canManageCountryCalendar(state.workers.get('calendar'))).toBe(true);
    expect(canManageOfficialSchedule(state.workers.get('calendar'))).toBe(false);
    expect(canManageOfficialSchedule(state.workers.get('manager'))).toBe(true);

    const calendarLogin = await routeLogin(state, 'calendar');
    const calendarCannotShift = await worker.fetch(routeRequest('/api/calendar/manual-holidays/month', {
      method: 'PUT', cookie: calendarLogin.setCookie.split(';')[0], csrf: calendarLogin.data.csrfToken,
      body: { country_code: 'KR', year: 2026, month: 8, holidays: [] },
    }), envFor(state.db) as any);
    expect(calendarCannotShift.status).toBe(403);
    expect((await calendarCannotShift.json() as any).error.code).toBe('SCHEDULE_MANAGER_REQUIRED');
  });

  it('enforces employee read scope and revokes disabled sessions at Worker routes', async () => {
    const state = authDb();
    const primaryLogin = await routeLogin(state, 'primary');
    const crossEmployee = await worker.fetch(routeRequest('/api/v3/capacity/day?employee_id=other&local_work_date=2026-08-13', {
      method: 'GET', cookie: primaryLogin.setCookie.split(';')[0],
      headers: { 'x-actor-employee-id': 'other' },
    }), envFor(state.db) as any);
    expect(crossEmployee.status).toBe(403);
    expect((await crossEmployee.json() as any).error.code).toBe('EMPLOYEE_READ_FORBIDDEN');

    state.credentials.get('primary').is_enabled = 0;
    const disabledSession = await worker.fetch(routeRequest('/api/v3/forecast/projects/project-a/current', {
      method: 'GET', cookie: primaryLogin.setCookie.split(';')[0], headers: { 'x-actor-employee-id': 'manager' },
    }), envFor(state.db) as any);
    expect(disabledSession.status).toBe(401);
    expect((await disabledSession.json() as any).error.code).toBe('SESSION_REVOKED');
  });

  it('does not expose the QA bootstrap route outside the QA test-actor environment', async () => {
    const state = authDb();
    const response = await worker.fetch(routeRequest('/api/qa/auth/session', {
      headers: { Origin: 'https://scheduler-qa.example', 'X-QA-Test-Secret': 'qa-test-secret' },
      body: { employeeId: 'primary' },
    }), { ...envFor(state.db), ENVIRONMENT_NAME: 'production', TEST_ACTOR_MODE: 'false' } as any);
    expect(response.status).toBe(404);
    expect((await response.json() as any).error.code).toBe('QA_TEST_AUTH_DISABLED');
  });
});
