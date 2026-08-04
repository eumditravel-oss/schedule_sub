// worker/index.ts
import { projectSchema, updateProjectSchema, taskSchema, updateTaskSchema, dailyStatusSchema } from './schemas/validation';

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
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      // 1. GET /api/projects
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

      // 2. GET /api/projects/:id/detail
      const detailMatch = path.match(/^\/api\/projects\/([^/]+)\/detail$/);
      if (method === 'GET' && detailMatch) {
        const projectId = detailMatch[1];
        const project = await db
          .prepare(`SELECT * FROM projects WHERE id = ?`)
          .bind(projectId)
          .first();

        if (!project) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        const { results: tasks } = await db
          .prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date ASC, id ASC`)
          .bind(projectId)
          .all();

        // Load daily statuses for all tasks of this project
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
        for (const s of (statuses || [])) {
          if (!statusMapByTask[s.task_id]) {
            statusMapByTask[s.task_id] = {};
          }
          statusMapByTask[s.task_id][s.work_date] = s.status;
        }

        const enrichedTasks = (tasks || []).map((t: any) => ({
          ...t,
          daily_statuses: statusMapByTask[t.id] || {},
        }));

        return jsonResponse({ project, tasks: enrichedTasks });
      }

      // 3. POST /api/projects
      if (method === 'POST' && path === '/api/projects') {
        const body = await request.json();
        const validated = projectSchema.parse(body);
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

      // 4. PATCH /api/projects/:id
      const patchProjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'PATCH' && patchProjMatch) {
        const projectId = patchProjMatch[1];
        const body = await request.json();
        const validated = updateProjectSchema.parse(body);

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

      // 5. DELETE /api/projects/:id
      const delProjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'DELETE' && delProjMatch) {
        const projectId = delProjMatch[1];
        await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();
        return jsonResponse({ id: projectId });
      }

      // 6. POST /api/tasks
      if (method === 'POST' && path === '/api/tasks') {
        const body = await request.json();
        const validated = taskSchema.parse(body);
        const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        await db
          .prepare(`
            INSERT INTO tasks (id, project_id, worker_name, task_name, start_date, end_date, progress)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(id, validated.project_id, validated.worker_name, validated.task_name, validated.start_date, validated.end_date, validated.progress)
          .run();

        const newAvg = await updateProjectAverageProgress(db, validated.project_id);

        return jsonResponse({ id, project_progress: newAvg }, 201);
      }

      // 7. PATCH /api/tasks/:id
      const patchTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'PATCH' && patchTaskMatch) {
        const taskId = patchTaskMatch[1];
        const body = await request.json();
        const validated = updateTaskSchema.parse(body);

        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (!existing) return errorResponse('작업을 찾을 수 없습니다.', 404);

        const worker_name = validated.worker_name ?? existing.worker_name;
        const task_name = validated.task_name ?? existing.task_name;
        const start_date = validated.start_date ?? existing.start_date;
        const end_date = validated.end_date ?? existing.end_date;
        const progress = validated.progress ?? existing.progress;

        await db
          .prepare(`UPDATE tasks SET worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(worker_name, task_name, start_date, end_date, progress, taskId)
          .run();

        const newAvg = await updateProjectAverageProgress(db, existing.project_id);

        return jsonResponse({ id: taskId, project_progress: newAvg });
      }

      // 8. DELETE /api/tasks/:id
      const delTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'DELETE' && delTaskMatch) {
        const taskId = delTaskMatch[1];
        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (existing) {
          await db.prepare(`DELETE FROM tasks WHERE id = ?`).bind(taskId).run();
          await updateProjectAverageProgress(db, existing.project_id);
        }
        return jsonResponse({ id: taskId });
      }

      // 9. PUT /api/tasks/:taskId/daily-status/:date
      const putStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/daily-status\/([^/]+)$/);
      if (method === 'PUT' && putStatusMatch) {
        const taskId = putStatusMatch[1];
        const workDate = putStatusMatch[2];
        const body = await request.json();
        const validated = dailyStatusSchema.parse(body);

        const existing = await db
          .prepare(`SELECT id FROM daily_status WHERE task_id = ? AND work_date = ?`)
          .bind(taskId, workDate)
          .first();

        let id = existing ? existing.id : `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        if (existing) {
          await db
            .prepare(`UPDATE daily_status SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(validated.status, id)
            .run();
        } else {
          await db
            .prepare(`INSERT INTO daily_status (id, task_id, work_date, status) VALUES (?, ?, ?, ?)`)
            .bind(id, taskId, workDate, validated.status)
            .run();
        }

        return jsonResponse({ id, task_id: taskId, work_date: workDate, status: validated.status });
      }

      // Static assets fallback if deployed on Cloudflare
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return errorResponse('API 엔드포인트를 찾을 수 없습니다.', 404);
    } catch (err: any) {
      return errorResponse(err.message || '서버 오류가 발생했습니다.', 500);
    }
  },
};
