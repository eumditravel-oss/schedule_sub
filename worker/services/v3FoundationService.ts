import { resolveWorkDayStatusServer } from './workCalendar';

export type ProgressConfidence = 'CONFIRMED' | 'PROVISIONAL';
export type BootstrapRule = 'RULE_A' | 'RULE_B' | 'RULE_C' | 'RULE_D' | 'UNSCHEDULED';
export type LegacyProgressSource = 'MANUAL' | 'AUTO_TIME' | 'SYSTEM' | 'UNKNOWN';

export interface ActorContextServer {
  actorMode: 'TEST_SELECTOR' | 'SYSTEM_MIGRATION';
  actorUserId: string | null;
  actorEmployeeId: string | null;
  selectedViewEmployeeId: string | null;
  testSessionId: string | null;
}

export interface LegacyBootstrapClassification {
  bootstrapRule: BootstrapRule;
  legacyProgressSource: LegacyProgressSource;
  existingProgress: number;
  bootstrapProgress: number;
  remainingEffortMinutes: number;
  assumedActualEndDate: string | null;
  sourceDetail: string;
  exceptionCode: string | null;
  createsCompletionEvent: boolean;
}

export interface ProjectProgressFoundation {
  project_id: string;
  baseline_planned_progress_as_of_today: number;
  current_actual_overall_progress: number;
  progress_variance_percentage_point: number;
  legacy_project_progress: number;
  legacy_v3_difference: number;
  difference_reason: string;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  current_forecast_start_date: string | null;
  current_forecast_end_date: string | null;
  schedule_variance_workdays: number;
  progress_weight_source: string;
  progress_confidence: ProgressConfidence;
  progress_confidence_label_ko: string;
  progress_confidence_label_vi: string;
  baseline_version: number | null;
  forecast_version: number | null;
  legacy_bootstrap_count: number;
  has_legacy_bootstrap: boolean;
  schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED';
}

interface FoundationContext {
  projects: any[];
  tasks: any[];
  assignees: any[];
  workers: any[];
  holidays: any[];
  overrides: any[];
  dailyStatuses: any[];
  officePolicies: any[];
  projectBaselines: any[];
  taskBaselines: any[];
  scheduleVersions: any[];
  scheduleVersionTasks: any[];
  taskActuals: any[];
  completionEvents: any[];
}

interface FoundationTaskPlan {
  project: any;
  task: any;
  baselineId: string;
  scheduleVersionId: string;
  primaryWorker: any | null;
  primaryAssignment: any | null;
  supportAssignments: any[];
  proposedEffortMinutes: number;
  validWorkingDays: number;
  effortStatus: 'PROPOSED';
  legacy: LegacyBootstrapClassification;
  originalRawJson: string;
}

const clampProgress = (value: unknown): number => Math.min(100, Math.max(0, Number(value || 0)));
const roundProgress = (value: number): number => Math.round(value * 10) / 10;
const safeIdPart = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_');

function dateRange(startDate?: string | null, endDate?: string | null): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const result: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function countValidWorkingDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  worker: any | null,
  holidays: any[],
  overrides: any[],
): number {
  return dateRange(startDate, endDate).filter((date) =>
    resolveWorkDayStatusServer(date, worker || {
      id: 'foundation-policy-fallback',
      name: 'Foundation Policy Fallback',
      country_code: 'KR',
      workweek_profile: 'MON_FRI',
    }, holidays, overrides).is_working_day
  ).length;
}

function plannedProgressAt(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  referenceDate: string,
  worker: any | null,
  holidays: any[],
  overrides: any[],
): number {
  if (!startDate || !endDate) return 0;
  if (referenceDate < startDate) return 0;
  if (referenceDate > endDate) return 100;
  const total = countValidWorkingDays(startDate, endDate, worker, holidays, overrides);
  if (total <= 0) return 0;
  const elapsed = dateRange(startDate, endDate).filter((date) =>
    date < referenceDate && resolveWorkDayStatusServer(date, worker || {
      id: 'foundation-policy-fallback',
      name: 'Foundation Policy Fallback',
      country_code: 'KR',
      workweek_profile: 'MON_FRI',
    }, holidays, overrides).is_working_day
  ).length;
  return Math.min(100, Math.round((elapsed / total) * 100));
}

function countWeekdayVariance(fromDate?: string | null, toDate?: string | null): number {
  if (!fromDate || !toDate || fromDate === toDate) return 0;
  const direction = toDate > fromDate ? 1 : -1;
  const start = direction > 0 ? fromDate : toDate;
  const end = direction > 0 ? toDate : fromDate;
  const count = dateRange(start, end).filter((date) => {
    if (date === start) return false;
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day !== 0 && day !== 6;
  }).length;
  return count * direction;
}

export function classifyLegacyBootstrapTask(input: {
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
  cutoverDate: string;
  storedProgress?: number | null;
  statusBasedProgress?: number | null;
  progressMode?: string | null;
  completionConfirmed?: number | null;
  projectStatus?: string | null;
  explicitCompletionDate?: string | null;
  proposedEffortMinutes: number;
}): LegacyBootstrapClassification {
  const storedProgress = clampProgress(input.storedProgress);
  const statusBasedProgress = input.progressMode === 'STATUS_BASED'
    ? clampProgress(input.statusBasedProgress ?? storedProgress)
    : storedProgress;
  const explicitlyCompleted = input.projectStatus === 'COMPLETED' || Number(input.completionConfirmed) === 1 || storedProgress >= 100;

  let legacyProgressSource: LegacyProgressSource = 'UNKNOWN';
  if (input.projectStatus === 'COMPLETED' || Number(input.completionConfirmed) === 1) {
    legacyProgressSource = 'SYSTEM';
  } else if (input.progressMode === 'STATUS_BASED') {
    legacyProgressSource = 'SYSTEM';
  } else if (input.progressMode === 'AUTO_TIME' && storedProgress === 0) {
    legacyProgressSource = 'AUTO_TIME';
  } else if (storedProgress > 0) {
    legacyProgressSource = 'UNKNOWN';
  }

  if (!input.baselineStartDate || !input.baselineEndDate) {
    const progress = explicitlyCompleted ? 100 : statusBasedProgress;
    return {
      bootstrapRule: 'UNSCHEDULED',
      legacyProgressSource,
      existingProgress: statusBasedProgress,
      bootstrapProgress: progress,
      remainingEffortMinutes: Math.max(0, Math.round(input.proposedEffortMinutes * (1 - progress / 100))),
      assumedActualEndDate: explicitlyCompleted ? (input.explicitCompletionDate || null) : null,
      sourceDetail: explicitlyCompleted ? 'LEGACY_EXPLICIT_COMPLETE' : 'LEGACY_UNSCHEDULED_PRESERVED',
      exceptionCode: explicitlyCompleted ? null : 'UNSCHEDULED_REVIEW',
      createsCompletionEvent: explicitlyCompleted,
    };
  }

  if (input.baselineEndDate < input.cutoverDate) {
    const legacyAutoCompleted = input.progressMode === 'AUTO_TIME' && storedProgress === 0;
    if (explicitlyCompleted || legacyAutoCompleted || statusBasedProgress >= 100) {
      return {
        bootstrapRule: 'RULE_A',
        legacyProgressSource,
        existingProgress: explicitlyCompleted ? 100 : (legacyAutoCompleted ? 100 : statusBasedProgress),
        bootstrapProgress: 100,
        remainingEffortMinutes: 0,
        assumedActualEndDate: input.explicitCompletionDate || input.baselineEndDate,
        sourceDetail: 'LEGACY_ASSUMED_COMPLETE',
        exceptionCode: null,
        createsCompletionEvent: true,
      };
    }

    return {
      bootstrapRule: 'RULE_B',
      legacyProgressSource,
      existingProgress: statusBasedProgress,
      bootstrapProgress: statusBasedProgress,
      remainingEffortMinutes: Math.max(0, Math.round(input.proposedEffortMinutes * (1 - statusBasedProgress / 100))),
      assumedActualEndDate: null,
      sourceDetail: 'LEGACY_MANUAL_PARTIAL_PRESERVED',
      exceptionCode: 'OVERDUE_ADMIN_REVIEW',
      createsCompletionEvent: false,
    };
  }

  if (input.baselineStartDate <= input.cutoverDate && input.baselineEndDate >= input.cutoverDate) {
    const progress = explicitlyCompleted ? 100 : statusBasedProgress;
    return {
      bootstrapRule: 'RULE_C',
      legacyProgressSource,
      existingProgress: progress,
      bootstrapProgress: progress,
      remainingEffortMinutes: Math.max(0, Math.round(input.proposedEffortMinutes * (1 - progress / 100))),
      assumedActualEndDate: explicitlyCompleted ? (input.explicitCompletionDate || input.baselineEndDate) : null,
      sourceDetail: explicitlyCompleted ? 'LEGACY_EXPLICIT_COMPLETE' : 'LEGACY_IN_PROGRESS_PRESERVED',
      exceptionCode: null,
      createsCompletionEvent: explicitlyCompleted,
    };
  }

  return {
    bootstrapRule: 'RULE_D',
    legacyProgressSource: 'SYSTEM',
    existingProgress: storedProgress,
    bootstrapProgress: 0,
    remainingEffortMinutes: input.proposedEffortMinutes,
    assumedActualEndDate: null,
    sourceDetail: 'LEGACY_FUTURE_INITIALIZED',
    exceptionCode: null,
    createsCompletionEvent: false,
  };
}

async function loadFoundationContext(db: any): Promise<FoundationContext> {
  const results = await Promise.all([
    db.prepare(`SELECT * FROM projects ORDER BY id`).all(),
    db.prepare(`SELECT * FROM tasks ORDER BY project_id, task_sort_order, id`).all(),
    db.prepare(`SELECT * FROM task_assignees WHERE deleted_at IS NULL ORDER BY task_id, sort_order, id`).all(),
    db.prepare(`SELECT * FROM workers WHERE is_active = 1 ORDER BY id`).all(),
    db.prepare(`SELECT * FROM country_holidays ORDER BY country_code, holiday_date`).all(),
    db.prepare(`SELECT * FROM calendar_overrides ORDER BY work_date, scope_type, scope_key`).all(),
    db.prepare(`SELECT task_id, work_date, status FROM daily_status ORDER BY task_id, work_date`).all(),
    db.prepare(`SELECT * FROM office_work_policies ORDER BY office_code`).all(),
    db.prepare(`SELECT * FROM project_baselines ORDER BY project_id, version`).all(),
    db.prepare(`SELECT * FROM task_baselines ORDER BY baseline_id, task_id`).all(),
    db.prepare(`SELECT * FROM schedule_versions ORDER BY project_id, version_number`).all(),
    db.prepare(`SELECT * FROM schedule_version_tasks ORDER BY project_id, task_id`).all(),
    db.prepare(`SELECT * FROM task_actuals ORDER BY task_id, created_at`).all(),
    db.prepare(`SELECT * FROM task_completion_events ORDER BY task_id, created_at`).all(),
  ]);

  const rows = (index: number) => results[index].results || [];
  return {
    projects: rows(0), tasks: rows(1), assignees: rows(2), workers: rows(3),
    holidays: rows(4), overrides: rows(5), dailyStatuses: rows(6), officePolicies: rows(7),
    projectBaselines: rows(8), taskBaselines: rows(9), scheduleVersions: rows(10),
    scheduleVersionTasks: rows(11), taskActuals: rows(12), completionEvents: rows(13),
  };
}

function buildTaskPlans(context: FoundationContext, cutoverDate: string): FoundationTaskPlan[] {
  const projectMap = new Map(context.projects.map((project) => [project.id, project]));
  const assigneeMap = new Map<string, any[]>();
  for (const row of context.assignees) {
    if (!assigneeMap.has(row.task_id)) assigneeMap.set(row.task_id, []);
    assigneeMap.get(row.task_id)!.push(row);
  }
  const workerMap = new Map(context.workers.map((worker) => [worker.id, worker]));
  const workerNameMap = new Map(context.workers.map((worker) => [worker.name, worker]));
  const policyMap = new Map(context.officePolicies.map((policy) => [policy.country_code, policy]));
  const dailyMap = new Map<string, Record<string, string>>();
  for (const row of context.dailyStatuses) {
    if (!dailyMap.has(row.task_id)) dailyMap.set(row.task_id, {});
    dailyMap.get(row.task_id)![row.work_date] = row.status;
  }

  return context.tasks.flatMap((task) => {
    const project = projectMap.get(task.project_id);
    if (!project) return [];
    const baseline = context.projectBaselines.find((row) => row.project_id === project.id && Number(row.version) === 1);
    const version = context.scheduleVersions.find((row) => row.project_id === project.id && Number(row.version_number) === 1);
    const baselineId = baseline?.id || `pb_v3_${safeIdPart(project.id)}_v1`;
    const scheduleVersionId = version?.id || `sv_v3_${safeIdPart(project.id)}_v1`;
    const assignments = assigneeMap.get(task.id) || [];
    const primaryAssignment = assignments.find((row) => row.assignment_role === 'PRIMARY') || assignments[0] || null;
    const primaryWorker = primaryAssignment
      ? (workerMap.get(primaryAssignment.worker_id) || workerNameMap.get(primaryAssignment.name))
      : (workerMap.get(task.primary_worker_id) || workerNameMap.get(task.worker_name) || null);
    const supportAssignments = assignments.filter((row) => row !== primaryAssignment);
    const validWorkingDays = countValidWorkingDays(task.start_date, task.end_date, primaryWorker, context.holidays, context.overrides);
    const policy = policyMap.get(primaryWorker?.country_code || 'KR');
    const dailyMinutes = Number(policy?.schedulable_minutes || (primaryWorker?.country_code === 'VN' ? 480 : 420));
    const proposedEffortMinutes = Math.max(0, validWorkingDays * dailyMinutes);

    const statuses = dailyMap.get(task.id) || {};
    const completedDays = Object.values(statuses).filter((status) => status === 'COMPLETED').length;
    const statusBasedProgress = validWorkingDays > 0
      ? Math.min(100, Math.round((completedDays / validWorkingDays) * 100))
      : clampProgress(task.progress);
    const explicitCompletionDate = project.status === 'COMPLETED' ? (project.completed_at || task.end_date) : null;
    const legacy = classifyLegacyBootstrapTask({
      baselineStartDate: task.start_date,
      baselineEndDate: task.end_date,
      cutoverDate,
      storedProgress: task.progress,
      statusBasedProgress,
      progressMode: task.progress_mode,
      completionConfirmed: task.completion_confirmed,
      projectStatus: project.status,
      explicitCompletionDate,
      proposedEffortMinutes,
    });

    return [{
      project, task, baselineId, scheduleVersionId, primaryWorker: primaryWorker || null,
      primaryAssignment, supportAssignments, proposedEffortMinutes, validWorkingDays,
      effortStatus: 'PROPOSED' as const, legacy,
      originalRawJson: JSON.stringify({
        task,
        primary_assignment: primaryAssignment,
        support_assignments: supportAssignments,
        daily_statuses: statuses,
      }),
    }];
  });
}

function resolveProjectFoundation(
  context: FoundationContext,
  project: any,
  referenceDate: string,
): ProjectProgressFoundation {
  const projectTasks = context.tasks.filter((task) => task.project_id === project.id);
  const baseline = context.projectBaselines.find((row) => row.project_id === project.id && Number(row.version) === 1) || null;
  const forecast = context.scheduleVersions.find((row) => row.project_id === project.id && Number(row.version_number) === 1) || null;
  const baselineTasks = baseline
    ? context.taskBaselines.filter((row) => row.baseline_id === baseline.id)
    : [];
  const actualMap = new Map<string, any>();
  for (const actual of context.taskActuals.filter((row) => row.project_id === project.id)) {
    actualMap.set(actual.task_id, actual);
  }
  const workerMap = new Map(context.workers.map((worker) => [worker.id, worker]));
  const workerNameMap = new Map(context.workers.map((worker) => [worker.name, worker]));

  let weightedPlanned = 0;
  let weightedActual = 0;
  let totalWeight = 0;
  let worstWeightRank = 0;

  for (const task of projectTasks) {
    const baselineTask = baselineTasks.find((row) => row.task_id === task.id);
    const startDate = baselineTask?.baseline_start_date ?? task.start_date;
    const endDate = baselineTask?.baseline_end_date ?? task.end_date;
    const primaryWorker = workerMap.get(task.primary_worker_id) || workerNameMap.get(task.worker_name) || null;
    const confirmedEffort = baselineTask?.effort_status === 'CONFIRMED' ? Number(baselineTask.proposed_effort_minutes || 0) : 0;
    const proposedEffort = Number(baselineTask?.proposed_effort_minutes || 0);
    const durationWeight = countValidWorkingDays(startDate, endDate, primaryWorker, context.holidays, context.overrides);
    let weight = 1;
    let rank = 4;
    if (confirmedEffort > 0) {
      weight = confirmedEffort;
      rank = 1;
    } else if (proposedEffort > 0) {
      weight = proposedEffort;
      rank = 2;
    } else if (durationWeight > 0) {
      weight = durationWeight;
      rank = 3;
    }
    worstWeightRank = Math.max(worstWeightRank, rank);
    const planned = plannedProgressAt(startDate, endDate, referenceDate, primaryWorker, context.holidays, context.overrides);
    const actual = actualMap.has(task.id)
      ? clampProgress(actualMap.get(task.id).actual_progress)
      : clampProgress(task.actual_progress ?? task.progress);
    weightedPlanned += planned * weight;
    weightedActual += actual * weight;
    totalWeight += weight;
  }

  const planned = totalWeight > 0 ? roundProgress(weightedPlanned / totalWeight) : 0;
  const actual = project.status === 'COMPLETED'
    ? 100
    : (totalWeight > 0 ? roundProgress(weightedActual / totalWeight) : clampProgress(project.progress));
  const legacy = clampProgress(project.progress);
  const difference = roundProgress(actual - legacy);
  const baselineEnd = baseline?.baseline_end_date || project.baseline_end_date || project.end_date || null;
  const baselineStart = baseline?.baseline_start_date || project.baseline_start_date || project.start_date || null;
  const forecastEnd = forecast?.project_forecast_end || project.end_date || null;
  const forecastStart = forecast?.project_forecast_start || project.start_date || null;
  const scheduleVariance = countWeekdayVariance(baselineEnd, forecastEnd);
  const bootstrapCount = context.taskActuals.filter((row) => row.project_id === project.id && row.source_type === 'LEGACY_BOOTSTRAP').length;
  const weightSource = worstWeightRank <= 1
    ? 'CONFIRMED_EFFORT'
    : worstWeightRank === 2
      ? 'PROPOSED_EFFORT'
      : worstWeightRank === 3
        ? 'BASELINE_WORKING_DURATION'
        : 'EQUAL_FALLBACK';
  const confidence: ProgressConfidence = worstWeightRank <= 1 ? 'CONFIRMED' : 'PROVISIONAL';
  let scheduleState: ProjectProgressFoundation['schedule_state'] = 'UPCOMING';
  if (project.status === 'COMPLETED') scheduleState = 'COMPLETED';
  else if (forecastEnd && referenceDate > forecastEnd && actual < 100) scheduleState = 'DELAYED';
  else if (forecastStart && referenceDate >= forecastStart) scheduleState = 'IN_PROGRESS';

  return {
    project_id: project.id,
    baseline_planned_progress_as_of_today: planned,
    current_actual_overall_progress: actual,
    progress_variance_percentage_point: roundProgress(actual - planned),
    legacy_project_progress: legacy,
    legacy_v3_difference: difference,
    difference_reason: difference === 0
      ? 'Legacy display and V3 provisional result are equal.'
      : 'V3 uses Baseline effort/duration weights and explicit/Legacy Bootstrap Actual facts; legacy used a different project aggregation.',
    baseline_start_date: baselineStart,
    baseline_end_date: baselineEnd,
    current_forecast_start_date: forecastStart,
    current_forecast_end_date: forecastEnd,
    schedule_variance_workdays: scheduleVariance,
    progress_weight_source: weightSource,
    progress_confidence: confidence,
    progress_confidence_label_ko: confidence === 'CONFIRMED' ? '확정' : '임시 산정',
    progress_confidence_label_vi: confidence === 'CONFIRMED' ? 'Đã xác nhận' : 'Tạm tính',
    baseline_version: baseline ? Number(baseline.version) : null,
    forecast_version: forecast ? Number(forecast.version_number) : null,
    legacy_bootstrap_count: bootstrapCount,
    has_legacy_bootstrap: bootstrapCount > 0,
    schedule_state: scheduleState,
  };
}

export async function getAllProjectProgressFoundationsServer(
  db: any,
  referenceDate: string,
): Promise<Map<string, ProjectProgressFoundation>> {
  const context = await loadFoundationContext(db);
  return new Map(context.projects.map((project) => [project.id, resolveProjectFoundation(context, project, referenceDate)]));
}

export async function getProjectProgressFoundationServer(
  db: any,
  projectId: string,
  referenceDate: string,
): Promise<ProjectProgressFoundation | null> {
  const all = await getAllProjectProgressFoundationsServer(db, referenceDate);
  return all.get(projectId) || null;
}

export async function getLegacyBootstrapTaskInfoServer(db: any, projectId: string): Promise<Map<string, any>> {
  const result = await db.prepare(
    `SELECT task_id, cutover_date, source_type, source_detail, legacy_progress_source,
            existing_progress, actual_progress, remaining_effort_minutes, bootstrap_rule,
            exception_code, generated_by, display_label_ko, display_label_vi, created_at
     FROM task_actuals
     WHERE project_id = ? AND source_type = 'LEGACY_BOOTSTRAP'
     ORDER BY task_id, created_at`
  ).bind(projectId).all();
  return new Map((result.results || []).map((row: any) => [row.task_id, row]));
}

async function runInsertStatements(db: any, statements: any[]): Promise<number> {
  let changes = 0;
  for (let index = 0; index < statements.length; index += 40) {
    const chunk = statements.slice(index, index + 40);
    if (chunk.length === 0) continue;
    const results = await db.batch(chunk);
    changes += results.reduce((sum: number, result: any) => sum + Number(result?.meta?.changes || 0), 0);
  }
  return changes;
}

export async function previewV3FoundationServer(db: any, cutoverDate: string) {
  const context = await loadFoundationContext(db);
  const taskPlans = buildTaskPlans(context, cutoverDate);
  const projectRows = context.projects.map((project) => {
    const tasks = taskPlans.filter((plan) => plan.project.id === project.id);
    return {
      project_id: project.id,
      project_name: project.name,
      task_count: tasks.length,
      baseline_start: project.start_date,
      baseline_end: project.end_date,
      completed_bootstrap_tasks: tasks.filter((plan) => plan.legacy.bootstrapRule === 'RULE_A').length,
      partial_bootstrap_tasks: tasks.filter((plan) => plan.legacy.bootstrapRule === 'RULE_B' || plan.legacy.bootstrapRule === 'RULE_C').length,
      future_tasks: tasks.filter((plan) => plan.legacy.bootstrapRule === 'RULE_D').length,
      unknown_source_tasks: tasks.filter((plan) => plan.legacy.legacyProgressSource === 'UNKNOWN').length,
    };
  });

  return {
    cutover_date: cutoverDate,
    total_projects: context.projects.length,
    total_tasks: taskPlans.length,
    completed_bootstrap_tasks: taskPlans.filter((plan) => plan.legacy.bootstrapRule === 'RULE_A').length,
    partial_bootstrap_tasks: taskPlans.filter((plan) => plan.legacy.bootstrapRule === 'RULE_B' || plan.legacy.bootstrapRule === 'RULE_C').length,
    future_tasks: taskPlans.filter((plan) => plan.legacy.bootstrapRule === 'RULE_D').length,
    unknown_source_tasks: taskPlans.filter((plan) => plan.legacy.legacyProgressSource === 'UNKNOWN').length,
    projects: projectRows,
    tasks: taskPlans.map((plan) => ({
      project_id: plan.project.id,
      project_name: plan.project.name,
      task_id: plan.task.id,
      wbs_group_id: plan.task.task_group_id,
      task_name: plan.task.task_name,
      baseline_start: plan.task.start_date,
      baseline_end: plan.task.end_date,
      existing_progress: plan.legacy.existingProgress,
      existing_status: Number(plan.task.completion_confirmed) === 1 ? 'COMPLETED' : plan.task.schedule_status,
      progress_source: plan.legacy.legacyProgressSource,
      valid_working_days: plan.validWorkingDays,
      proposed_effort_minutes: plan.proposedEffortMinutes,
      effort_status: plan.effortStatus,
      bootstrap_rule: plan.legacy.bootstrapRule,
      bootstrap_progress: plan.legacy.bootstrapProgress,
      remaining_effort_minutes: plan.legacy.remainingEffortMinutes,
      exception: plan.legacy.exceptionCode,
      forecast_start: plan.task.start_date,
      forecast_end: plan.task.end_date,
    })),
  };
}

export async function applyV3FoundationServer(db: any, options: {
  cutoverDate: string;
  environmentName: string;
  sourceSchemaFingerprint: string;
  sourceHead: string | null;
  actor: ActorContextServer;
}) {
  const context = await loadFoundationContext(db);
  const taskPlans = buildTaskPlans(context, options.cutoverDate);
  const existingBaselines = new Map(
    context.projectBaselines.filter((row) => Number(row.version) === 1).map((row) => [row.project_id, row]),
  );
  const existingTaskBaselines = new Set(context.taskBaselines.map((row) => `${row.baseline_id}:${row.task_id}`));
  const existingVersions = new Map(
    context.scheduleVersions.filter((row) => Number(row.version_number) === 1).map((row) => [row.project_id, row]),
  );
  const existingVersionTasks = new Set(context.scheduleVersionTasks.map((row) => `${row.version_id}:${row.task_id}`));
  const existingActuals = new Set(context.taskActuals.map((row) => `${row.project_id}:${row.task_id}:${row.cutover_date}:${row.source_type}`));
  const existingCompletionRefs = new Set(context.completionEvents.map((row) => `${row.source_type}:${row.source_reference_id}`));

  const projectBaselineStatements: any[] = [];
  const taskBaselineStatements: any[] = [];
  const forecastStatements: any[] = [];
  const forecastTaskStatements: any[] = [];
  const actualStatements: any[] = [];
  const completionStatements: any[] = [];

  for (const project of context.projects) {
    if (!existingBaselines.has(project.id)) {
      const baselineId = `pb_v3_${safeIdPart(project.id)}_v1`;
      projectBaselineStatements.push(db.prepare(
        `INSERT OR IGNORE INTO project_baselines (
          id, project_id, version, baseline_start_date, baseline_end_date,
          created_by, note, baseline_status, baseline_project_progress,
          snapshot_source, source_schema_fingerprint, source_project_json,
          actor_mode, actor_user_id, test_session_id
        ) VALUES (?, ?, 1, ?, ?, 'SYSTEM_MIGRATION', ?, 'APPROVED', ?,
                  'CURRENT_SCHEDULE_SNAPSHOT', ?, ?, ?, ?, ?)`
      ).bind(
        baselineId, project.id, project.start_date, project.end_date,
        `Baseline V1 at ${options.cutoverDate}`, clampProgress(project.progress),
        options.sourceSchemaFingerprint, JSON.stringify(project), options.actor.actorMode,
        options.actor.actorUserId, options.actor.testSessionId,
      ));
      existingBaselines.set(project.id, {
        id: baselineId, project_id: project.id, version: 1,
        baseline_start_date: project.start_date, baseline_end_date: project.end_date,
      });
    }

    if (!existingVersions.has(project.id)) {
      const baseline = existingBaselines.get(project.id)!;
      const versionId = `sv_v3_${safeIdPart(project.id)}_v1`;
      forecastStatements.push(db.prepare(
        `INSERT OR IGNORE INTO schedule_versions (
          id, project_id, baseline_id, version_number, based_on_version_id,
          source_type, status, project_forecast_start, project_forecast_end,
          change_summary, schema_version, created_by, actor_mode, actor_user_id,
          subject_employee_id, test_session_id
        ) VALUES (?, ?, ?, 1, NULL, 'INITIAL_BASELINE_CLONE', 'INITIALIZED', ?, ?,
                  'Forecast V1 = Baseline V1', 'V3_FOUNDATION_1', 'SYSTEM_MIGRATION', ?, ?, NULL, ?)`
      ).bind(
        versionId, project.id, baseline.id, baseline.baseline_start_date,
        baseline.baseline_end_date, options.actor.actorMode, options.actor.actorUserId,
        options.actor.testSessionId,
      ));
      existingVersions.set(project.id, {
        id: versionId, project_id: project.id, version_number: 1,
        project_forecast_start: baseline.baseline_start_date,
        project_forecast_end: baseline.baseline_end_date,
      });
    }
  }

  for (const plan of taskPlans) {
    const baseline = existingBaselines.get(plan.project.id)!;
    const version = existingVersions.get(plan.project.id)!;
    const baselineKey = `${baseline.id}:${plan.task.id}`;
    if (!existingTaskBaselines.has(baselineKey)) {
      taskBaselineStatements.push(db.prepare(
        `INSERT OR IGNORE INTO task_baselines (
          id, baseline_id, task_id, baseline_start_date, baseline_end_date,
          task_group_id, baseline_progress, baseline_status, primary_assignment_json,
          support_assignments_json, assignment_fte_raw_json, proposed_effort_minutes,
          effort_status, original_raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?)`
      ).bind(
        `tb_v3_${safeIdPart(plan.task.id)}_v1`, baseline.id, plan.task.id,
        plan.task.start_date, plan.task.end_date, plan.task.task_group_id,
        clampProgress(plan.task.progress), Number(plan.task.completion_confirmed) === 1 ? 'COMPLETED' : 'PLANNED',
        JSON.stringify(plan.primaryAssignment), JSON.stringify(plan.supportAssignments),
        JSON.stringify([plan.primaryAssignment, ...plan.supportAssignments].filter(Boolean).map((row: any) => ({
          worker_id: row.worker_id, assignment_role: row.assignment_role,
          allocation_percent: row.allocation_percent,
        }))),
        plan.proposedEffortMinutes, plan.originalRawJson,
      ));
      existingTaskBaselines.add(baselineKey);
    }

    const versionTaskKey = `${version.id}:${plan.task.id}`;
    if (!existingVersionTasks.has(versionTaskKey)) {
      forecastTaskStatements.push(db.prepare(
        `INSERT OR IGNORE INTO schedule_version_tasks (
          id, version_id, project_id, task_id, task_group_id, forecast_start,
          forecast_end, planned_effort_minutes, effort_status,
          primary_assignment_json, support_assignments_json, original_raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?, ?)`
      ).bind(
        `svt_v3_${safeIdPart(plan.task.id)}_v1`, version.id, plan.project.id,
        plan.task.id, plan.task.task_group_id, plan.task.start_date, plan.task.end_date,
        plan.proposedEffortMinutes, JSON.stringify(plan.primaryAssignment),
        JSON.stringify(plan.supportAssignments), plan.originalRawJson,
      ));
      existingVersionTasks.add(versionTaskKey);
    }

    const actualKey = `${plan.project.id}:${plan.task.id}:${options.cutoverDate}:LEGACY_BOOTSTRAP`;
    const actualId = `actual_v3_${safeIdPart(plan.task.id)}_${options.cutoverDate.replace(/-/g, '')}`;
    if (!existingActuals.has(actualKey)) {
      actualStatements.push(db.prepare(
        `INSERT OR IGNORE INTO task_actuals (
          id, project_id, task_id, cutover_date, source_type, source_detail,
          legacy_progress_source, existing_progress, actual_progress, actual_minutes,
          remaining_effort_minutes, assumed_actual_end_date, bootstrap_rule,
          exception_code, generated_by, display_label_ko, display_label_vi,
          employee_worklog_eligible, attendance_metric_eligible, capacity_usage_eligible,
          overtime_metric_eligible, digest_missing_worklog_eligible, actor_mode,
          actor_user_id, subject_employee_id, test_session_id, original_raw_json
        ) VALUES (?, ?, ?, ?, 'LEGACY_BOOTSTRAP', ?, ?, ?, ?, 0, ?, ?, ?, ?,
                  'SYSTEM_MIGRATION', '전환 기준 데이터', 'Dữ liệu cơ sở chuyển đổi',
                  0, 0, 0, 0, 0, ?, ?, NULL, ?, ?)`
      ).bind(
        actualId, plan.project.id, plan.task.id, options.cutoverDate,
        plan.legacy.sourceDetail, plan.legacy.legacyProgressSource,
        plan.legacy.existingProgress, plan.legacy.bootstrapProgress,
        plan.legacy.remainingEffortMinutes, plan.legacy.assumedActualEndDate,
        plan.legacy.bootstrapRule, plan.legacy.exceptionCode,
        options.actor.actorMode, options.actor.actorUserId, options.actor.testSessionId,
        plan.originalRawJson,
      ));
      existingActuals.add(actualKey);
    }

    const completionRef = `LEGACY_BOOTSTRAP:${plan.task.id}:${options.cutoverDate}`;
    if (plan.legacy.createsCompletionEvent && plan.legacy.assumedActualEndDate && !existingCompletionRefs.has(`LEGACY_BOOTSTRAP:${completionRef}`)) {
      completionStatements.push(db.prepare(
        `INSERT OR IGNORE INTO task_completion_events (
          id, project_id, task_id, actual_end_date, source_type, source_detail,
          generated_by, source_reference_id, actor_mode, actor_user_id,
          subject_employee_id, test_session_id, employee_worklog_eligible
        ) VALUES (?, ?, ?, ?, 'LEGACY_BOOTSTRAP', ?, 'SYSTEM_MIGRATION', ?, ?, ?, NULL, ?, 0)`
      ).bind(
        `tce_v3_${safeIdPart(plan.task.id)}_${options.cutoverDate.replace(/-/g, '')}`,
        plan.project.id, plan.task.id, plan.legacy.assumedActualEndDate,
        plan.legacy.sourceDetail, completionRef, options.actor.actorMode,
        options.actor.actorUserId, options.actor.testSessionId,
      ));
      existingCompletionRefs.add(`LEGACY_BOOTSTRAP:${completionRef}`);
    }
  }

  const baselineProjectInsertCount = await runInsertStatements(db, projectBaselineStatements);
  const baselineTaskInsertCount = await runInsertStatements(db, taskBaselineStatements);
  const forecastInsertCount = await runInsertStatements(db, forecastStatements);
  const forecastTaskInsertCount = await runInsertStatements(db, forecastTaskStatements);
  const bootstrapInsertCount = await runInsertStatements(db, actualStatements);
  const completionEventInsertCount = await runInsertStatements(db, completionStatements);

  const refreshedContext = await loadFoundationContext(db);
  const foundations = refreshedContext.projects.map((project) => resolveProjectFoundation(refreshedContext, project, options.cutoverDate));
  const snapshotStatements: any[] = [];
  for (const foundation of foundations) {
    snapshotStatements.push(db.prepare(
      `INSERT OR IGNORE INTO progress_snapshots (
        id, project_id, as_of_date, baseline_planned_progress,
        current_actual_overall_progress, progress_variance_percentage_point,
        legacy_project_progress, legacy_v3_difference, difference_reason,
        baseline_end_date, current_forecast_end_date, schedule_variance_workdays,
        weight_source, progress_confidence, source_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'V3_FOUNDATION_INITIAL')`
    ).bind(
      `ps_v3_${safeIdPart(foundation.project_id)}_${options.cutoverDate.replace(/-/g, '')}`,
      foundation.project_id, options.cutoverDate,
      foundation.baseline_planned_progress_as_of_today,
      foundation.current_actual_overall_progress,
      foundation.progress_variance_percentage_point,
      foundation.legacy_project_progress,
      foundation.legacy_v3_difference,
      foundation.difference_reason,
      foundation.baseline_end_date,
      foundation.current_forecast_end_date,
      foundation.schedule_variance_workdays,
      foundation.progress_weight_source,
      foundation.progress_confidence,
    ));
  }
  const progressSnapshotInsertCount = await runInsertStatements(db, snapshotStatements);

  const result = {
    cutover_date: options.cutoverDate,
    baseline_project_insert_count: baselineProjectInsertCount,
    baseline_task_insert_count: baselineTaskInsertCount,
    forecast_insert_count: forecastInsertCount,
    forecast_task_insert_count: forecastTaskInsertCount,
    bootstrap_insert_count: bootstrapInsertCount,
    completion_event_insert_count: completionEventInsertCount,
    progress_snapshot_insert_count: progressSnapshotInsertCount,
    update_count: 0,
    duplicate_count: 0,
    total_projects: refreshedContext.projects.length,
    total_tasks: refreshedContext.tasks.length,
  };

  await db.prepare(
    `INSERT OR IGNORE INTO v3_migration_runs (
      id, environment_name, cutover_date, source_schema_fingerprint, source_head,
      mode, baseline_insert_count, forecast_insert_count, bootstrap_insert_count,
      completion_event_insert_count, duplicate_count, result_json, actor_mode
    ) VALUES (?, ?, ?, ?, ?, 'APPLY', ?, ?, ?, ?, 0, ?, ?)`
  ).bind(
    `v3run_${safeIdPart(options.environmentName)}_${options.cutoverDate.replace(/-/g, '')}`,
    options.environmentName, options.cutoverDate, options.sourceSchemaFingerprint,
    options.sourceHead, baselineProjectInsertCount + baselineTaskInsertCount,
    forecastInsertCount + forecastTaskInsertCount, bootstrapInsertCount,
    completionEventInsertCount, JSON.stringify(result), options.actor.actorMode,
  ).run();

  return result;
}
