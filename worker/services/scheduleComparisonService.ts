import { getProjectProgressFoundationServer } from './v3FoundationService';
import { resolveWorkDayStatusServer } from './workCalendar';

type ComparisonOptions = { projectId: string; asOf?: string | null };

const todayInKorea = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const safeRows = (value: any): any[] => Array.isArray(value?.results) ? value.results : [];

async function all(db: any, sql: string, ...args: any[]): Promise<any[]> {
  try {
    const statement = db.prepare(sql);
    return safeRows(args.length ? await statement.bind(...args).all() : await statement.all());
  } catch (error) {
    // Older Pilot fixtures can predate optional provenance tables.  The
    // comparison model remains useful with an empty optional layer.
    console.warn('[schedule-comparison] optional query failed', error);
    return [];
  }
}

function dateRange(start: string | null, end: string | null): string[] {
  if (!start || !end || end < start) return [];
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function workdayDelta(
  from: string | null,
  to: string | null,
  worker: any,
  holidays: any[],
  overrides: any[],
): number {
  if (!from || !to || from === to) return 0;
  const direction = to > from ? 1 : -1;
  const start = direction > 0 ? from : to;
  const end = direction > 0 ? to : from;
  const count = dateRange(start, end).filter((date) => {
    if (date === start) return false;
    return resolveWorkDayStatusServer(date, worker, holidays, overrides).is_working_day;
  }).length;
  return count * direction;
}

function firstWorker(task: any, workers: any[]) {
  const id = task?.primary_worker_id || task?.worker_name;
  return workers.find((worker) => worker.id === id || worker.name === id) || workers[0] || null;
}

function progressFromAggregate(task: any, aggregate: any, legacy: any, completion: any) {
  if (aggregate?.current_progress != null) return Number(aggregate.current_progress);
  if (legacy?.actual_progress != null) return Number(legacy.actual_progress);
  if (completion) return 100;
  return Number(task?.actual_progress ?? task?.progress ?? 0);
}

export async function getScheduleComparison(db: any, options: ComparisonOptions) {
  const asOf = options.asOf && /^\d{4}-\d{2}-\d{2}$/.test(options.asOf) ? options.asOf : todayInKorea();
  const project: any = await db.prepare(`SELECT * FROM projects WHERE id=?`).bind(options.projectId).first();
  if (!project) return null;

  const [tasks, baselineProjects, baselineTasks, forecasts, forecastTasks, aggregates, contributions, completions, legacy, workers, holidays, overrides, shadowVersions] = await Promise.all([
    all(db, `SELECT * FROM tasks WHERE project_id=? ORDER BY task_sort_order ASC,start_date ASC,created_at ASC`, options.projectId),
    all(db, `SELECT * FROM project_baselines WHERE project_id=? ORDER BY version ASC`, options.projectId),
    all(db, `SELECT tb.* FROM task_baselines tb JOIN project_baselines pb ON pb.id=tb.baseline_id WHERE pb.project_id=? ORDER BY tb.task_id`, options.projectId),
    all(db, `SELECT * FROM schedule_versions WHERE project_id=? ORDER BY version_number DESC`, options.projectId),
    all(db, `SELECT svt.* FROM schedule_version_tasks svt JOIN schedule_versions sv ON sv.id=svt.version_id WHERE sv.project_id=? ORDER BY sv.version_number DESC,svt.task_id`, options.projectId),
    all(db, `SELECT * FROM task_actual_aggregates WHERE project_id=?`, options.projectId),
    all(db, `SELECT task_id,MIN(local_work_date) AS first_actual_date,MAX(local_work_date) AS latest_actual_date,SUM(approved_actual_minutes) AS approved_actual_minutes,MAX(progress_after) AS progress_after,GROUP_CONCAT(DISTINCT source_type) AS source_types FROM task_actual_contributions WHERE project_id=? AND is_effective=1 GROUP BY task_id`, options.projectId),
    all(db, `SELECT * FROM task_completion_events WHERE project_id=? ORDER BY actual_end_date ASC,created_at ASC`, options.projectId),
    all(db, `SELECT * FROM task_actuals WHERE project_id=? ORDER BY task_id,created_at`, options.projectId),
    all(db, `SELECT * FROM workers WHERE is_active=1 ORDER BY sort_order,name`),
    all(db, `SELECT * FROM country_holidays`),
    all(db, `SELECT * FROM calendar_overrides`),
    all(db, `SELECT * FROM shadow_schedule_versions WHERE project_id=? ORDER BY created_at DESC,shadow_version_number DESC`, options.projectId),
  ]);

  const baselineProject = baselineProjects.find((row: any) => Number(row.version) === 1) || baselineProjects[0] || null;
  const official = forecasts[0] || null;
  const officialVersionId = official?.id || null;
  const officialTaskMap = new Map(forecastTasks.filter((row: any) => !officialVersionId || row.version_id === officialVersionId).map((row: any) => [row.task_id, row]));
  const baselineTaskMap = new Map(baselineTasks.map((row: any) => [row.task_id, row]));
  const aggregateMap = new Map(aggregates.map((row: any) => [row.task_id, row]));
  const contributionMap = new Map(contributions.map((row: any) => [row.task_id, row]));
  const completionMap = new Map<string, any>();
  for (const event of completions) if (!completionMap.has(event.task_id)) completionMap.set(event.task_id, event);
  const legacyMap = new Map(legacy.filter((row: any) => row.source_type === 'LEGACY_BOOTSTRAP').map((row: any) => [row.task_id, row]));
  const workersById = new Map(workers.map((worker: any) => [worker.id, worker]));

  const taskRows: any[] = tasks.map((task: any): any => {
    const baseline = baselineTaskMap.get(task.id) || null;
    const forecast = officialTaskMap.get(task.id) || null;
    const aggregate = aggregateMap.get(task.id) || null;
    const contribution = contributionMap.get(task.id) || null;
    const completion = completionMap.get(task.id) || null;
    const legacyActual: any = legacyMap.get(task.id) || null;
    const worker = firstWorker(task, workers);
    const actualProgress = progressFromAggregate(task, aggregate, legacyActual, completion);
    const provenance = completion
      ? 'COMPLETION_EVENT'
      : contribution
        ? 'EMPLOYEE_WORKLOG'
        : legacyActual
          ? 'LEGACY_BOOTSTRAP'
          : aggregate?.progress_source === 'SYSTEM_MIGRATION' ? 'SYSTEM_MIGRATION' : 'NONE';
    return {
      task_id: task.id,
      task_name: task.task_name,
      task_group_id: task.task_group_id || null,
      task_sort_order: Number(task.task_sort_order || 0),
      primary_worker_id: task.primary_worker_id || worker?.id || null,
      primary_worker_name: worker?.name || task.worker_name || null,
      baseline: { start: baseline?.baseline_start_date || task.baseline_start_date || task.start_date || null, end: baseline?.baseline_end_date || task.baseline_end_date || task.end_date || null, progress: Number(baseline?.baseline_progress || 0), version: baselineProject?.version ? Number(baselineProject.version) : null },
      official: { start: forecast?.forecast_start || task.start_date || null, end: forecast?.forecast_end || task.end_date || null, version_id: officialVersionId, version: official?.version_number == null ? null : Number(official.version_number) },
      actual: { progress: Math.max(0, Math.min(100, actualProgress)), minutes: Number(contribution?.approved_actual_minutes || aggregate?.approved_actual_minutes || 0), first_activity_date: contribution?.first_actual_date || null, latest_activity_date: contribution?.latest_actual_date || null, completion_date: completion?.actual_end_date || null, provenance, legacy: legacyActual ? { source_type: legacyActual.source_type, source_detail: legacyActual.source_detail, cutover_date: legacyActual.cutover_date } : null },
      comparison: { baseline_to_official_workdays: workdayDelta(baseline?.baseline_end_date || task.baseline_end_date || task.end_date, forecast?.forecast_end || task.end_date, worker, holidays, overrides) },
    };
  });

  const latestShadow = shadowVersions[0] || null;
  const shadowTasks = latestShadow ? await all(db, `SELECT * FROM shadow_schedule_tasks WHERE shadow_version_id=? ORDER BY task_id`, latestShadow.shadow_version_id) : [];
  const shadowMap = new Map(shadowTasks.map((row: any) => [row.task_id, row]));
  const freshShadow = latestShadow?.status === 'CURRENT' ? latestShadow : null;
  for (const row of taskRows) {
    const shadow = shadowMap.get(row.task_id) || null;
    row.shadow = freshShadow && shadow ? { start: shadow.shadow_start, end: shadow.shadow_end, status: latestShadow.status, data_confidence: shadow.data_confidence, approval_required: Number(shadow.approval_required || 0), constraint_result: shadow.constraint_result, delta_end_workdays: Number(shadow.delta_end_workdays || 0) } : { start: null, end: null, status: latestShadow?.status || 'NONE', data_confidence: latestShadow?.data_confidence || null, approval_required: 0, constraint_result: null, delta_end_workdays: 0 };
    row.comparison.official_to_shadow_workdays = freshShadow && shadow ? Number(shadow.delta_end_workdays || 0) : null;
    row.comparison.status = row.actual.completion_date ? (row.actual.completion_date < (row.official.end || '9999-12-31') ? 'COMPLETED_EARLY' : 'COMPLETED_LATE') : (freshShadow ? (row.comparison.official_to_shadow_workdays || 0) > 0 ? 'SHADOW_CHANGE' : 'ON_BASELINE' : latestShadow ? 'SHADOW_STALE' : 'NO_ACTUAL');
  }

  let foundation: any = null;
  try { foundation = await getProjectProgressFoundationServer(db, options.projectId, asOf); } catch (error) { console.warn('[schedule-comparison] foundation fallback', error); }
  const officialEnd = official?.project_forecast_end || project.end_date || null;
  const baselineEnd = baselineProject?.baseline_end_date || project.baseline_end_date || project.end_date || null;
  const shadowEnd = freshShadow?.shadow_forecast_end_date || null;
  return {
    project: { id: project.id, name: project.name, status: project.status },
    asOf,
    timezone: 'Asia/Seoul',
    baseline: { start: baselineProject?.baseline_start_date || project.baseline_start_date || project.start_date || null, end: baselineEnd, version: baselineProject?.version == null ? null : Number(baselineProject.version) },
    officialForecast: { start: official?.project_forecast_start || project.start_date || null, end: officialEnd, version_id: officialVersionId, version: official?.version_number == null ? null : Number(official.version_number) },
    actual: { progress: Number(foundation?.current_actual_overall_progress ?? taskRows.reduce((sum, row) => sum + row.actual.progress, 0) / Math.max(taskRows.length, 1)), first_activity_date: taskRows.map((row) => row.actual.first_activity_date).filter(Boolean).sort()[0] || null, latest_activity_date: taskRows.map((row) => row.actual.latest_activity_date).filter(Boolean).sort().pop() || null, completion_date: taskRows.map((row) => row.actual.completion_date).filter(Boolean).sort().pop() || null, provenance: Array.from(new Set(taskRows.map((row) => row.actual.provenance))) },
    shadow: { status: latestShadow?.status || 'NONE', fresh: Boolean(freshShadow), shadow_version_id: latestShadow?.shadow_version_id || null, run_id: latestShadow?.run_id || null, end: shadowEnd, approval_classification: freshShadow?.approval_classification || null, data_confidence: freshShadow?.data_confidence || null, stale_warning: latestShadow?.status === 'STALE' ? 'SHADOW_STALE' : null },
    kpi: { baseline_progress: Number(foundation?.baseline_planned_progress_as_of_today ?? 0), actual_progress: Number(foundation?.current_actual_overall_progress ?? 0), progress_delta: Number(foundation?.progress_variance_percentage_point ?? 0), baseline_end: baselineEnd, official_end: officialEnd, baseline_to_official_workdays: foundation?.schedule_variance_workdays != null ? Number(foundation.schedule_variance_workdays) : workdayDelta(baselineEnd, officialEnd, workers[0], holidays, overrides), official_to_shadow_workdays: freshShadow ? workdayDelta(officialEnd, shadowEnd, workers[0], holidays, overrides) : null },
    taskRows,
    calendar: { workers: workers.map((worker: any) => ({ id: worker.id, name: worker.name, country_code: worker.country_code, workweek_profile: worker.workweek_profile })), holidays: holidays.map((holiday: any) => ({ country_code: holiday.country_code, date: holiday.holiday_date, name: holiday.name_local || holiday.name_ko || holiday.name_vi })), overrides: overrides.map((override: any) => ({ scope_type: override.scope_type, scope_key: override.scope_key, date: override.work_date, type: override.override_type })) },
    provenance: { baseline_version: baselineProject?.version == null ? null : Number(baselineProject.version), official_forecast_version_id: officialVersionId, actual_aggregate_revision: aggregates.map((row: any) => row.updated_at).sort().pop() || null, shadow_version_id: latestShadow?.shadow_version_id || null, shadow_run_id: latestShadow?.run_id || null, shadow_status: latestShadow?.status || 'NONE', as_of: asOf },
  };
}
