import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';

import {
  applyV3FoundationServer,
  getAllProjectProgressFoundationsServer,
  previewV3FoundationServer,
} from '../worker/services/v3FoundationService';

const persistPath = process.env.V3_LOCAL_D1_PERSIST_TO;
const configPath = process.env.V3_LOCAL_WRANGLER_CONFIG;
const enabled = Boolean(persistPath && configPath);

describe.runIf(enabled)('V3 foundation local D1 dry run', () => {
  let platform: PlatformProxy<{ DB: D1Database }>;

  beforeAll(async () => {
    platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath,
      persist: { path: persistPath! },
      remoteBindings: false,
      envFiles: [],
    });
  }, 30_000);

  afterAll(async () => {
    await platform?.dispose();
  });

  it('previews, applies, and reapplies idempotently against a restored QA copy', async () => {
    const cutoverDate = '2026-08-11';
    const preview = await previewV3FoundationServer(platform.env.DB, cutoverDate);

    expect(preview.total_projects).toBeGreaterThan(0);
    expect(preview.total_tasks).toBeGreaterThan(0);
    expect(preview.tasks).toHaveLength(preview.total_tasks);

    const options = {
      cutoverDate,
      environmentName: 'local-qa-dry-run',
      sourceSchemaFingerprint: 'e3f4e50e61a773910de265e3e2a30a97c58b9963f2da301272ccd04cb4666d17',
      sourceHead: 'LOCAL_DRY_RUN',
      actor: {
        actorMode: 'SYSTEM_MIGRATION' as const,
        actorUserId: 'SYSTEM_MIGRATION',
        actorEmployeeId: null,
        selectedViewEmployeeId: null,
        testSessionId: 'LOCAL_QA_DRY_RUN_20260812',
      },
    };

    const first = await applyV3FoundationServer(platform.env.DB, options);
    expect(first.total_projects).toBe(preview.total_projects);
    expect(first.total_tasks).toBe(preview.total_tasks);
    expect(first.bootstrap_insert_count).toBe(preview.total_tasks);

    const foundations = await getAllProjectProgressFoundationsServer(platform.env.DB, cutoverDate);
    expect(foundations.size).toBe(preview.total_projects);
    for (const foundation of foundations.values()) {
      expect(foundation.baseline_version).toBe(1);
      expect(foundation.forecast_version).toBe(1);
      expect(foundation.current_forecast_start_date).toBe(foundation.baseline_start_date);
      expect(foundation.current_forecast_end_date).toBe(foundation.baseline_end_date);
      expect(foundation.schedule_variance_workdays).toBe(0);
    }

    const baselineIsolationCandidate = await platform.env.DB.prepare(
      `SELECT t.id AS task_id, t.end_date AS current_end_date,
              tb.baseline_end_date AS snapshot_end_date
       FROM tasks t
       JOIN task_baselines tb ON tb.task_id = t.id
       WHERE t.end_date IS NOT NULL AND tb.baseline_end_date IS NOT NULL
       ORDER BY t.id
       LIMIT 1`,
    ).first<{ task_id: string; current_end_date: string; snapshot_end_date: string }>();
    expect(baselineIsolationCandidate).toBeTruthy();
    if (baselineIsolationCandidate) {
      const temporaryEndDate = baselineIsolationCandidate.current_end_date === '2099-12-31'
        ? '2099-12-30'
        : '2099-12-31';
      await platform.env.DB.prepare('UPDATE tasks SET end_date = ? WHERE id = ?')
        .bind(temporaryEndDate, baselineIsolationCandidate.task_id)
        .run();
      const unchangedSnapshot = await platform.env.DB.prepare(
        'SELECT baseline_end_date FROM task_baselines WHERE task_id = ? LIMIT 1',
      ).bind(baselineIsolationCandidate.task_id).first<{ baseline_end_date: string }>();
      expect(unchangedSnapshot?.baseline_end_date).toBe(baselineIsolationCandidate.snapshot_end_date);
      await platform.env.DB.prepare('UPDATE tasks SET end_date = ? WHERE id = ?')
        .bind(baselineIsolationCandidate.current_end_date, baselineIsolationCandidate.task_id)
        .run();
    }

    const second = await applyV3FoundationServer(platform.env.DB, options);
    expect(second).toMatchObject({
      baseline_project_insert_count: 0,
      baseline_task_insert_count: 0,
      forecast_insert_count: 0,
      forecast_task_insert_count: 0,
      bootstrap_insert_count: 0,
      completion_event_insert_count: 0,
      progress_snapshot_insert_count: 0,
      update_count: 0,
      duplicate_count: 0,
    });

    console.info('V3_LOCAL_DRY_RUN', JSON.stringify({
      preview: {
        total_projects: preview.total_projects,
        total_tasks: preview.total_tasks,
        completed_bootstrap_tasks: preview.completed_bootstrap_tasks,
        partial_bootstrap_tasks: preview.partial_bootstrap_tasks,
        future_tasks: preview.future_tasks,
        unknown_source_tasks: preview.unknown_source_tasks,
      },
      first,
      second,
    }));
  }, 120_000);
});
