import { describe, expect, it } from 'vitest';
import {
  getDetailLeftColumnWidths,
  getDetailLeftGridTemplate,
  resolveDetailProjectEnd,
  resolveDetailProjectStart,
  resolveDetailTaskEnd,
  resolveDetailTaskStart,
} from '../src/utils/detailGanttPresentation';

describe('Project Detail Gantt presentation', () => {
  it('uses the dates edited by the schedule manager before a stale published snapshot', () => {
    const task = {
      start_date: '2026-10-07',
      end_date: '2026-10-08',
      official_forecast_start: '2026-09-10',
      official_forecast_end: '2026-09-11',
    };
    expect(resolveDetailTaskStart(task)).toBe('2026-10-07');
    expect(resolveDetailTaskEnd(task)).toBe('2026-10-08');
  });

  it('falls back to Official Forecast when editable dates are absent', () => {
    expect(resolveDetailTaskStart({ official_forecast_start: '2026-09-10' })).toBe('2026-09-10');
    expect(resolveDetailTaskEnd({ official_forecast_end: '2026-09-11' })).toBe('2026-09-11');
  });

  it('uses the editable project range for the detail timeline', () => {
    const project = {
      start_date: '2026-08-05',
      end_date: '2026-11-13',
      current_forecast_start_date: '2026-08-05',
      current_forecast_end_date: '2026-11-10',
    };
    expect(resolveDetailProjectStart(project)).toBe('2026-08-05');
    expect(resolveDetailProjectEnd(project)).toBe('2026-11-13');
  });

  it.each([444, 504, 564])('allocates more room to task titles without exceeding %ipx', (width) => {
    const columns = getDetailLeftColumnWidths(width);
    expect(columns.task).toBeGreaterThan(columns.worker);
    expect(columns.task + columns.worker + columns.actions).toBe(width);
    expect(getDetailLeftGridTemplate(width)).toBe(`${columns.task}px ${columns.worker}px ${columns.actions}px`);
  });
});
