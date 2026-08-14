import { describe, expect, it } from 'vitest';
import { officialProjectEnd, officialProjectStart, officialTaskEnd, officialTaskStart } from '../officialForecastDates';

describe('official forecast display dates', () => {
  it('prefers the latest official project snapshot over baseline dates', () => {
    const project = { id: 'p1', name: 'Project', progress: 0, status: 'ACTIVE', start_date: '2026-08-01', end_date: '2026-08-10', current_forecast_start_date: '2026-08-03', current_forecast_end_date: '2026-08-14' } as any;
    expect(officialProjectStart(project)).toBe('2026-08-03');
    expect(officialProjectEnd(project)).toBe('2026-08-14');
  });

  it('prefers task snapshot dates and falls back to original task dates', () => {
    expect(officialTaskStart({ id: 't1', project_id: 'p1', worker_name: 'w1', task_name: 'Task', progress: 0, start_date: '2026-08-01', official_forecast_start: '2026-08-04' } as any)).toBe('2026-08-04');
    expect(officialTaskEnd({ id: 't1', project_id: 'p1', worker_name: 'w1', task_name: 'Task', progress: 0, end_date: '2026-08-10', official_forecast_end: '2026-08-12' } as any)).toBe('2026-08-12');
    expect(officialTaskStart({ id: 't1', project_id: 'p1', worker_name: 'w1', task_name: 'Task', progress: 0, start_date: '2026-08-01' } as any)).toBe('2026-08-01');
    expect(officialTaskEnd({ id: 't1', project_id: 'p1', worker_name: 'w1', task_name: 'Task', progress: 0, end_date: '2026-08-10' } as any)).toBe('2026-08-10');
  });
});
