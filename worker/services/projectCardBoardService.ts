import { getAllProjectProgressFoundationsServer } from './v3FoundationService';

type BoardActor = { employeeId: string; worker: any };

function json(value: unknown, fallback: any = {}) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Read-only Project Card Board projection.  It deliberately consumes the
 * existing Project/Task/Official/Actual/Shadow/Worklog tables and returns one
 * batch-shaped response so the board never becomes a second authority model.
 */
export async function getProjectCardBoard(db: any, actor: BoardActor) {
  const [projectsRes, tasksRes, taskGroupsRes, assigneesRes, actualsRes, versionsRes, versionTasksRes, shadowsRes, worklogsRes, workersRes, foundations] = await Promise.all([
    db.prepare(`SELECT * FROM projects ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, start_date DESC, created_at DESC`).all(),
    db.prepare(`SELECT * FROM tasks ORDER BY project_id, task_sort_order ASC, created_at ASC`).all(),
    db.prepare(`SELECT id,project_id,group_name,group_name_ko,group_name_vi,sort_order FROM task_groups WHERE deleted_at IS NULL ORDER BY project_id,sort_order,id`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT task_id,worker_id,assignment_role,allocation_percent,sort_order FROM task_assignees WHERE deleted_at IS NULL ORDER BY task_id,sort_order,worker_id`).all(),
    db.prepare(`SELECT task_id,approved_actual_minutes,current_progress,actual_status,remaining_estimated_minutes FROM task_actual_aggregates`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT * FROM schedule_versions ORDER BY project_id,version_number DESC`).all(),
    db.prepare(`SELECT svt.*,sv.version_number FROM schedule_version_tasks svt JOIN schedule_versions sv ON sv.id=svt.version_id ORDER BY sv.project_id,sv.version_number DESC,svt.task_id`).all(),
    db.prepare(`SELECT project_id,status,approval_classification,data_confidence,shadow_forecast_start_date,shadow_forecast_end_date,schedule_variance_workdays,created_at FROM shadow_schedule_versions ORDER BY project_id,created_at DESC`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT e.project_id,w.approval_status,COUNT(*) AS count FROM daily_worklog_entries e JOIN daily_worklogs w ON w.id=e.worklog_id WHERE e.project_id IS NOT NULL GROUP BY e.project_id,w.approval_status`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT id,name,country_code FROM workers WHERE is_active=1 ORDER BY sort_order,name`).all(),
    getAllProjectProgressFoundationsServer(db, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())).catch(() => new Map()),
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
    if (version && String(row.version_id) === String(version.id) && !officialByTask.has(String(row.task_id))) officialByTask.set(String(row.task_id), row);
  }
  const shadowByProject = new Map<string, any>();
  for (const row of shadowsRes.results || []) if (!shadowByProject.has(String(row.project_id))) shadowByProject.set(String(row.project_id), row);
  const worklogByProject = new Map<string, any>();
  for (const row of worklogsRes.results || []) {
    const item = worklogByProject.get(String(row.project_id)) || { pending: 0, review: 0, total: 0 };
    item.total += Number(row.count || 0);
    if (row.approval_status === 'PENDING') item.pending += Number(row.count || 0);
    if (row.approval_status === 'RETURNED' || row.approval_status === 'REJECTED') item.review += Number(row.count || 0);
    worklogByProject.set(String(row.project_id), item);
  }

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
    const ids = unique([
      task.primary_worker_id,
      ...(assigneesByTask.get(String(task.id)) || []).map((row: any) => row.worker_id),
    ].filter(Boolean).map(String));
    if (isManager) return !managerScope || ids.some((id) => managerScope?.has(id));
    return ids.includes(actor.employeeId);
  });

  const boardProjects = projects.map((project: any) => {
    const scopedTasks = visibleTasks(tasks.filter((task: any) => String(task.project_id) === String(project.id)));
    if (!isViewer && scopedTasks.length === 0) return null;
    const foundation = foundations instanceof Map ? foundations.get(project.id) : null;
    const version = latestVersionByProject.get(String(project.id));
    const actualRows = scopedTasks.map((task: any) => actualByTask.get(String(task.id))).filter(Boolean);
    const officialStarts = scopedTasks.map((task: any) => officialByTask.get(String(task.id))?.forecast_start).filter(Boolean);
    const officialEnds = scopedTasks.map((task: any) => officialByTask.get(String(task.id))?.forecast_end).filter(Boolean);
    const projectShadow = shadowByProject.get(String(project.id));
    const primaryNames = unique(scopedTasks.flatMap((task: any) => (assigneesByTask.get(String(task.id)) || []).filter((row: any) => row.assignment_role === 'PRIMARY').map((row: any) => row.worker?.name || row.worker_id))).filter(Boolean);
    const taskCards = scopedTasks.map((task: any) => {
      const assignees = assigneesByTask.get(String(task.id)) || [];
      const actual: any = actualByTask.get(String(task.id));
      const official = officialByTask.get(String(task.id));
      const group = task.task_group_id ? String(task.task_group_id) : null;
      return {
        id: task.id,
        project_id: task.project_id,
        task_group_id: group,
        task_group_name: group ? ((groupMap.get(group) as any)?.group_name_ko || (groupMap.get(group) as any)?.group_name || null) : null,
        task_sort_order: task.task_sort_order,
        task_name: task.task_name,
        task_name_ko: task.task_name_ko,
        task_name_vi: task.task_name_vi,
        worker_name: task.worker_name,
        primary_worker_id: task.primary_worker_id || assignees.find((row: any) => row.assignment_role === 'PRIMARY')?.worker_id || null,
        primary_worker_name: assignees.find((row: any) => row.assignment_role === 'PRIMARY')?.worker?.name || task.worker_name || null,
        support_worker_names: assignees.filter((row: any) => row.assignment_role !== 'PRIMARY').map((row: any) => row.worker?.name || row.worker_id),
        status: task.schedule_state || (task.schedule_status === 'UNSCHEDULED' ? 'UNSCHEDULED' : 'SCHEDULED'),
        schedule_state: task.schedule_state || null,
        start_date: official?.forecast_start || task.start_date || null,
        end_date: official?.forecast_end || task.end_date || null,
        official_forecast_version_id: version?.id || null,
        actual_progress: Number(actual?.current_progress ?? task.actual_progress ?? task.progress ?? 0),
        actual_status: actual?.actual_status || null,
        is_blocked: Number(task.is_blocked || 0) === 1 || task.schedule_state === 'BLOCKED',
        blocked_reason: task.blocked_reason || null,
        worklog_state: worklogByProject.get(String(project.id))?.pending ? 'PENDING_REVIEW' : 'NONE',
      };
    });
    const completedCount = taskCards.filter((task: any) => task.schedule_state === 'COMPLETED' || task.actual_status === 'COMPLETED' || task.actual_progress >= 100).length;
    const blockedCount = taskCards.filter((task: any) => task.is_blocked).length;
    const activeCount = Math.max(0, taskCards.length - completedCount);
    return {
      id: project.id,
      name: project.name,
      name_ko: project.name_ko,
      name_vi: project.name_vi,
      status: project.status,
      priority: project.priority || project.priority_level || null,
      manager_name: primaryNames[0] || project.created_by_name || null,
      primary_team: unique(scopedTasks.map((task: any) => task.worker_name).filter(Boolean)).slice(0, 3),
      start_date: officialStarts.sort()[0] || foundation?.current_forecast_start_date || project.start_date,
      end_date: officialEnds.sort().at(-1) || foundation?.current_forecast_end_date || project.end_date,
      official_forecast_version_id: version?.id || null,
      official_forecast_version: version?.version_number || null,
      actual_progress: Number(foundation?.current_actual_overall_progress ?? actualRows.reduce((sum: number, row: any) => sum + Number(row.current_progress || 0), 0) / Math.max(1, actualRows.length)),
      schedule_variance_workdays: Number(foundation?.schedule_variance_workdays ?? project.schedule_variance_workdays ?? project.schedule_variance_days ?? 0),
      schedule_state: foundation?.schedule_state || project.schedule_state || project.status,
      task_counts: { active: activeCount, completed: completedCount, blocked: blockedCount, total: taskCards.length },
      pending_worklog_count: worklogByProject.get(String(project.id))?.pending || 0,
      review_worklog_count: worklogByProject.get(String(project.id))?.review || 0,
      shadow: projectShadow ? { status: projectShadow.status, fresh: projectShadow.status === 'CURRENT', approval_classification: projectShadow.approval_classification, data_confidence: projectShadow.data_confidence } : { status: 'NONE', fresh: false },
      tasks: taskCards,
    };
  }).filter(Boolean);

  return {
    actor: { employee_id: actor.employeeId, role: actor.worker?.access_role || null, is_viewer: isViewer, is_manager: isManager },
    projects: boardProjects,
    counts: { projects: boardProjects.length, tasks: boardProjects.reduce((sum: number, project: any) => sum + project.tasks.length, 0) },
  };
}
