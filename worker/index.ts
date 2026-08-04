// worker/index.ts
import { projectSchema, updateProjectSchema, taskSchema, updateTaskSchema, dailyStatusSchema, workerSchema } from './schemas/validation';

export interface Env {
  DB: any;
  ASSETS?: any;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Extract editor_name from body or header
function getEditorName(body: any, request: Request): string {
  if (body && typeof body.editor_name === 'string' && body.editor_name.trim().length > 0) {
    return body.editor_name.trim();
  }
  const header = request.headers.get('x-editor-name');
  if (header) return decodeURIComponent(header).trim();
  return '';
}

// Recalculates simple average progress for a project from its tasks
async function updateProjectAverageProgress(db: any, projectId: string) {
  const { results: tasks } = await db
    .prepare(`SELECT progress FROM tasks WHERE project_id = ?`)
    .bind(projectId)
    .all();

  let avgProgress = 0;
  if (tasks && tasks.length > 0) {
    const total = tasks.reduce((sum: number, t: any) => sum + (t.progress || 0), 0);
    avgProgress = Math.round((total / tasks.length) * 10) / 10;
  }

  await db
    .prepare(`UPDATE projects SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(avgProgress, projectId)
    .run();

  return avgProgress;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const db = env.DB;
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-editor-name',
        },
      });
    }

    try {
      // 1. GET /api/workers
      if (method === 'GET' && path === '/api/workers') {
        try {
          const { results } = await db
            .prepare(`SELECT * FROM workers WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`)
            .all();
          if (results && results.length > 0) {
            return jsonResponse(results);
          }
        } catch {
          // Table might not exist yet
        }
        // Fallback default workers
        const defaults = [
          { id: 'wrk_1', name: '김개발', sort_order: 1 },
          { id: 'wrk_2', name: '박개발', sort_order: 2 },
          { id: 'wrk_3', name: '이프론트', sort_order: 3 },
          { id: 'wrk_4', name: '최백엔드', sort_order: 4 },
          { id: 'wrk_5', name: '정검증', sort_order: 5 },
        ];
        return jsonResponse(defaults);
      }

      // 2. POST /api/workers
      if (method === 'POST' && path === '/api/workers') {
        const body: any = await request.json();
        const validated = workerSchema.parse(body);

        try {
          await db
            .prepare(`CREATE TABLE IF NOT EXISTS workers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              is_active INTEGER NOT NULL DEFAULT 1,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`)
            .run();
        } catch {}

        const id = `wrk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        
        let nextOrder = 1;
        try {
          const maxRow = await db.prepare(`SELECT MAX(sort_order) as max_order FROM workers`).first();
          if (maxRow && typeof maxRow.max_order === 'number') {
            nextOrder = maxRow.max_order + 1;
          }
        } catch {}

        await db
          .prepare(`INSERT OR IGNORE INTO workers (id, name, is_active, sort_order) VALUES (?, ?, 1, ?)`)
          .bind(id, validated.name, nextOrder)
          .run();

        const inserted = await db.prepare(`SELECT * FROM workers WHERE name = ?`).bind(validated.name).first();
        return jsonResponse(inserted || { id, name: validated.name }, 201);
      }

      // 3. GET /api/projects
      if (method === 'GET' && path === '/api/projects') {
        const { results } = await db
          .prepare(`
            SELECT p.*, COUNT(t.id) as task_count
            FROM projects p
            LEFT JOIN tasks t ON p.id = t.project_id
            GROUP BY p.id
            ORDER BY p.start_date ASC
          `)
          .all();
        return jsonResponse(results || []);
      }

      // 4. GET /api/projects/:id/detail
      const detailMatch = path.match(/^\/api\/projects\/([^/]+)\/detail$/);
      if (method === 'GET' && detailMatch) {
        const projectId = detailMatch[1];
        const project = await db
          .prepare(`SELECT * FROM projects WHERE id = ?`)
          .bind(projectId)
          .first();

        if (!project) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        let workerOrderMap: Record<string, number> = {};
        try {
          const { results: wList } = await db.prepare(`SELECT name, sort_order FROM workers`).all();
          if (wList) {
            for (const w of wList) {
              workerOrderMap[w.name] = w.sort_order;
            }
          }
        } catch {}

        const { results: tasks } = await db
          .prepare(`SELECT * FROM tasks WHERE project_id = ?`)
          .bind(projectId)
          .all();

        const sortedTasks = [...(tasks || [])].sort((a: any, b: any) => {
          const orderA = workerOrderMap[a.worker_name] ?? 999;
          const orderB = workerOrderMap[b.worker_name] ?? 999;
          if (orderA !== orderB) return orderA - orderB;

          const wComp = (a.worker_name || '').localeCompare(b.worker_name || '');
          if (wComp !== 0) return wComp;

          const sComp = (a.start_date || '').localeCompare(b.start_date || '');
          if (sComp !== 0) return sComp;

          return (a.created_at || '').localeCompare(b.created_at || '');
        });

        const { results: statuses } = await db
          .prepare(`
            SELECT ds.*
            FROM daily_status ds
            JOIN tasks t ON ds.task_id = t.id
            WHERE t.project_id = ?
          `)
          .bind(projectId)
          .all();

        const statusMapByTask: Record<string, Record<string, string>> = {};
        const statusDetailsByTask: Record<string, Record<string, { status: string; updated_by_name?: string }>> = {};

        for (const s of (statuses || [])) {
          if (!statusMapByTask[s.task_id]) {
            statusMapByTask[s.task_id] = {};
            statusDetailsByTask[s.task_id] = {};
          }
          statusMapByTask[s.task_id][s.work_date] = s.status;
          statusDetailsByTask[s.task_id][s.work_date] = {
            status: s.status,
            updated_by_name: s.updated_by_name || undefined,
          };
        }

        const enrichedTasks = sortedTasks.map((t: any) => ({
          ...t,
          daily_statuses: statusMapByTask[t.id] || {},
          daily_status_details: statusDetailsByTask[t.id] || {},
        }));

        return jsonResponse({ project, tasks: enrichedTasks });
      }

      // 5. POST /api/projects
      if (method === 'POST' && path === '/api/projects') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!editor) return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);

        const validated = projectSchema.parse({ ...body, editor_name: editor });
        const id = `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        await db
          .prepare(`
            INSERT INTO projects (id, name, start_date, end_date, progress)
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(id, validated.name, validated.start_date, validated.end_date, validated.progress)
          .run();

        return jsonResponse({ id }, 201);
      }

      // 6. PATCH /api/projects/:id
      const patchProjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'PATCH' && patchProjMatch) {
        const projectId = patchProjMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!editor) return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);

        const validated = updateProjectSchema.parse({ ...body, editor_name: editor });

        const existing = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!existing) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        const name = validated.name ?? existing.name;
        const start_date = validated.start_date ?? existing.start_date;
        const end_date = validated.end_date ?? existing.end_date;
        const progress = validated.progress ?? existing.progress;

        await db
          .prepare(`UPDATE projects SET name = ?, start_date = ?, end_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(name, start_date, end_date, progress, projectId)
          .run();

        return jsonResponse({ id: projectId });
      }

      // 7. DELETE /api/projects/:id
      const delProjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'DELETE' && delProjMatch) {
        const projectId = delProjMatch[1];
        const editor = request.headers.get('x-editor-name');
        if (!editor || !decodeURIComponent(editor).trim()) {
          return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);
        }
        await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();
        return jsonResponse({ id: projectId });
      }

      // 8. POST /api/tasks
      if (method === 'POST' && path === '/api/tasks') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!editor) return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);

        const validated = taskSchema.parse({
          ...body,
          worker_name: editor,
          editor_name: editor,
        });

        const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        try {
          await db
            .prepare(`
              INSERT INTO tasks (id, project_id, worker_name, task_name, start_date, end_date, progress, created_by_name, updated_by_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(id, validated.project_id, validated.worker_name, validated.task_name, validated.start_date, validated.end_date, validated.progress, editor, editor)
            .run();
        } catch {
          await db
            .prepare(`
              INSERT INTO tasks (id, project_id, worker_name, task_name, start_date, end_date, progress)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(id, validated.project_id, validated.worker_name, validated.task_name, validated.start_date, validated.end_date, validated.progress)
            .run();
        }

        const newAvg = await updateProjectAverageProgress(db, validated.project_id);

        return jsonResponse({ id, project_progress: newAvg }, 201);
      }

      // 9. PATCH /api/tasks/:id
      const patchTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'PATCH' && patchTaskMatch) {
        const taskId = patchTaskMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!editor) return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);

        const validated = updateTaskSchema.parse({ ...body, editor_name: editor });

        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (!existing) return errorResponse('작업을 찾을 수 없습니다.', 404);

        const worker_name = validated.worker_name ?? existing.worker_name;
        const task_name = validated.task_name ?? existing.task_name;
        const start_date = validated.start_date ?? existing.start_date;
        const end_date = validated.end_date ?? existing.end_date;
        const progress = validated.progress ?? existing.progress;

        try {
          await db
            .prepare(`UPDATE tasks SET worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(worker_name, task_name, start_date, end_date, progress, editor, taskId)
            .run();
        } catch {
          await db
            .prepare(`UPDATE tasks SET worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(worker_name, task_name, start_date, end_date, progress, taskId)
            .run();
        }

        const newAvg = await updateProjectAverageProgress(db, existing.project_id);

        return jsonResponse({ id: taskId, project_progress: newAvg });
      }

      // 10. DELETE /api/tasks/:id
      const delTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'DELETE' && delTaskMatch) {
        const taskId = delTaskMatch[1];
        const editor = request.headers.get('x-editor-name');
        if (!editor || !decodeURIComponent(editor).trim()) {
          return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);
        }
        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (existing) {
          await db.prepare(`DELETE FROM tasks WHERE id = ?`).bind(taskId).run();
          await updateProjectAverageProgress(db, existing.project_id);
        }
        return jsonResponse({ id: taskId });
      }

      // 11. PUT /api/tasks/:taskId/daily-status/:date
      const putStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/daily-status\/([^/]+)$/);
      if (method === 'PUT' && putStatusMatch) {
        const taskId = putStatusMatch[1];
        const workDate = putStatusMatch[2];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!editor) return errorResponse('현재 접속자를 먼저 선택해 주세요.', 400);

        const validated = dailyStatusSchema.parse({ ...body, editor_name: editor });

        const existing = await db
          .prepare(`SELECT id FROM daily_status WHERE task_id = ? AND work_date = ?`)
          .bind(taskId, workDate)
          .first();

        let id = existing ? existing.id : `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        if (existing) {
          try {
            await db
              .prepare(`UPDATE daily_status SET status = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .bind(validated.status, editor, id)
              .run();
          } catch {
            await db
              .prepare(`UPDATE daily_status SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .bind(validated.status, id)
              .run();
          }
        } else {
          try {
            await db
              .prepare(`INSERT INTO daily_status (id, task_id, work_date, status, updated_by_name) VALUES (?, ?, ?, ?, ?)`)
              .bind(id, taskId, workDate, validated.status, editor)
              .run();
          } catch {
            await db
              .prepare(`INSERT INTO daily_status (id, task_id, work_date, status) VALUES (?, ?, ?, ?)`)
              .bind(id, taskId, workDate, validated.status)
              .run();
          }
        }

        return jsonResponse({ id, task_id: taskId, work_date: workDate, status: validated.status, updated_by_name: editor });
      }

      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return errorResponse('API 엔드포인트를 찾을 수 없습니다.', 404);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return errorResponse(err.errors[0]?.message || '입력값이 올바르지 않습니다.', 400);
      }
      return errorResponse(err.message || '서버 오류가 발생했습니다.', 500);
    }
  },
};
