// tests/spaFallback.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import worker from '../worker/index';

describe('SPA Fallback & Unregistered API Protection Tests', () => {
  const wranglerPath = path.join(process.cwd(), 'wrangler.jsonc');

  it('1. wrangler.jsonc contains not_found_handling = single-page-application', () => {
    const content = fs.readFileSync(wranglerPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.assets).toBeDefined();
    expect(parsed.assets.not_found_handling).toBe('single-page-application');
  });

  it('2. Unregistered /api/* route returns JSON 404 response with code API_NOT_FOUND', async () => {
    const req = new Request('https://concost-dev-scheduler.eumditravel.workers.dev/api/not-existing', {
      method: 'GET',
    });
    const mockEnv = { DB: {} };
    const res = await worker.fetch(req, mockEnv as any);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('API_NOT_FOUND');
    expect(json.error?.message).toContain('API 경로를 찾을 수 없습니다.');
  });
});
