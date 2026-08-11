// worker/services/todaySummaryService.ts
import { calculateTaskProgressServer, TaskProgressMetricsServer } from './progressAndConflictServer';

export interface TodaySummaryResult {
  date: string;
  scheduled_today: { count: number; task_ids: string[] };
  in_progress: { count: number; task_ids: string[] };
  completed_today: { count: number; task_ids: string[] };
  completed_this_month: { count: number; project_ids: string[] };
  overdue: { count: number; task_ids: string[] };
  completion_review?: { count: number; task_ids: string[] };
  blocked_count?: number;
}

export interface OverdueTaskDetailItem {
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  primary_worker_id: string;
  worker_name: string;
  start_date: string;
  end_date: string;
  business_date: string;
  days_overdue: number;
  progress_mode: string;
  actual_progress: number;
  completion_confirmed: number;
  judgement_reason: string;
}

export function classifyTaskDeadlineStateServer(
  task: any,
  metricsOrActualProgress: number | TaskProgressMetricsServer,
  businessDate: string
): 'COMPLETED' | 'UNSCHEDULED' | 'COMPLETION_REVIEW' | 'OVERDUE' | 'ON_TRACK' {
  if (Number(task.completion_confirmed) === 1) return 'COMPLETED';
  if (task.schedule_status === 'UNSCHEDULED' || !task.start_date || !task.end_date) return 'UNSCHEDULED';

  const actualProgress = typeof metricsOrActualProgress === 'number'
    ? metricsOrActualProgress
    : metricsOrActualProgress.actual_progress;
  const scheduleState = typeof metricsOrActualProgress === 'object' ? metricsOrActualProgress.schedule_state : undefined;

  if (scheduleState === 'COMPLETION_REVIEW' || actualProgress >= 100) return 'COMPLETION_REVIEW';
  if (task.end_date < businessDate && actualProgress < 100) return 'OVERDUE';
  return 'ON_TRACK';
}

export async function getTodayDashboardSummaryServer(
  db: any,
  businessDate: string
): Promise<TodaySummaryResult> {
  // 0. Compute Business Month Range
  const [yearStr, monthStr] = businessDate.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const monthStart = `${yearStr}-${monthStr.padStart(2, '0')}-01`;
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch Monthly Completed Projects
  let completedThisMonthProjectIds: string[] = [];
  try {
    const completedPrjsRes = await db
      .prepare(
        `SELECT id
         FROM projects
         WHERE status = 'COMPLETED'
           AND end_date IS NOT NULL
           AND end_date >= ?
           AND end_date < ?`
      )
      .bind(monthStart, nextMonthStart)
      .all();
    completedThisMonthProjectIds = (completedPrjsRes.results || []).map((p: any) => p.id);
  } catch (e: any) {
    console.error('[TodaySummary] MONTHLY_COMPLETION_QUERY_FAILED:', e?.message || e);
    throw new Error(`MONTHLY_COMPLETION_QUERY_FAILED: ${e?.message || 'Database query error'}`);
  }

  // Batch Load Reference Data for V2 Progress Engine (Rule 9)
  const [workersRes, holidaysRes, overridesRes, activePrjRes] = await Promise.all([
    db.prepare(`SELECT id, name, country_code, workweek_profile, is_active FROM workers WHERE is_active = 1`).all(),
    db.prepare(`SELECT country_code, holiday_date, name_ko, name_vi FROM country_holidays`).all(),
    db.prepare(`SELECT * FROM calendar_overrides`).all(),
    db.prepare(`SELECT id, name, name_ko, status FROM projects WHERE status = 'ACTIVE'`).all(),
  ]);

  const workers = workersRes.results || [];
  const holidays = holidaysRes.results || [];
  const overrides = overridesRes.results || [];
  const activeProjects: any[] = activePrjRes.results || [];
  const activeProjectMap = new Map<string, any>(activeProjects.map((p) => [p.id, p]));

  if (activeProjects.length === 0) {
    return {
      date: businessDate,
      scheduled_today: { count: 0, task_ids: [] },
      in_progress: { count: 0, task_ids: [] },
      completed_today: { count: 0, task_ids: [] },
      completed_this_month: {
        count: completedThisMonthProjectIds.length,
        project_ids: completedThisMonthProjectIds,
      },
      overdue: { count: 0, task_ids: [] },
      completion_review: { count: 0, task_ids: [] },
    };
  }

  // Fetch active scheduled tasks
  const tasksRes = await db
    .prepare(
      `SELECT t.id, t.project_id, t.task_name, t.start_date, t.end_date, t.progress,
              t.completion_confirmed, t.schedule_status, t.progress_mode,
              t.primary_worker_id, t.worker_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.status = 'ACTIVE'
         AND t.schedule_status = 'SCHEDULED'
         AND t.start_date IS NOT NULL
         AND t.end_date IS NOT NULL`
    )
    .all();
  const activeTasks: any[] = tasksRes.results || [];

  // Batch Load Task Assignees and Daily Statuses (Rule 9)
  const [assigneesRes, dailyRes] = await Promise.all([
    db.prepare(`SELECT * FROM task_assignees`).all(),
    db.prepare(`SELECT task_id, work_date, status FROM daily_status`).all(),
  ]);

  const assigneesMap = new Map<string, any[]>();
  (assigneesRes.results || []).forEach((row: any) => {
    if (!assigneesMap.has(row.task_id)) {
      assigneesMap.set(row.task_id, []);
    }
    assigneesMap.get(row.task_id)!.push(row);
  });

  const dailyStatusMap = new Map<string, string>();
  const taskDailyStatusRecords = new Map<string, Record<string, string>>();
  (dailyRes.results || []).forEach((row: any) => {
    if (row.work_date === businessDate) {
      dailyStatusMap.set(row.task_id, row.status);
    }
    if (!taskDailyStatusRecords.has(row.task_id)) {
      taskDailyStatusRecords.set(row.task_id, {});
    }
    taskDailyStatusRecords.get(row.task_id)![row.work_date] = row.status;
  });

  // 1. PROJECT-BASED DISTINCT COUNT METRICS (Part B Rules)
  // Scheduled Today Projects: start_date <= businessDate AND end_date >= businessDate AND status != 'COMPLETED'
  let scheduledTodayProjectIds: string[] = [];
  let inProgressProjectIds: string[] = [];
  let completedTodayProjectIds: string[] = [];

  try {
    const scheduledPrjsRes = await db
      .prepare(
        `SELECT DISTINCT id
         FROM projects
         WHERE status != 'COMPLETED'
           AND start_date IS NOT NULL
           AND end_date IS NOT NULL
           AND start_date <= ?
           AND end_date >= ?`
      )
      .bind(businessDate, businessDate)
      .all();
    scheduledTodayProjectIds = (scheduledPrjsRes.results || []).map((p: any) => p.id);

    const inProgressPrjsRes = await db
      .prepare(
        `SELECT DISTINCT id
         FROM projects
         WHERE status = 'ACTIVE'
           AND start_date IS NOT NULL
           AND end_date IS NOT NULL
           AND start_date <= ?
           AND end_date >= ?`
      )
      .bind(businessDate, businessDate)
      .all();
    inProgressProjectIds = (inProgressPrjsRes.results || []).map((p: any) => p.id);

    const completedTodayPrjsRes = await db
      .prepare(
        `SELECT DISTINCT id
         FROM projects
         WHERE status = 'COMPLETED'
           AND completed_at IS NOT NULL
           AND substr(completed_at, 1, 10) = ?`
      )
      .bind(businessDate)
      .all();
    completedTodayProjectIds = (completedTodayPrjsRes.results || []).map((p: any) => p.id);
  } catch (e: any) {
    console.error('[TodaySummary] PROJECT_DISTINCT_QUERY_FAILED:', e?.message || e);
  }

  // Task-based risk counters for secondary strips
  const overdueIds: string[] = [];
  const completionReviewIds: string[] = [];

  activeTasks.forEach((t) => {
    t.assignees = assigneesMap.get(t.id) || [];
    const dailyStatuses = taskDailyStatusRecords.get(t.id) || {};

    const metrics = calculateTaskProgressServer(
      t,
      workers,
      holidays,
      overrides,
      'ACTIVE',
      dailyStatuses,
      businessDate
    );

    const deadlineState = classifyTaskDeadlineStateServer(t, metrics, businessDate);

    // Overdue Tasks
    if (deadlineState === 'OVERDUE') {
      if (!overdueIds.includes(t.id)) {
        overdueIds.push(t.id);
      }
    }

    // Completion Review Tasks
    if (deadlineState === 'COMPLETION_REVIEW' && Number(t.completion_confirmed) !== 1) {
      if (!completionReviewIds.includes(t.id)) {
        completionReviewIds.push(t.id);
      }
    }
  });

  let blockedCount = 0;
  try {
    const blockedRes = await db
      .prepare(`SELECT COUNT(*) as count FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.status = 'ACTIVE' AND t.is_blocked = 1`)
      .first();
    blockedCount = Number(blockedRes?.count || 0);
  } catch (e) {
    blockedCount = 0;
  }

  return {
    date: businessDate,
    scheduled_today: { count: scheduledTodayProjectIds.length, task_ids: scheduledTodayProjectIds },
    in_progress: { count: inProgressProjectIds.length, task_ids: inProgressProjectIds },
    completed_today: { count: completedTodayProjectIds.length, task_ids: completedTodayProjectIds },
    completed_this_month: {
      count: completedThisMonthProjectIds.length,
      project_ids: completedThisMonthProjectIds,
    },
    overdue: { count: overdueIds.length, task_ids: overdueIds },
    completion_review: { count: completionReviewIds.length, task_ids: completionReviewIds },
    blocked_count: blockedCount,
  };
}

export async function getOverdueTaskDetailsServer(
  db: any,
  businessDate: string
): Promise<OverdueTaskDetailItem[]> {
  const summary = await getTodayDashboardSummaryServer(db, businessDate);
  const overdueIds = summary.overdue.task_ids;
  if (overdueIds.length === 0) return [];

  const [workersRes, holidaysRes, overridesRes] = await Promise.all([
    db.prepare(`SELECT id, name, country_code, workweek_profile, is_active FROM workers WHERE is_active = 1`).all(),
    db.prepare(`SELECT country_code, holiday_date, name_ko, name_vi FROM country_holidays`).all(),
    db.prepare(`SELECT * FROM calendar_overrides`).all(),
  ]);

  const workers = workersRes.results || [];
  const holidays = holidaysRes.results || [];
  const overrides = overridesRes.results || [];

  const placeholders = overdueIds.map(() => '?').join(',');
  const tasksRes = await db
    .prepare(
      `SELECT t.id, t.project_id, t.task_name, t.start_date, t.end_date, t.progress,
              t.completion_confirmed, t.schedule_status, t.progress_mode,
              t.primary_worker_id, t.worker_name, p.name as project_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id IN (${placeholders})`
    )
    .bind(...overdueIds)
    .all();

  const assigneesRes = await db.prepare(`SELECT * FROM task_assignees`).all();
  const assigneesMap = new Map<string, any[]>();
  (assigneesRes.results || []).forEach((row: any) => {
    if (!assigneesMap.has(row.task_id)) assigneesMap.set(row.task_id, []);
    assigneesMap.get(row.task_id)!.push(row);
  });

  const dailyRes = await db.prepare(`SELECT task_id, work_date, status FROM daily_status`).all();
  const taskDailyStatusRecords = new Map<string, Record<string, string>>();
  (dailyRes.results || []).forEach((row: any) => {
    if (!taskDailyStatusRecords.has(row.task_id)) taskDailyStatusRecords.set(row.task_id, {});
    taskDailyStatusRecords.get(row.task_id)![row.work_date] = row.status;
  });

  const items: OverdueTaskDetailItem[] = [];

  (tasksRes.results || []).forEach((t: any) => {
    t.assignees = assigneesMap.get(t.id) || [];
    const dailyStatuses = taskDailyStatusRecords.get(t.id) || {};
    const metrics = calculateTaskProgressServer(t, workers, holidays, overrides, 'ACTIVE', dailyStatuses, businessDate);

    const endDateObj = new Date(`${t.end_date}T00:00:00Z`);
    const bizDateObj = new Date(`${businessDate}T00:00:00Z`);
    const daysOverdue = Math.max(1, Math.round((bizDateObj.getTime() - endDateObj.getTime()) / (1000 * 3600 * 24)));

    const picName = t.worker_name || t.primary_worker_id || '담당자 미정';
    const modeStr = t.progress_mode || 'AUTO_TIME';
    const reason = `종료일 ${t.end_date}가 지났으며 ${modeStr} 실제 공정률이 ${metrics.actual_progress}%이고 완료 확정되지 않았습니다.`;

    items.push({
      task_id: t.id,
      task_name: t.task_name,
      project_id: t.project_id,
      project_name: t.project_name || '프로젝트',
      primary_worker_id: t.primary_worker_id || '',
      worker_name: picName,
      start_date: t.start_date,
      end_date: t.end_date,
      business_date: businessDate,
      days_overdue: daysOverdue,
      progress_mode: modeStr,
      actual_progress: metrics.actual_progress,
      completion_confirmed: Number(t.completion_confirmed || 0),
      judgement_reason: reason,
    });
  });

  return items;
}
