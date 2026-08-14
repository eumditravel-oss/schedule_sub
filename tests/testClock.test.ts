import { describe, expect, it } from 'vitest';
import { canUseQaTestClock, resolveQaRequestNow } from '../worker/services/testClock';

const actor = { actorMode: 'TEST_SELECTOR', isQaTestSession: false };

describe('QA test clock', () => {
  it('accepts a deterministic clock only for explicitly enabled QA', () => {
    const request = new Request('https://qa.example/api/v3/worklogs/eod', {
      headers: { 'x-test-now-utc': '2026-08-14T00:10:00.000Z' },
    });
    const fallback = new Date('2026-08-14T00:00:00.000Z');
    expect(canUseQaTestClock({ ENVIRONMENT_NAME: 'qa', QA_TEST_CLOCK_ENABLED: 'true' }, actor)).toBe(true);
    expect(resolveQaRequestNow(request, { ENVIRONMENT_NAME: 'qa', QA_TEST_CLOCK_ENABLED: 'true' }, actor, fallback).toISOString())
      .toBe('2026-08-14T00:10:00.000Z');
  });

  it('ignores the override in Production, Pilot, and disabled QA', () => {
    const request = new Request('https://example/api', { headers: { 'x-test-now-utc': '1999-01-01T00:00:00.000Z' } });
    const fallback = new Date('2026-08-14T00:00:00.000Z');
    for (const env of [
      { ENVIRONMENT_NAME: 'production', QA_TEST_CLOCK_ENABLED: 'true' },
      { ENVIRONMENT_NAME: 'pilot', QA_TEST_CLOCK_ENABLED: 'true' },
      { ENVIRONMENT_NAME: 'qa', QA_TEST_CLOCK_ENABLED: 'false' },
    ]) {
      expect(canUseQaTestClock(env, actor)).toBe(false);
      expect(resolveQaRequestNow(request, env, actor, fallback)).toBe(fallback);
    }
  });

  it('requires a valid ISO timestamp and does not let malformed input change time', () => {
    const request = new Request('https://qa.example/api', { headers: { 'x-test-now-utc': 'not-a-date' } });
    const fallback = new Date('2026-08-14T00:00:00.000Z');
    expect(resolveQaRequestNow(request, { ENVIRONMENT_NAME: 'qa', QA_TEST_CLOCK_ENABLED: 'true' }, actor, fallback)).toBe(fallback);
  });
});
