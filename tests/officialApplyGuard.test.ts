import { describe, expect, it } from 'vitest';
import worker from '../worker/index';

describe('Official Forecast apply safety guard', () => {
  const request = (headers: Record<string, string> = {}) => new Request('https://scheduler.test/api/admin/v3-foundation/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });

  it.each([
    ['false', 'editor'],
    [undefined, 'admin'],
  ])('requires a session before the disabled apply route can be evaluated (%s)', async (flag, actor) => {
    let prepared = false;
    const env: any = {
      DYNAMIC_SCHEDULER_OFFICIAL_APPLY_ENABLED: flag,
      DB: { prepare: () => { prepared = true; throw new Error('APPLY_MUST_NOT_REACH_DB'); } },
    };
    const response = await worker.fetch(request(actor === 'editor' ? { 'X-Editor-Name': 'editor' } : {}), env);
    const body: any = await response.json();
    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_REQUIRED');
    expect(prepared).toBe(false);
  });
});
