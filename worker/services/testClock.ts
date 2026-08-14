/**
 * QA-only deterministic clock.
 *
 * The override is deliberately gated by the server environment, never by a
 * browser-controlled flag. Production (and any unknown environment) always
 * uses the real wall clock, even when a client sends x-test-now-utc.
 */
export type QaTestClockEnv = {
  ENVIRONMENT_NAME?: string;
  QA_TEST_CLOCK_ENABLED?: string;
};

export type QaTestClockActor = {
  actorMode?: string | null;
  isQaTestSession?: boolean;
};

export function canUseQaTestClock(env: QaTestClockEnv, actor?: QaTestClockActor | null): boolean {
  if (String(env.ENVIRONMENT_NAME || '').trim().toLowerCase() !== 'qa') return false;
  if (String(env.QA_TEST_CLOCK_ENABLED || '').trim().toLowerCase() !== 'true') return false;
  // A QA test session is preferred. TEST_SELECTOR is allowed only when the
  // QA flag is explicitly enabled (the open_test QA harness has no session).
  return actor?.isQaTestSession === true || actor?.actorMode === 'TEST_SELECTOR';
}

export function resolveQaRequestNow(
  request: Request,
  env: QaTestClockEnv,
  actor?: QaTestClockActor | null,
  fallback = new Date(),
): Date {
  if (!canUseQaTestClock(env, actor)) return fallback;
  const raw = request.headers.get('x-test-now-utc')?.trim() || '';
  if (!raw) return fallback;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp) : fallback;
}
