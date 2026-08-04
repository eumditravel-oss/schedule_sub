// worker/index.ts
import { projectSchema, updateProjectSchema, taskSchema, updateTaskSchema, dailyStatusSchema } from './schemas/validation';
import { translateText } from './services/translation';

export interface Env {
  DB: any;
  ASSETS?: any;
  AI?: any;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function errorResponse(message: string, status = 400, code?: string) {
  return new Response(JSON.stringify({ success: false, error: { message, code } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function getEditorName(body: any, request: Request): string {
  if (body && typeof body.editor_name === 'string' && body.editor_name.trim().length > 0) {
    return body.editor_name.trim();
  }
  const header = request.headers.get('x-editor-name');
  if (header) return decodeURIComponent(header).trim();
  return '';
}

// Server-side active editor validation
async function requireActiveWorker(db: any, editorName: string): Promise<boolean> {
  if (!editorName || !editorName.trim()) return false;
  try {
    const worker = await db
      .prepare(`SELECT id FROM workers WHERE name = ? AND is_active = 1`)
      .bind(editorName.trim())
      .first();
    return !!worker;
  } catch {
    // If workers table does not exist or fails, check hardcoded actual 5 team members
    const actualWorkers = [
      '유종욱 실장',
      '박용진 수석',
      'Thanh Phuong(탄 프엉)',
      'Manh Cuong(끄엉)',
      'Quoc Nhut(꾸옥 느엿)',
    ];
    return actualWorkers.includes(editorName.trim());
  }
}

function getKoreaDateString(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

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
        } catch {}

        const actualWorkers = [
          { id: 'wrk_01', name: '유종욱 실장', is_active: 1, sort_order: 1 },
          { id: 'wrk_02', name: '박용진 수석', is_active: 1, sort_order: 2 },
          { id: 'wrk_03', name: 'Thanh Phuong(탄 프엉)', is_active: 1, sort_order: 3 },
          { id: 'wrk_04', name: 'Manh Cuong(끄엉)', is_active: 1, sort_order: 4 },
          { id: 'wrk_05', name: 'Quoc Nhut(꾸옥 느엿)', is_active: 1, sort_order: 5 },
        ];
        return jsonResponse(actualWorkers);
      }

      // 2. POST /api/workers (BLOCKED)
      if (method === 'POST' && path === '/api/workers') {
        return errorResponse(
          '작업자 목록은 지정된 개발팀 인원만 사용할 수 있습니다.',
          405,
          'WORKER_LIST_FIXED'
        );
      }

      // 3. POST /api/translate
      if (method === 'POST' && path === '/api/translate') {
        const body: any = await request.json();
        const text = (body.text || '').trim();
        const source_language = body.source_language === 'vi' ? 'vi' : 'ko';
        const target_language = body.target_language === 'vi' ? 'vi' : 'ko';

        if (!text) {
          return errorResponse('번역할 텍스트를 입력해 주세요.', 400);
        }
        if (text.length > 300) {
          return errorResponse('번역할 텍스트가 너무 깁니다. (최대 300자)', 400);
        }

        try {
          const res = await translateText({
            text,
            sourceLanguage: source_language,
            targetLanguage: target_language,
            env,
          });
          return jsonResponse({
            translated_text: res.translatedText,
            source_language: res.sourceLanguage,
            target_language: res.targetLanguage,
            provider: res.provider,
          });
        } catch (err: any) {
          return errorResponse(err.message || '번역 처리 중 오류가 발생했습니다.', 500, 'TRANSLATION_FAILED');
        }
      }

      // 4. GET /api/projects/completed-years
      if (method === 'GET' && path === '/api/projects/completed-years') {
        const currentYear = new Date().getFullYear().toString();
        try {
          const { results } = await db
            .prepare(`
              SELECT DISTINCT strftime('%Y', completed_at) AS year
              FROM projects
              WHERE status = 'COMPLETED' AND completed_at IS NOT NULL
              ORDER BY year DESC
            `)
            .all();
          const years = (results || []).map((r: any) => r.year).filter(Boolean);
          if (!years.includes(currentYear)) {
            years.unshift(currentYear);
          }
          return jsonResponse(years);
        } catch {
          return jsonResponse([currentYear]);
        }
      }

      // 5. GET /api/projects?status=ACTIVE|COMPLETED&year=YYYY
      if (method === 'GET' && path === '/api/projects') {
        const statusFilter = url.searchParams.get('status') || 'ACTIVE';
        const yearFilter = url.searchParams.get('year');

        let query = `
          SELECT p.*, COUNT(t.id) as task_count
          FROM projects p
          LEFT JOIN tasks t ON p.id = t.project_id
        `;
        const conditions: string[] = [];
        const params: any[] = [];

        try {
          if (statusFilter === 'COMPLETED') {
            conditions.push(`p.status = 'COMPLETED'`);
            if (yearFilter) {
              conditions.push(`strftime('%Y', p.completed_at) = ?`);
              params.push(yearFilter);
            }
          } else {
            conditions.push(`(p.status = 'ACTIVE' OR p.status IS NULL)`);
          }

          if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
          }

          query += ` GROUP BY p.id ORDER BY p.start_date ASC`;

          const stmt = db.prepare(query);
          const bound = params.length > 0 ? stmt.bind(...params) : stmt;
          const { results } = await bound.all();

          const enriched = await Promise.all(
            (results || []).map(async (prj: any) => {
              if (prj.status === 'COMPLETED') {
                const { results: tWorkers } = await db
                  .prepare(`SELECT DISTINCT worker_name FROM tasks WHERE project_id = ?`)
                  .bind(prj.id)
                  .all();
                const workerList = (tWorkers || []).map((w: any) => w.worker_name).filter(Boolean);
                return { ...prj, participating_workers: workerList };
              }
              return prj;
            })
          );

          return jsonResponse(enriched);
        } catch {
          const { results } = await db
            .prepare(`SELECT p.*, COUNT(t.id) as task_count FROM projects p LEFT JOIN tasks t ON p.id = t.project_id GROUP BY p.id ORDER BY p.start_date ASC`)
            .all();
          return jsonResponse(results || []);
        }
      }

      // 6. GET /api/projects/:id/detail
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

      // 7. POST /api/projects/:id/complete
      const completeProjMatch = path.match(/^\/api\/projects\/([^/]+)\/complete$/);
      if (method === 'POST' && completeProjMatch) {
        const projectId = completeProjMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!project) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        const todayStr = getKoreaDateString();

        await db
          .prepare(`
            UPDATE projects
            SET status = 'COMPLETED', progress = 100, completed_at = ?, completed_by_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(todayStr, editor, projectId)
          .run();

        return jsonResponse({ id: projectId, status: 'COMPLETED', completed_at: todayStr, completed_by_name: editor });
      }

      // 8. POST /api/projects/:id/reopen
      const reopenProjMatch = path.match(/^\/api\/projects\/([^/]+)\/reopen$/);
      if (method === 'POST' && reopenProjMatch) {
        const projectId = reopenProjMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!project) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        await db
          .prepare(`
            UPDATE projects
            SET status = 'ACTIVE', completed_at = NULL, completed_by_name = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(projectId)
          .run();

        return jsonResponse({ id: projectId, status: 'ACTIVE' });
      }

      async function isProjectCompleted(projId: string): Promise<boolean> {
        try {
          const prj = await db.prepare(`SELECT status FROM projects WHERE id = ?`).bind(projId).first();
          return prj?.status === 'COMPLETED';
        } catch {
          return false;
        }
      }

      // 9. POST /api/projects
      if (method === 'POST' && path === '/api/projects') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = projectSchema.parse({ ...body, editor_name: editor });
        const id = `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const srcLang = (validated.source_language === 'vi' ? 'vi' : 'ko') as 'ko' | 'vi';

        let name_ko = validated.name_ko || (srcLang === 'ko' ? validated.name : undefined);
        let name_vi = validated.name_vi || (srcLang === 'vi' ? validated.name : undefined);
        let transStatus = validated.translation_status || 'PENDING';
        let transError: string | null = null;

        if (!name_ko || !name_vi) {
          try {
            const targetLang = srcLang === 'ko' ? 'vi' : 'ko';
            const res = await translateText({ text: validated.name, sourceLanguage: srcLang, targetLanguage: targetLang, env });
            if (srcLang === 'ko') {
              name_vi = res.translatedText;
              name_ko = validated.name;
            } else {
              name_ko = res.translatedText;
              name_vi = validated.name;
            }
            transStatus = 'COMPLETED';
          } catch (err: any) {
            transStatus = 'FAILED';
            transError = err.message || '번역 실패';
            if (srcLang === 'ko') name_ko = validated.name;
            else name_vi = validated.name;
          }
        }

        try {
          await db
            .prepare(`
              INSERT INTO projects (id, name, start_date, end_date, progress, status, name_ko, name_vi, source_language, translation_status, translation_error)
              VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
            `)
            .bind(id, validated.name, validated.start_date, validated.end_date, validated.progress, name_ko || validated.name, name_vi || validated.name, srcLang, transStatus, transError)
            .run();
        } catch {
          await db
            .prepare(`INSERT INTO projects (id, name, start_date, end_date, progress) VALUES (?, ?, ?, ?, ?)`)
            .bind(id, validated.name, validated.start_date, validated.end_date, validated.progress)
            .run();
        }

        return jsonResponse({ id }, 201);
      }

      // 10. PATCH /api/projects/:id
      const patchProjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'PATCH' && patchProjMatch) {
        const projectId = patchProjMatch[1];
        if (await isProjectCompleted(projectId)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = updateProjectSchema.parse({ ...body, editor_name: editor });

        const existing = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!existing) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        const name = validated.name ?? existing.name;
        const start_date = validated.start_date ?? existing.start_date;
        const end_date = validated.end_date ?? existing.end_date;
        const progress = validated.progress ?? existing.progress;

        let name_ko = validated.name_ko ?? existing.name_ko;
        let name_vi = validated.name_vi ?? existing.name_vi;
        let srcLang = validated.source_language ?? existing.source_language ?? 'ko';
        let transStatus = validated.translation_status ?? existing.translation_status ?? 'PENDING';
        let transError = validated.translation_error ?? existing.translation_error ?? null;

        if (validated.name && validated.name !== existing.name && !validated.name_ko && !validated.name_vi) {
          try {
            const targetLang = srcLang === 'ko' ? 'vi' : 'ko';
            const res = await translateText({ text: validated.name, sourceLanguage: srcLang as any, targetLanguage: targetLang, env });
            if (srcLang === 'ko') {
              name_ko = validated.name;
              name_vi = res.translatedText;
            } else {
              name_vi = validated.name;
              name_ko = res.translatedText;
            }
            transStatus = 'COMPLETED';
            transError = null;
          } catch (err: any) {
            transStatus = 'FAILED';
            transError = err.message || '번역 실패';
          }
        }

        try {
          await db
            .prepare(`
              UPDATE projects
              SET name = ?, start_date = ?, end_date = ?, progress = ?, name_ko = ?, name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(name, start_date, end_date, progress, name_ko, name_vi, srcLang, transStatus, transError, projectId)
            .run();
        } catch {
          await db
            .prepare(`UPDATE projects SET name = ?, start_date = ?, end_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(name, start_date, end_date, progress, projectId)
            .run();
        }

        return jsonResponse({ id: projectId });
      }

      // 11. DELETE /api/projects/:id
      const delProjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'DELETE' && delProjMatch) {
        const projectId = delProjMatch[1];
        if (await isProjectCompleted(projectId)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }
        const editor = request.headers.get('x-editor-name');
        if (!(await requireActiveWorker(db, editor ? decodeURIComponent(editor) : ''))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }
        await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();
        return jsonResponse({ id: projectId });
      }

      // 12. POST /api/tasks
      if (method === 'POST' && path === '/api/tasks') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = taskSchema.parse({
          ...body,
          worker_name: body.worker_name || editor,
          editor_name: editor,
        });

        if (await isProjectCompleted(validated.project_id)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const srcLang = (validated.source_language === 'vi' ? 'vi' : 'ko') as 'ko' | 'vi';

        let task_name_ko = validated.task_name_ko || (srcLang === 'ko' ? validated.task_name : undefined);
        let task_name_vi = validated.task_name_vi || (srcLang === 'vi' ? validated.task_name : undefined);
        let transStatus = validated.translation_status || 'PENDING';
        let transError: string | null = null;

        if (!task_name_ko || !task_name_vi) {
          try {
            const targetLang = srcLang === 'ko' ? 'vi' : 'ko';
            const res = await translateText({ text: validated.task_name, sourceLanguage: srcLang, targetLanguage: targetLang, env });
            if (srcLang === 'ko') {
              task_name_vi = res.translatedText;
              task_name_ko = validated.task_name;
            } else {
              task_name_ko = res.translatedText;
              task_name_vi = validated.task_name;
            }
            transStatus = 'COMPLETED';
          } catch (err: any) {
            transStatus = 'FAILED';
            transError = err.message || '번역 실패';
            if (srcLang === 'ko') task_name_ko = validated.task_name;
            else task_name_vi = validated.task_name;
          }
        }

        try {
          await db
            .prepare(`
              INSERT INTO tasks (id, project_id, worker_name, task_name, start_date, end_date, progress, created_by_name, updated_by_name, task_name_ko, task_name_vi, source_language, translation_status, translation_error)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(id, validated.project_id, validated.worker_name, validated.task_name, validated.start_date, validated.end_date, validated.progress, editor, editor, task_name_ko || validated.task_name, task_name_vi || validated.task_name, srcLang, transStatus, transError)
            .run();
        } catch {
          await db
            .prepare(`
              INSERT INTO tasks (id, project_id, worker_name, task_name, start_date, end_date, progress, created_by_name, updated_by_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(id, validated.project_id, validated.worker_name, validated.task_name, validated.start_date, validated.end_date, validated.progress, editor, editor)
            .run();
        }

        const newAvg = await updateProjectAverageProgress(db, validated.project_id);
        return jsonResponse({ id, project_progress: newAvg }, 201);
      }

      // 13. PATCH /api/tasks/:id
      const patchTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'PATCH' && patchTaskMatch) {
        const taskId = patchTaskMatch[1];
        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (!existing) return errorResponse('작업을 찾을 수 없습니다.', 404);

        if (await isProjectCompleted(existing.project_id)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = updateTaskSchema.parse({ ...body, editor_name: editor });

        const worker_name = validated.worker_name ?? existing.worker_name;
        const task_name = validated.task_name ?? existing.task_name;
        const start_date = validated.start_date ?? existing.start_date;
        const end_date = validated.end_date ?? existing.end_date;
        const progress = validated.progress ?? existing.progress;

        let task_name_ko = validated.task_name_ko ?? existing.task_name_ko;
        let task_name_vi = validated.task_name_vi ?? existing.task_name_vi;
        let srcLang = validated.source_language ?? existing.source_language ?? 'ko';
        let transStatus = validated.translation_status ?? existing.translation_status ?? 'PENDING';
        let transError = validated.translation_error ?? existing.translation_error ?? null;

        if (validated.task_name && validated.task_name !== existing.task_name && !validated.task_name_ko && !validated.task_name_vi) {
          try {
            const targetLang = srcLang === 'ko' ? 'vi' : 'ko';
            const res = await translateText({ text: validated.task_name, sourceLanguage: srcLang as any, targetLanguage: targetLang, env });
            if (srcLang === 'ko') {
              task_name_ko = validated.task_name;
              task_name_vi = res.translatedText;
            } else {
              task_name_vi = validated.task_name;
              task_name_ko = res.translatedText;
            }
            transStatus = 'COMPLETED';
            transError = null;
          } catch (err: any) {
            transStatus = 'FAILED';
            transError = err.message || '번역 실패';
          }
        }

        try {
          await db
            .prepare(`
              UPDATE tasks
              SET worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?, updated_by_name = ?, task_name_ko = ?, task_name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(worker_name, task_name, start_date, end_date, progress, editor, task_name_ko, task_name_vi, srcLang, transStatus, transError, taskId)
            .run();
        } catch {
          await db
            .prepare(`UPDATE tasks SET worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(worker_name, task_name, start_date, end_date, progress, editor, taskId)
            .run();
        }

        const newAvg = await updateProjectAverageProgress(db, existing.project_id);
        return jsonResponse({ id: taskId, project_progress: newAvg });
      }

      // 14. DELETE /api/tasks/:id
      const delTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'DELETE' && delTaskMatch) {
        const taskId = delTaskMatch[1];
        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (existing) {
          if (await isProjectCompleted(existing.project_id)) {
            return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
          }
          const editor = request.headers.get('x-editor-name');
          if (!(await requireActiveWorker(db, editor ? decodeURIComponent(editor) : ''))) {
            return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
          }
          await db.prepare(`DELETE FROM tasks WHERE id = ?`).bind(taskId).run();
          await updateProjectAverageProgress(db, existing.project_id);
        }
        return jsonResponse({ id: taskId });
      }

      // 15. PUT /api/tasks/:taskId/daily-status/:date
      const putStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/daily-status\/([^/]+)$/);
      if (method === 'PUT' && putStatusMatch) {
        const taskId = putStatusMatch[1];
        const workDate = putStatusMatch[2];

        const task = await db.prepare(`SELECT project_id FROM tasks WHERE id = ?`).bind(taskId).first();
        if (task && (await isProjectCompleted(task.project_id))) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

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
