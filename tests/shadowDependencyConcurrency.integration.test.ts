import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { idempotentShadowMutation, reviewDependencies } from '../worker/services/shadowScheduleService';

const configPath = process.env.SHADOW_CONCURRENCY_WRANGLER_CONFIG;
const persistPath = process.env.SHADOW_CONCURRENCY_PERSIST_TO;
const enabled = Boolean(configPath && persistPath);
const actor = {
  actorMode: 'TEST_SELECTOR' as const,
  actorUserId: 'manager', actorEmployeeId: 'manager', selectedViewEmployeeId: 'manager',
  testSessionId: 'CHECKPOINT3A_DEPENDENCY_CONCURRENCY',
};

describe.runIf(enabled)('Checkpoint 3A dependency graph concurrency', () => {
  let platform: PlatformProxy<{ DB: D1Database }>;
  beforeAll(async () => {
    platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath, persist: { path: persistPath! }, remoteBindings: false, envFiles: [],
    });
  });
  afterAll(async () => { await platform?.dispose(); });

  it('allows exactly one of two opposite confirmations and leaves an acyclic graph', async () => {
    const settled = await Promise.allSettled([
      reviewDependencies(platform.env.DB, actor, ['a-to-b'], 'CONFIRM', {}),
      reviewDependencies(platform.env.DB, actor, ['b-to-a'], 'CONFIRM', {}),
    ]);
    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejection = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    expect(rejection?.reason).toMatchObject({ code: 'SHADOW_RUN_INPUT_CHANGED', status: 409 });
    const rows = await platform.env.DB.prepare(`SELECT dependency_id,status FROM task_dependencies ORDER BY dependency_id`).all<any>();
    expect(rows.results.filter((row) => row.status === 'CONFIRMED')).toHaveLength(1);
    expect(rows.results.filter((row) => row.status === 'PROPOSED')).toHaveLength(2);
    const audit = await platform.env.DB.prepare(`SELECT COUNT(*) AS count FROM shadow_engine_audit_events WHERE event_type='DEPENDENCY_CONFIRMED'`).first<any>();
    expect(Number(audit?.count)).toBe(1);
  });

  it('rolls back the domain mutation when the idempotency response cannot commit, then replays once', async () => {
    await platform.env.DB.prepare(`CREATE TRIGGER fail_idempotency_response BEFORE UPDATE ON shadow_engine_idempotency_keys
      BEGIN SELECT RAISE(ABORT,'FAIL_RESPONSE'); END`).run();
    const operation = () => idempotentShadowMutation(platform.env.DB, 'atomic-review-key', 'DEPENDENCY_CONFIRM', { id: 'c-to-d' },
      (commit) => reviewDependencies(platform.env.DB, actor, ['c-to-d'], 'CONFIRM', {}, commit));
    await expect(operation()).rejects.toThrow();
    await platform.env.DB.prepare(`DROP TRIGGER fail_idempotency_response`).run();
    expect(await platform.env.DB.prepare(`SELECT status FROM task_dependencies WHERE dependency_id='c-to-d'`).first<any>())
      .toMatchObject({ status: 'PROPOSED' });
    expect(Number((await platform.env.DB.prepare(`SELECT COUNT(*) AS count FROM shadow_engine_audit_events WHERE entity_id='c-to-d'`).first<any>())?.count)).toBe(0);

    const first = await operation();
    const replay = await operation();
    expect(replay).toEqual(first);
    expect(Number((await platform.env.DB.prepare(`SELECT COUNT(*) AS count FROM shadow_engine_audit_events WHERE entity_id='c-to-d'`).first<any>())?.count)).toBe(1);
  });
});
