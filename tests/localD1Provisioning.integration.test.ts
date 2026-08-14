import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';

const persistPath = process.env.LOCAL_D1_PERSIST_TO;
const configPath = process.env.LOCAL_D1_WRANGLER_CONFIG || process.env.V3_LOCAL_WRANGLER_CONFIG;
const enabled = Boolean(persistPath && configPath);

describe.runIf(enabled)('migration-backed local D1 provisioning', () => {
  let platform: PlatformProxy<{ DB: D1Database }>;

  beforeAll(async () => {
    platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath,
      persist: { path: persistPath! },
      remoteBindings: false,
      envFiles: [],
    });
  }, 30_000);

  afterAll(async () => { await platform?.dispose(); });

  it('applies the repository migrations through 0036 and exposes worklog approval schema', async () => {
    const db = platform.env.DB;
    await expect(db.prepare(`SELECT COUNT(*) AS count FROM worklog_approval_events`).first<{ count: number }>())
      .resolves.toMatchObject({ count: 0 });
    await expect(db.prepare(`SELECT approval_status FROM daily_worklogs LIMIT 1`).first<{ approval_status: string | null }>())
      .resolves.toBeNull();
  });
});
