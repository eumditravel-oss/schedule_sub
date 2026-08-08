// worker/services/todaySummaryService.ts
export interface TodaySummaryResult {
  date: string;
  scheduled_today: { count: number; task_ids: string[] };
  in_progress: { count: number; task_ids: string[] };
  completed_today: { count: number; task_ids: string[] };
  completed_this_month: { count: number; project_ids: string[] };
  overdue: { count: number; task_ids: string[] };
  blocked_count?: number;
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

  // Fetch Monthly Completed Projects (Single Source of Truth: project.completed_at)
  let completedThisMonthProjectIds: string[] = [];
  try {
    const completedPrjsRes = await db
      .prepare(
        `SELECT id
         FROM projects
         WHERE status = 'COMPLETED'
           AND completed_at IS NOT NULL
           AND completed_at >= ?
           AND completed_at < ?`
      )
      .bind(monthStart, nextMonthStart)
      .all();
    completedThisMonthProjectIds = (completedPrjsRes.results || []).map((p: any) => p.id);
  } catch (e) {
    completedThisMonthProjectIds = [];
  }

  // Fetch active projects (column is 'status')
  const activePrjRes = await db
    .prepare(`SELECT id, status FROM projects WHERE status = 'ACTIVE'`)
    .all();
  const activeProjects: any[] = activePrjRes.results || [];
  const activeProjectMap = new Map<string, any>();
  activeProjects.forEach((p) => activeProjectMap.set(p.id, p));

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
    };
  }

  // Fetch active scheduled tasks
  const tasksRes = await db
    .prepare(
      `SELECT t.id, t.project_id, t.task_name, t.start_date, t.end_date, t.progress,
              t.completion_confirmed, t.schedule_status, t.progress_mode
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.status = 'ACTIVE'
         AND t.schedule_status = 'SCHEDULED'
         AND t.start_date IS NOT NULL
         AND t.end_date IS NOT NULL`
    )
    .all();
  const activeTasks: any[] = tasksRes.results || [];

  // Fetch daily status for businessDate (table name is daily_status)
  const dailyRes = await db
    .prepare(`SELECT task_id, status FROM daily_status WHERE work_date = ?`)
    .bind(businessDate)
    .all();
  const dailyStatusMap = new Map<string, string>();
  (dailyRes.results || []).forEach((row: any) => {
    dailyStatusMap.set(row.task_id, row.status);
  });

  const scheduledTodayIds: string[] = [];
  const inProgressIds: string[] = [];
  const completedTodayIds: string[] = [];
  const overdueIds: string[] = [];

  activeTasks.forEach((t) => {
    const isScheduledToday = t.start_date <= businessDate && businessDate <= t.end_date;

    // 1. Scheduled Today
    if (isScheduledToday) {
      scheduledTodayIds.push(t.id);
    }

    // 2. In Progress
    const ds = dailyStatusMap.get(t.id);
    const prog = t.progress ?? 0;
    const isInProgressState =
      ds === 'IN_PROGRESS' ||
      (prog > 0 && prog < 100) ||
      (isScheduledToday && Number(t.completion_confirmed) !== 1);

    if (isScheduledToday && isInProgressState && Number(t.completion_confirmed) !== 1) {
      if (!inProgressIds.includes(t.id)) {
        inProgressIds.push(t.id);
      }
    }

    // 3. Completed Today
    if (ds === 'COMPLETED') {
      if (!completedTodayIds.includes(t.id)) {
        completedTodayIds.push(t.id);
      }
    }

    // 4. Overdue (end_date < businessDate AND completion_confirmed != 1 AND Project status = ACTIVE)
    if (t.end_date < businessDate && Number(t.completion_confirmed) !== 1) {
      if (!overdueIds.includes(t.id)) {
        overdueIds.push(t.id);
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
    scheduled_today: { count: scheduledTodayIds.length, task_ids: scheduledTodayIds },
    in_progress: { count: inProgressIds.length, task_ids: inProgressIds },
    completed_today: { count: completedTodayIds.length, task_ids: completedTodayIds },
    completed_this_month: {
      count: completedThisMonthProjectIds.length,
      project_ids: completedThisMonthProjectIds,
    },
    overdue: { count: overdueIds.length, task_ids: overdueIds },
    blocked_count: blockedCount,
  };
}
