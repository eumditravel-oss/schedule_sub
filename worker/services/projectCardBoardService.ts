import { getAllProjectProgressFoundationsServer } from './v3FoundationService';

type BoardActor = { employeeId: string; worker: any };
type BoardColumn = 'PRE_WORK' | 'IN_PROGRESS' | 'COMPLETED' | 'REVISION';

function unique<T>(values: T[]): T[] { return Array.from(new Set(values)); }
function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}
function localizedName(project: any, worker: any): string {
  const country = String(worker?.country_code || '').toUpperCase();
  if (country === 'VN') return project.name_vi || project.name_ko || project.name;
  return project.name_ko || project.name_vi || project.name;
}
function isRevisionStatus(status: unknown): boolean {
  return ['REVISION', 'REVISION_REQUESTED', 'REOPENED', 'REOPENED_REQUESTED', 'POST_COMPLETION_REVISION'].includes(String(status || '').toUpperCase());
}
export function deriveBoardColumn(input: {
  status?: string | null;
  revisionState?: string | null;
  revisionCount?: number;
  scheduleState?: string | null;
  hasOfficialForecast?: boolean;
  officialStart?: string | null;
  referenceDate: string;
  approvedActualMinutes?: number;
  hasConfirmedActual?: boolean;
}): BoardColumn {
  const revision = isRevisionStatus(input.status) || (String(input.status || '').toUpperCase() === 'COMPLETED' && Number(input.revisionCount || 0) > 0 && String(input.revisionState || '').toUpperCase() === 'ACTIVE');
  if (revision) return 'REVISION';
  if (String(input.status || '').toUpperCase() === 'COMPLETED') return 'COMPLETED';
  const actual = Number(input.approvedActualMinutes || 0) > 0 || Boolean(input.hasConfirmedActual);
  const preWork = !actual && (input.scheduleState === 'UPCOMING' || !input.hasOfficialForecast || Boolean(input.officialStart && input.officialStart > input.referenceDate));
  return preWork ? 'PRE_WORK' : 'IN_PROGRESS';
}
function sortBoardProjects(a: any, b: any): number {
  const attention = (p: any) => (p.attention_badges?.length ? 0 : 1);
  return attention(a) - attention(b)
    || (Number(a.priority_rank ?? 999) - Number(b.priority_rank ?? 999))
    || String(a.official_end || '9999-12-31').localeCompare(String(b.official_end || '9999-12-31'))
    || String(a.display_name || '').localeCompare(String(b.display_name || ''))
    || String(a.id).localeCompare(String(b.id));
}

/**
 * Read-only Project Board projection. All lifecycle and progress fields are
 * derived here from official tables; the browser only renders this model.
 */
export async function getProjectCardBoard(db: any, actor: BoardActor) {
  const timezone = actor.worker?.timezone || actor.worker?.time_zone || (actor.worker?.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const [projectsRes, tasksRes, taskGroupsRes, assigneesRes, actualsRes, versionsRes, versionTasksRes, shadowsRes, worklogsRes, workersRes, foundations, revisionsRes] = await Promise.all([
    db.prepare(`SELECT * FROM projects ORDER BY created_at DESC,id`).all(),
    db.prepare(`SELECT * FROM tasks ORDER BY project_id,task_sort_order ASC,created_at ASC`).all(),
    db.prepare(`SELECT id,project_id,group_name,group_name_ko,group_name_vi,sort_order FROM task_groups WHERE deleted_at IS NULL ORDER BY project_id,sort_order,id`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT task_id,worker_id,assignment_role,allocation_percent,sort_order FROM task_assignees WHERE deleted_at IS NULL ORDER BY task_id,sort_order,worker_id`).all(),
    db.prepare(`SELECT task_id,approved_actual_minutes,current_progress,actual_status,remaining_estimated_minutes FROM task_actual_aggregates`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT * FROM schedule_versions ORDER BY project_id,version_number DESC`).all(),
    db.prepare(`SELECT svt.*,sv.version_number FROM schedule_version_tasks svt JOIN schedule_versions sv ON sv.id=svt.version_id ORDER BY sv.project_id,sv.version_number DESC,svt.task_id`).all(),
    db.prepare(`SELECT project_id,status,approval_classification,data_confidence,shadow_forecast_start_date,shadow_forecast_end_date,schedule_variance_workdays,created_at FROM shadow_schedule_versions ORDER BY project_id,created_at DESC`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT e.project_id,w.approval_status,COUNT(*) AS count FROM daily_worklog_entries e JOIN daily_worklogs w ON w.id=e.worklog_id WHERE e.project_id IS NOT NULL GROUP BY e.project_id,w.approval_status`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT id,name,country_code,ui_language,access_role,can_manage_schedule_engine FROM workers WHERE is_active=1 ORDER BY sort_order,name`).all(),
    getAllProjectProgressFoundationsServer(db, today).catch(() => new Map()),
    db.prepare(`SELECT project_id,COUNT(*) AS count FROM schedule_adjustment_events WHERE classification IN ('APPROVAL_REQUIRED','BLOCKED','NO_CHANGE') GROUP BY project_id`).all().catch(() => ({ results: [] })),
  ]);

  const projects = projectsRes.results || [];
  const tasks = tasksRes.results || [];
  const workerMap = new Map((workersRes.results || []).map((row: any) => [String(row.id), row]));
  const groupMap = new Map((taskGroupsRes.results || []).map((row: any) => [String(row.id), row]));
  const assigneesByTask = new Map<string, any[]>();
  for (const row of assigneesRes.results || []) {
    const list = assigneesByTask.get(String(row.task_id)) || [];
    list.push({ ...row, worker: workerMap.get(String(row.worker_id)) || null });
    assigneesByTask.set(String(row.task_id), list);
  }
  const actualByTask = new Map((actualsRes.results || []).map((row: any) => [String(row.task_id), row]));
  const latestVersionByProject = new Map<string, any>();
  for (const row of versionsRes.results || []) if (!latestVersionByProject.has(String(row.project_id))) latestVersionByProject.set(String(row.project_id), row);
  const officialByTask = new Map<string, any>();
  for (const row of versionTasksRes.results || []) {
    const version = latestVersionByProject.get(String(row.project_id));
    if (version && String(row.version_id) === String(version.id)) officialByTask.set(String(row.task_id), row);
  }
  const shadowByProject = new Map<string, any>();
  for (const row of shadowsRes.results || []) if (!shadowByProject.has(String(row.project_id))) shadowByProject.set(String(row.project_id), row);
  const worklogByProject = new Map<string, any>();
  for (const row of worklogsRes.results || []) {
    const item = worklogByProject.get(String(row.project_id)) || { pending: 0, review: 0 };
    if (row.approval_status === 'PENDING') item.pending += Number(row.count || 0);
    if (row.approval_status === 'RETURNED' || row.approval_status === 'REJECTED') item.review += Number(row.count || 0);
    worklogByProject.set(String(row.project_id), item);
  }
  const revisionByProject = new Map((revisionsRes.results || []).map((row: any) => [String(row.project_id), Number(row.count || 0)]));

  const isViewer = actor.worker?.access_role === 'VIEWER' || actor.worker?.name === 'CEO' || actor.worker?.name === 'COO';
  const isManager = actor.worker?.access_role === 'EDITOR' && Number(actor.worker?.can_manage_schedule_engine) === 1;
  let managerScope: Set<string> | null = null;
  if (isManager) {
    const supervised = await db.prepare(`SELECT employee_id FROM pilot_employee_supervision WHERE manager_employee_id=? AND is_active=1`).bind(actor.employeeId).all().catch(() => ({ results: [] }));
    const supervisedIds = (supervised.results || []).map((row: any) => String(row.employee_id));
    if (supervisedIds.length) managerScope = new Set([actor.employeeId, ...supervisedIds]);
  }
  const visibleTasks = (projectTasks: any[]) => projectTasks.filter((task: any) => {
    if (isViewer) return true;
    const ids = unique([task.primary_worker_id, ...(assigneesByTask.get(String(task.id)) || []).map((row: any) => row.worker_id)].filter(Boolean).map(String));
    if (isManager) return !managerScope || ids.some((id) => managerScope?.has(id));
    return ids.includes(actor.employeeId);
  });

  const boardProjects = projects.map((project: any) => {
    const scopedTasks = visibleTasks(tasks.filter((task: any) => String(task.project_id) === String(project.id)));
    if (!isViewer && scopedTasks.length === 0) return null;
    const foundation = foundations instanceof Map ? foundations.get(project.id) : null;
    const version = latestVersionByProject.get(String(project.id));
    const actualRows = scopedTasks.map((task: any) => actualByTask.get(String(task.id))).filter(Boolean);
    const officialStarts = scopedTasks.map((task: any) => officialByTask.get(String(task.id))?.forecast_start).filter(Boolean).sort();
    const officialEnds = scopedTasks.map((task: any) => officialByTask.get(String(task.id))?.forecast_end).filter(Boolean).sort();
    const projectShadow = shadowByProject.get(String(project.id));
    const projectWorklog = worklogByProject.get(String(project.id)) || { pending: 0, review: 0 };
    const revisionCount = revisionByProject.get(String(project.id)) || 0;
    const uniqueAssignees = new Map<string, any>();
    const taskCards = scopedTasks.map((task: any) => {
      const assignees = assigneesByTask.get(String(task.id)) || [];
      const actual: any = actualByTask.get(String(task.id));
      const official = officialByTask.get(String(task.id));
      for (const row of assignees) if (row.worker_id && !uniqueAssignees.has(String(row.worker_id))) uniqueAssignees.set(String(row.worker_id), { worker_id: row.worker_id, display_name: row.worker?.name || row.worker_id });
      const group = task.task_group_id ? String(task.task_group_id) : null;
      return {
        id: task.id, project_id: task.project_id, task_group_id: group,
        task_group_name: group ? ((groupMap.get(group) as any)?.group_name_ko || (groupMap.get(group) as any)?.group_name || null) : null,
        task_sort_order: task.task_sort_order, task_name: task.task_name, task_name_ko: task.task_name_ko, task_name_vi: task.task_name_vi,
        primary_worker_id: task.primary_worker_id || assignees.find((row: any) => row.assignment_role === 'PRIMARY')?.worker_id || null,
        primary_worker_name: assignees.find((row: any) => row.assignment_role === 'PRIMARY')?.worker?.name || task.worker_name || null,
        support_worker_names: assignees.filter((row: any) => row.assignment_role !== 'PRIMARY').map((row: any) => row.worker?.name || row.worker_id),
        status: task.schedule_state || (task.schedule_status === 'UNSCHEDULED' ? 'UNSCHEDULED' : 'SCHEDULED'), schedule_state: task.schedule_state || null,
        official_start: official?.forecast_start || task.start_date || null, official_end: official?.forecast_end || task.end_date || null,
        start_date: official?.forecast_start || task.start_date || null, end_date: official?.forecast_end || task.end_date || null,
        official_forecast_version_id: version?.id || null, approved_actual_minutes: Number(actual?.approved_actual_minutes || 0),
        actual_progress: Number(actual?.current_progress ?? task.actual_progress ?? task.progress ?? 0), actual_status: actual?.actual_status || null,
        is_blocked: Number(task.is_blocked || 0) === 1 || task.schedule_state === 'BLOCKED', blocked_reason: task.blocked_reason || null,
        worklog_state: projectWorklog.pending ? 'PENDING_REVIEW' : 'NONE',
      };
    });
    const approvedActualMinutes = taskCards.reduce((sum: number, task: any) => sum + task.approved_actual_minutes, 0);
    const completedCount = taskCards.filter((task: any) => task.schedule_state === 'COMPLETED' || task.actual_status === 'COMPLETED' || task.actual_progress >= 100).length;
    const blockedCount = taskCards.filter((task: any) => task.is_blocked).length;
    const remainingCount = taskCards.filter((task: any) => task.actual_progress < 100 && !task.is_blocked).length;
    const scheduleState = foundation?.schedule_state || project.schedule_state || (project.status === 'COMPLETED' ? 'COMPLETED' : 'UPCOMING');
    const officialStart = officialStarts[0] || foundation?.current_forecast_start_date || project.start_date || null;
    const officialEnd = officialEnds.at(-1) || foundation?.current_forecast_end_date || project.end_date || null;
    const hasConfirmedActual = approvedActualMinutes > 0 || actualRows.some((row: any) => Number(row.current_progress || 0) > 0);
    const boardColumn = deriveBoardColumn({ status: project.status, revisionState: project.revision_state, revisionCount: Number(revisionCount), scheduleState, hasOfficialForecast: Boolean(version), officialStart, referenceDate: today, approvedActualMinutes, hasConfirmedActual });
    const attentionBadges = unique([
      scheduleState === 'DELAYED' ? 'DELAYED' : '', blockedCount > 0 ? 'BLOCKED' : '', projectWorklog.pending + projectWorklog.review > 0 ? 'REVIEW_REQUIRED' : '', boardColumn === 'REVISION' ? 'REVISION' : '',
    ].filter(Boolean));
    return {
      id: project.id, name: project.name, name_ko: project.name_ko, name_vi: project.name_vi, display_name: localizedName(project, actor.worker), status: project.status,
      board_column: boardColumn, priority: project.priority || project.priority_level || null, priority_rank: Number(project.priority_rank ?? project.priority ?? 999),
      manager_name: Array.from(uniqueAssignees.values())[0]?.display_name || project.created_by_name || null, unique_assignees: Array.from(uniqueAssignees.values()), primary_team: Array.from(uniqueAssignees.values()).map((row: any) => row.display_name).slice(0, 3),
      official_start: officialStart, official_end: officialEnd, start_date: officialStart, end_date: officialEnd, official_forecast_version_id: version?.id || null, official_forecast_version: version?.version_number || null,
      approved_actual_progress: Number(foundation?.current_actual_overall_progress ?? (actualRows.length ? actualRows.reduce((sum: number, row: any) => sum + Number(row.current_progress || 0), 0) / actualRows.length : Number(project.progress || 0))),
      actual_progress: Number(foundation?.current_actual_overall_progress ?? project.progress ?? 0), schedule_variance_workdays: Number(foundation?.schedule_variance_workdays ?? project.schedule_variance_workdays ?? 0), schedule_state: scheduleState,
      remaining_task_count: remainingCount, blocked_task_count: blockedCount, project_revision_count: revisionCount,
      task_counts: { active: Math.max(0, taskCards.length - completedCount), completed: completedCount, blocked: blockedCount, total: taskCards.length },
      pending_worklog_count: projectWorklog.pending, review_worklog_count: projectWorklog.review, attention_badges: attentionBadges,
      allowed_actions: isManager ? ['OPEN', 'SCHEDULE', 'MANAGE'] : ['OPEN', 'SCHEDULE'],
      shadow: projectShadow ? { status: projectShadow.status, fresh: projectShadow.status === 'CURRENT', approval_classification: projectShadow.approval_classification, data_confidence: projectShadow.data_confidence } : { status: 'NONE', fresh: false },
      tasks: taskCards,
    };
  }).filter(Boolean).sort(sortBoardProjects);

  return { actor: { employee_id: actor.employeeId, role: actor.worker?.access_role || null, is_viewer: isViewer, is_manager: isManager }, projects: boardProjects, counts: { projects: boardProjects.length, tasks: boardProjects.reduce((sum: number, project: any) => sum + project.tasks.length, 0) } };
}
