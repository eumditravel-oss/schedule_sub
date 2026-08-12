import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import {
  executeShadowRun,
  generateDependencyCandidates,
  getCurrentProjectShadow,
  idempotentShadowMutation,
  listDependencies,
  officialDataFingerprint,
  reviewDependencies,
  runShadowForActor,
  ShadowScheduleError,
} from '../worker/services/shadowScheduleService';

const persistPath = process.env.SHADOW_LOCAL_D1_PERSIST_TO;
const configPath = process.env.SHADOW_LOCAL_WRANGLER_CONFIG;
const enabled = Boolean(persistPath && configPath);
const projectId = 'prj_1786324719846_dmo5';
const managerActor = {
  actorMode: 'TEST_SELECTOR' as const,
  actorUserId: 'wrk_02',
  actorEmployeeId: 'wrk_02',
  selectedViewEmployeeId: 'wrk_02',
  testSessionId: 'CHECKPOINT3A_LOCAL_D1',
};
const executiveActor = { ...managerActor, actorUserId: 'wrk_00_ceo', actorEmployeeId: 'wrk_00_ceo', selectedViewEmployeeId: 'wrk_00_ceo' };

describe.runIf(enabled)('Checkpoint 3A local restored D1 integration', () => {
  let platform: PlatformProxy<{ DB: D1Database }>;

  beforeAll(async () => {
    platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath, persist: { path: persistPath! }, remoteBindings: false, envFiles: [],
    });
    await platform.env.DB.batch([
      platform.env.DB.prepare(`DELETE FROM shadow_capacity_allocations`),
      platform.env.DB.prepare(`DELETE FROM shadow_impact_task_diffs`),
      platform.env.DB.prepare(`DELETE FROM shadow_schedule_tasks`),
      platform.env.DB.prepare(`DELETE FROM shadow_impact_summaries`),
      platform.env.DB.prepare(`DELETE FROM shadow_schedule_versions`),
      platform.env.DB.prepare(`DELETE FROM schedule_engine_input_snapshots`),
      platform.env.DB.prepare(`DELETE FROM schedule_recalculation_runs`),
      platform.env.DB.prepare(`DELETE FROM schedule_recalculation_requests`),
      platform.env.DB.prepare(`DELETE FROM shadow_engine_audit_events`),
      platform.env.DB.prepare(`DELETE FROM shadow_engine_idempotency_keys`),
      platform.env.DB.prepare(`DELETE FROM task_constraints`),
      platform.env.DB.prepare(`DELETE FROM project_priorities`),
      platform.env.DB.prepare(`DELETE FROM task_dependencies`),
    ]);
  }, 30_000);

  afterAll(async () => { await platform?.dispose(); });

  it('generates only PROPOSED dependencies and stores manager relationship authority', async () => {
    const generated = await generateDependencyCandidates(platform.env.DB, managerActor, projectId);
    expect(generated.savedCount).toBeGreaterThan(0);
    const listed = await listDependencies(platform.env.DB, managerActor, { project_id: projectId });
    expect(listed.permissions.canReview).toBe(true);
    expect(listed.dependencies.length).toBe(generated.savedCount);
    expect(listed.dependencies.every((dependency: any) => dependency.status === 'PROPOSED')).toBe(true);

    const executive = await listDependencies(platform.env.DB, executiveActor, { project_id: projectId });
    expect(executive.permissions).toEqual({ canReview: false, readOnly: true });
    await expect(reviewDependencies(platform.env.DB, executiveActor, [listed.dependencies[0].dependency_id], 'CONFIRM', {}))
      .rejects.toMatchObject({ code: 'DEPENDENCY_PERMISSION_DENIED', status: 403 });
  });

  it('confirms an edge, guards the graph, creates Shadow-only rows, and reuses identical input', async () => {
    const before = await officialDataFingerprint(platform.env.DB);
    const listed = await listDependencies(platform.env.DB, managerActor, { project_id: projectId, status: 'PROPOSED' });
    expect(listed.dependencies.length).toBeGreaterThan(0);
    await reviewDependencies(platform.env.DB, managerActor, [listed.dependencies[0].dependency_id], 'CONFIRM', { lagWorkMinutes: 0 });

    const first = await runShadowForActor(platform.env.DB, managerActor, {
      project_id: projectId, trigger_type: 'MANUAL', planning_cutoff_utc: '2026-08-12T05:00:00.000Z', planning_cutoff_local_date: '2026-08-12',
    }, 'checkpoint3a-local-run-1');
    expect(first.officialForecastChanged).toBe(false);
    expect(first.run.mode).toBe('SHADOW');
    expect(first.versions.length).toBeGreaterThan(0);
    expect(first.tasks.length).toBeGreaterThan(0);
    expect(first.diffs.length).toBe(first.tasks.length);
    expect(first.allocations).toHaveLength(0);
    expect(first.versions.every((version: any) => version.official_forecast_end_date === version.shadow_forecast_end_date)).toBe(true);

    const countsBefore = await platform.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM schedule_recalculation_runs) AS runs,
      (SELECT COUNT(*) FROM shadow_schedule_tasks) AS tasks,
      (SELECT COUNT(*) FROM shadow_capacity_allocations) AS allocations`).first<any>();
    const second = await runShadowForActor(platform.env.DB, managerActor, {
      project_id: projectId, trigger_type: 'MANUAL', planning_cutoff_utc: '2026-08-12T05:00:00.000Z', planning_cutoff_local_date: '2026-08-12',
    }, 'checkpoint3a-local-run-2');
    const countsAfter = await platform.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM schedule_recalculation_runs) AS runs,
      (SELECT COUNT(*) FROM shadow_schedule_tasks) AS tasks,
      (SELECT COUNT(*) FROM shadow_capacity_allocations) AS allocations`).first<any>();
    expect(second.reused).toBe(true);
    expect(countsAfter).toEqual(countsBefore);
    expect(await officialDataFingerprint(platform.env.DB)).toBe(before);

    const current = await getCurrentProjectShadow(platform.env.DB, executiveActor, projectId);
    expect(current.run.run_id).toBe(first.run.run_id);
    expect(current.officialForecastChanged).toBe(false);
  }, 120_000);

  it('enforces idempotency conflicts without mutating official rows', async () => {
    const before = await officialDataFingerprint(platform.env.DB);
    await executeShadowRun(platform.env.DB, {
      projectId, planningCutoffUtc: '2026-08-13T00:00:00.000Z', planningCutoffLocalDate: '2026-08-13',
      idempotencyKey: 'checkpoint3a-conflict-key', requestedBy: 'wrk_02', triggerType: 'MANUAL', actor: null,
    });
    await expect(executeShadowRun(platform.env.DB, {
      projectId, planningCutoffUtc: '2026-08-14T00:00:00.000Z', planningCutoffLocalDate: '2026-08-14',
      idempotencyKey: 'checkpoint3a-conflict-key', requestedBy: 'wrk_02', triggerType: 'MANUAL', actor: null,
    })).rejects.toBeInstanceOf(ShadowScheduleError);
    expect(await officialDataFingerprint(platform.env.DB)).toBe(before);
  }, 120_000);

  it('replays a guarded manager mutation and rejects the same key with different input', async () => {
    let mutationCount = 0;
    const first = await idempotentShadowMutation(platform.env.DB, 'checkpoint3a-manager-idem', 'TEST_MUTATION', { value: 1 }, async () => {
      mutationCount += 1;
      return { mutationCount };
    });
    const replay = await idempotentShadowMutation(platform.env.DB, 'checkpoint3a-manager-idem', 'TEST_MUTATION', { value: 1 }, async () => {
      mutationCount += 1;
      return { mutationCount };
    });
    expect(first).toEqual({ mutationCount: 1 });
    expect(replay).toEqual(first);
    expect(mutationCount).toBe(1);
    await expect(idempotentShadowMutation(platform.env.DB, 'checkpoint3a-manager-idem', 'TEST_MUTATION', { value: 2 }, async () => ({ ok: true })))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
  });
});
