type DetailTaskDates = {
  start_date?: string | null;
  end_date?: string | null;
  official_forecast_start?: string | null;
  official_forecast_end?: string | null;
};

type DetailProjectDates = {
  start_date?: string | null;
  end_date?: string | null;
  current_forecast_start_date?: string | null;
  current_forecast_end_date?: string | null;
};

// Project Detail is the direct schedule-editing surface. It must render the
// same mutable dates that its edit modal reads and writes. Official Forecast
// remains authoritative in Worklog, Dashboard, comparison, and approval UI.
export function resolveDetailTaskStart(task: DetailTaskDates): string | null | undefined {
  return task.start_date || task.official_forecast_start;
}

export function resolveDetailTaskEnd(task: DetailTaskDates): string | null | undefined {
  return task.end_date || task.official_forecast_end;
}

export function resolveDetailProjectStart(project?: DetailProjectDates | null): string | null | undefined {
  return project?.start_date || project?.current_forecast_start_date;
}

export function resolveDetailProjectEnd(project?: DetailProjectDates | null): string | null | undefined {
  return project?.end_date || project?.current_forecast_end_date;
}

export function getDetailLeftColumnWidths(leftPanelWidth: number) {
  if (leftPanelWidth >= 564) return { task: 330, worker: 170, actions: 64 };
  if (leftPanelWidth >= 504) return { task: 300, worker: 140, actions: 64 };
  return { task: 250, worker: 130, actions: 64 };
}

export function getDetailLeftGridTemplate(leftPanelWidth: number): string {
  const columns = getDetailLeftColumnWidths(leftPanelWidth);
  return `${columns.task}px ${columns.worker}px ${columns.actions}px`;
}
