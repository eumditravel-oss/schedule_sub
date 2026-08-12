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
  ])('fails closed when the apply flag is %s (%s)', async (flag, actor) => {
    let prepared = false;
    const env: any = {
      DYNAMIC_SCHEDULER_OFFICIAL_APPLY_ENABLED: flag,
      DB: { prepare: () => { prepared = true; throw new Error('APPLY_MUST_NOT_REACH_DB'); } },
    };
    const response = await worker.fetch(request(actor === 'editor' ? { 'X-Editor-Name': 'editor' } : {}), env);
    const body: any = await response.json();
    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('OFFICIAL_APPLY_DISABLED');
    expect(prepared).toBe(false);
  });
});
