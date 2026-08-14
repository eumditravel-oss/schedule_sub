import { describe, expect, it } from 'vitest';
import { getScheduleComparison } from '../worker/services/scheduleComparisonService';

describe('Checkpoint 6 schedule comparison read model', () => {
  it('keeps the four layers and does not invent actual dates', async () => {
    const project = { id: 'p1', name: 'Pilot project', status: 'ACTIVE', start_date: '2026-08-10', end_date: '2026-08-15' };
    const task = { id: 't1', project_id: 'p1', task_name: 'Task A', worker_name: 'wrk_01', primary_worker_id: 'wrk_01', start_date: '2026-08-10', end_date: '2026-08-15', progress: 0 };
    const worker = { id: 'wrk_01', name: 'Manager', country_code: 'KR', workweek_profile: 'MON_FRI' };
    const db: any = {
      prepare: (sql: string) => ({
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
    expect(result.shadow.fresh).toBe(false);
    expect(result.taskRows[0].shadow.start).toBeNull();
  });
});
