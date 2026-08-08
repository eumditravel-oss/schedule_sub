// worker/services/projectCompletionService.ts
export interface CompleteProjectOptions {
  projectId: string;
  mode: 'STRICT' | 'COMPLETE_ALL' | 'REPAIR';
  editor?: {
    id?: string;
    name?: string;
  };
}

export interface CompleteProjectResult {
  success: boolean;
  status: number;
  code?: string;
  message?: string;
  project_id: string;
  project_status?: string;
  completed_tasks?: number;
  total_tasks?: number;
  incomplete_tasks?: number;
  tasks?: Array<{
    task_id: string;
    task_name: string;
    actual_progress: number;
    completion_confirmed: number;
  }>;
}

export async function completeProjectService(
  db: any,
  options: CompleteProjectOptions
): Promise<CompleteProjectResult> {
  const { projectId, mode, editor } = options;
  const nowStr = new Date().toISOString().slice(0, 10);
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Fetch Project from DB
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) {
    return {
      success: false,
      status: 404,
      code: 'PROJECT_NOT_FOUND',
      message: '프로젝트를 찾을 수 없습니다.',
      project_id: projectId,
    };
  }

  // 2. Fetch All Child Tasks from DB (Server DB is Single Source of Truth)
  const { results: childTasks } = await db
    .prepare('SELECT * FROM tasks WHERE project_id = ?')
    .bind(projectId)
    .all();

  const allChildTasks = childTasks || [];
  const incompleteTasks = allChildTasks.filter((t: any) => {
    const isConfirmed = Number(t.completion_confirmed) === 1;
    const actProg = Number(t.actual_progress ?? t.progress ?? 0);
    return !isConfirmed || actProg < 100;
  });

  // 3. STRICT Mode Check
  if (mode === 'STRICT' && incompleteTasks.length > 0) {
    return {
      success: false,
      status: 409,
      code: 'PROJECT_HAS_INCOMPLETE_TASKS',
      message: `프로젝트에 미완료 세부 작업 ${incompleteTasks.length}건이 존재합니다.`,
      project_id: projectId,
      incomplete_tasks: incompleteTasks.length,
      tasks: incompleteTasks.map((t: any) => ({
        task_id: t.id,
        task_name: t.task_name,
        actual_progress: Number(t.actual_progress ?? t.progress ?? 0),
        completion_confirmed: Number(t.completion_confirmed || 0),
      })),
    };
  }

  // 4. Prepare Atomic D1 Batch Transaction Statements
  const statements: any[] = [];

  // Statement A: Batch update all child tasks to 100% complete and confirmed
  for (const t of allChildTasks) {
    statements.push(
      db
        .prepare(
          'UPDATE tasks SET completion_confirmed = 1, progress = 100, actual_progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .bind(t.id)
    );
  }

  // Statement B: Update project status to COMPLETED
  statements.push(
    db
      .prepare(
        'UPDATE projects SET status = \'COMPLETED\', progress = 100, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .bind(nowStr, projectId)
  );

  // Statement C: Log completion audit trail
  statements.push(
    db
      .prepare(
        `INSERT INTO project_completion_logs 
        (id, project_id, mode, completed_task_count, total_task_count, editor_id, editor_name, is_repair, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(
        logId,
        projectId,
        mode,
        allChildTasks.length,
        allChildTasks.length,
        editor?.id || null,
        editor?.name || null,
        mode === 'REPAIR' ? 1 : 0
      )
  );

  // Execute D1 Batch Transaction (Atomic: ALL OR NOTHING)
  try {
    await db.batch(statements);
  } catch (err: any) {
    console.error('Failed to execute completeProjectService batch transaction:', err);
    return {
      success: false,
      status: 500,
      code: 'PROJECT_COMPLETION_TRANSACTION_FAILED',
      message: `프로젝트 완료 트랜잭션 처리 중 오류가 발생했습니다: ${err.message}`,
      project_id: projectId,
    };
  }

  // 5. Server Postcondition Verification
  const postPrj = await db.prepare('SELECT status FROM projects WHERE id = ?').bind(projectId).first();
  const { results: postIncomplete } = await db
    .prepare(
      'SELECT id FROM tasks WHERE project_id = ? AND (completion_confirmed != 1 OR COALESCE(actual_progress, progress, 0) < 100)'
    )
    .bind(projectId)
    .all();

  if (postPrj?.status !== 'COMPLETED' || (postIncomplete && postIncomplete.length > 0)) {
    return {
      success: false,
      status: 500,
      code: 'PROJECT_COMPLETION_POSTCONDITION_FAILED',
      message: '프로젝트 완료 처리 사후 검증에 실패했습니다. (일부 세부 작업이 완료되지 않음)',
      project_id: projectId,
    };
  }

  return {
    success: true,
    status: 200,
    project_id: projectId,
    project_status: 'COMPLETED',
    completed_tasks: allChildTasks.length,
    total_tasks: allChildTasks.length,
    incomplete_tasks: 0,
  };
}
