import { describe, expect, it } from 'vitest';
import { officialProjectEnd, officialProjectStart, officialTaskEnd, officialTaskStart } from '../src/utils/officialForecastDates';

describe('Official Forecast date projection', () => {
  it('prefers the append-only Official Forecast over operational dates on every mobile view input', () => {
    const project: any = { id: 'project', name: 'Project', start_date: '2026-08-01', end_date: '2026-08-31', current_forecast_start_date: '2026-08-03', current_forecast_end_date: '2026-09-04' };
    const task: any = { id: 'task', project_id: 'project', worker_name: 'Owner', task_name: 'Task', progress: 0, start_date: '2026-08-02', end_date: '2026-08-10', official_forecast_start: '2026-08-05', official_forecast_end: '2026-08-12' };
    expect([officialProjectStart(project), officialProjectEnd(project), officialTaskStart(task), officialTaskEnd(task)])
      .toEqual(['2026-08-03', '2026-09-04', '2026-08-05', '2026-08-12']);
  });
});
