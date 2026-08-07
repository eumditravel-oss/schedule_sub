import { test, expect } from '@playwright/test';

test.describe('Phase 2 Integration REST API v1 - Health & Auth Verification', () => {
  test('GET /api/integrations/v1/health returns HTTP 200 without authentication', async ({ request }) => {
    const res = await request.get('/api/integrations/v1/health');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
  });

  test('GET /api/integrations/v1/openapi.json returns HTTP 200 OpenAPI specification', async ({ request }) => {
    const res = await request.get('/api/integrations/v1/openapi.json');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.openapi).toBe('3.0.3');
    expect(body.info.title).toContain('Dev Scheduler');
  });

  test('Protected endpoint returns HTTP 401 UNAUTHORIZED_MISSING_BEARER without token', async ({ request }) => {
    const res = await request.get('/api/integrations/v1/workers');
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED_MISSING_BEARER');
  });

  test('Protected endpoint returns HTTP 401 UNAUTHORIZED_INVALID_KEY with invalid token', async ({ request }) => {
    const res = await request.get('/api/integrations/v1/workers', {
      headers: { Authorization: 'Bearer sched_live_invalid_key_999999' },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED_INVALID_KEY');
  });
});
