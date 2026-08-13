import type { Project, Task } from '../types';

// Forecast application does not mutate operational dates. Every schedule
// surface must prefer the append-only Official Forecast projection.
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
