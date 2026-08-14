import { describe, expect, it } from 'vitest';
import { getScheduleComparison } from '../worker/services/scheduleComparisonService';

describe('Checkpoint 6 schedule comparison read model', () => {
  it('keeps the four layers and does not invent actual dates', async () => {
    const project = { id: 'p1', name: 'Pilot project', status: 'ACTIVE', start_date: '2026-08-10', end_date: '2026-08-15' };
    const task = { id: 't1', project_id: 'p1', task_name: 'Task A', worker_name: 'wrk_01', primary_worker_id: 'wrk_01', start_date: '2026-08-10', end_date: '2026-08-15', progress: 0 };
    const worker = { id: 'wrk_01', name: 'Manager', country_code: 'KR', workweek_profile: 'MON_FRI' };
    let prepareCount = 0;
    const db: any = {
      prepare: (sql: string) => ({
        ...(() => { prepareCount += 1; return {}; })(),
        bind: (...args: any[]) => ({
          first: async () => sql.includes('FROM projects WHERE id') ? project : null,
          all: async () => ({ results: sql.includes('FROM tasks WHERE project_id') ? [task] : [] }),
        }),
        first: async () => sql.includes('FROM projects WHERE id') ? project : null,
        all: async () => ({ results: sql.includes('FROM workers') ? [worker] : [] }),
      }),
    };

    const result = await getScheduleComparison(db, { projectId: 'p1', asOf: '2026-08-14' });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.project.id).toBe('p1');
    expect(result.asOf).toBe('2026-08-14');
    expect(result.baseline).toBeDefined();
    expect(result.officialForecast).toBeDefined();
    expect(result.actual.provenance).toEqual(['NONE']);
    expect(result.actual.first_activity_date).toBeNull();
    expect(result.actual.latest_activity_date).toBeNull();
    expect(result.taskRows[0].actual.activity_dates).toEqual([]);
    expect(result.shadow.fresh).toBe(false);
    expect(result.taskRows[0].shadow.start).toBeNull();
    // The model uses a fixed batch of reads (including optional provenance and
    // calendar tables); it must remain bounded rather than growing per task.
    expect(prepareCount).toBeLessThan(35);
  });

  it('does not expose an applied or forecast-mismatched Shadow as fresh', async () => {
    const task = { id: 't1', project_id: 'p1', task_name: 'Task A', worker_name: 'wrk_01', primary_worker_id: 'wrk_01', start_date: '2026-08-10', end_date: '2026-08-15', progress: 0 };
    const shadowVersion = {
      shadow_version_id: 'shadow-applied', project_id: 'p1', status: 'CURRENT', apply_status: 'APPLIED',
      based_on_forecast_version_id: 'old-forecast', shadow_forecast_end_date: '2026-08-15',
    };
    const db: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => sql.includes('FROM projects WHERE id') ? { id: 'p1', name: 'Pilot project', status: 'ACTIVE', start_date: '2026-08-10', end_date: '2026-08-15' } : null,
          all: async () => ({ results: sql.includes('FROM tasks WHERE project_id') ? [task] : sql.includes('FROM shadow_schedule_versions') ? [shadowVersion] : sql.includes('FROM shadow_schedule_tasks') ? [{ task_id: 't1', shadow_start: '2026-08-10', shadow_end: '2026-08-15' }] : [] }),
        }),
        first: async () => sql.includes('FROM projects WHERE id') ? { id: 'p1', name: 'Pilot project', status: 'ACTIVE', start_date: '2026-08-10', end_date: '2026-08-15' } : null,
        all: async () => ({ results: sql.includes('FROM tasks WHERE project_id') ? [task] : sql.includes('FROM shadow_schedule_versions') ? [shadowVersion] : sql.includes('FROM shadow_schedule_tasks') ? [{ task_id: 't1', shadow_start: '2026-08-10', shadow_end: '2026-08-15' }] : [] }),
      }),
    };
    const result = await getScheduleComparison(db, { projectId: 'p1', asOf: '2026-08-14' });
    expect(result?.shadow.fresh).toBe(false);
    expect(result?.shadow.status).toBe('STALE');
    expect(result?.shadow.stale_warning).toBe('SHADOW_STALE');
    expect(result?.taskRows[0].shadow.start).toBeNull();
  });
});
