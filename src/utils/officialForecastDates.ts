import type { Project, Task } from '../types';

/**
 * Display-only date selectors for the current Official Forecast.
 *
 * Forecast apply is append-only: the original projects/tasks dates remain
 * baseline/legacy fields. Every schedule-facing surface must therefore use
 * the latest official snapshot when one is present.
 */
export function officialProjectStart(project: Project): string | null | undefined {
  return project.current_forecast_start_date || project.start_date;
}

export function officialProjectEnd(project: Project): string | null | undefined {
  return project.current_forecast_end_date || project.end_date;
}

export function officialTaskStart(task: Task): string | null | undefined {
  return task.official_forecast_start || task.start_date;
}

export function officialTaskEnd(task: Task): string | null | undefined {
  return task.official_forecast_end || task.end_date;
}
