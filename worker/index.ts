// worker/index.ts
import { projectSchema, updateProjectSchema, taskSchema, updateTaskSchema, dailyStatusSchema } from './schemas/validation';
import { translateText } from './services/translation';
import { resolveWorkDayStatusServer } from './services/workCalendar';
import { fetchKrHolidaysKasi, fetchHolidaysNager, SyncedHoliday } from './services/holidayApi';

export interface Env {
  DB: any;
  ASSETS?: any;
  AI?: any;
  KASI_HOLIDAY_API_KEY?: string;
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

async function requireActiveWorker(db: any, editorName: string): Promise<boolean> {
  if (!editorName || !editorName.trim()) return false;
  try {
    const worker = await db
      .prepare(`SELECT id FROM workers WHERE name = ? AND is_active = 1`)
      .bind(editorName.trim())
      .first();
    return !!worker;
  } catch {
    const actualWorkers = [
      'CEO',
      'COO',
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
    return new Date().toISOString().split('T')[0];
  }
}

async function updateProjectAverageProgress(db: any, projectId: string) {
  const result = await db
    .prepare(`SELECT AVG(progress) as avg_progress, COUNT(*) as cnt FROM tasks WHERE project_id = ?`)
    .bind(projectId)
    .first();

  const count = result ? Number(result.cnt || 0) : 0;
  const avgProgress = count > 0 ? Math.round(Number(result.avg_progress || 0)) : 0;

  await db
    .prepare(`UPDATE projects SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(avgProgress, projectId)
    .run();
}

async function isProjectCompleted(db: any, projectId: string): Promise<boolean> {
  const prj = await db
    .prepare(`SELECT status FROM projects WHERE id = ?`)
    .bind(projectId)
    .first();
  return prj ? prj.status === 'COMPLETED' : false;
}

async function translateProjectOrTaskName(ai: any, nameText: string) {
  const isKorean = /[\uac00-\ud7af]/.test(nameText);
  const source_language: 'ko' | 'vi' = isKorean ? 'ko' : 'vi';
  const target_language: 'ko' | 'vi' = isKorean ? 'vi' : 'ko';

  try {
    const res = await translateText({
      text: nameText,
      sourceLanguage: source_language,
      targetLanguage: target_language,
      env: { AI: ai },
    });

    const translated = res.translatedText;
    const name_ko = isKorean ? nameText : translated;
    const name_vi = isKorean ? translated : nameText;

    return {
      name_ko,
      name_vi,
      source_language,
      translation_status: 'COMPLETED',
      translation_error: null,
    };
  } catch (e: any) {
    return {
      name_ko: nameText,
      name_vi: nameText,
      source_language,
      translation_status: 'FAILED',
      translation_error: e.message,
    };
  }
}

async function syncHolidaysInternal(db: any, env: Env, country_code: 'KR' | 'VN', year: number) {
  let holidays: SyncedHoliday[] = [];
  let source: 'KASI' | 'NAGER' | 'MANUAL' = 'NAGER';
  let is_verified = 0;
  let message = '';

  if (country_code === 'KR') {
    if (env.KASI_HOLIDAY_API_KEY) {
      try {
        holidays = await fetchKrHolidaysKasi(year, env.KASI_HOLIDAY_API_KEY);
        if (holidays.length > 0) {
          source = 'KASI';
          is_verified = 1;
        } else {
          holidays = await fetchHolidaysNager(year, 'KR');
          message = 'KASI 응답 결과가 없어 Nager.Date fallback을 사용했습니다.';
        }
      } catch (e: any) {
        holidays = await fetchHolidaysNager(year, 'KR');
        message = `KASI API 오류로 Nager.Date fallback 사용: ${e.message}`;
      }
    } else {
      holidays = await fetchHolidaysNager(year, 'KR');
      message = 'KASI_HOLIDAY_API_KEY가 설정되지 않아 Nager.Date fallback을 사용했습니다.';
    }
  } else {
    try {
      holidays = await fetchHolidaysNager(year, 'VN');
    } catch (e: any) {
      message = `Nager.Date fetch 오류: ${e.message}`;
    }
  }

  let synced_count = 0;
  for (const h of holidays) {
    const id = `hol_${country_code}_${h.holiday_date}`;
    const existing = await db
      .prepare(`SELECT id FROM country_holidays WHERE country_code = ? AND holiday_date = ?`)
      .bind(country_code, h.holiday_date)
      .first();

    if (existing) {
      await db
        .prepare(`UPDATE country_holidays SET name_local = ?, name_ko = ?, name_vi = ?, source = ?, is_verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(h.name_local, h.name_ko || h.name_local, h.name_vi || h.name_local, h.source, h.is_verified, existing.id)
        .run();
    } else {
      await db
        .prepare(`INSERT INTO country_holidays (id, country_code, holiday_date, name_local, name_ko, name_vi, source, source_year, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, country_code, h.holiday_date, h.name_local, h.name_ko || h.name_local, h.name_vi || h.name_local, h.source, year, h.is_verified)
        .run();
    }
    synced_count++;
  }

  return { country_code, year, synced_count, source, is_verified, message };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-editor-name',
        },
      });
    }

    try {
      // 1. GET /api/workers
      if (method === 'GET' && path === '/api/workers') {
        const workers = await db
          .prepare(`SELECT * FROM workers WHERE is_active = 1 ORDER BY sort_order ASC`)
          .all();
        return jsonResponse(workers.results || []);
      }

      // 2. GET /api/projects
      if (method === 'GET' && path === '/api/projects') {
        const statusFilter = url.searchParams.get('status') || 'ACTIVE';
        const yearFilter = url.searchParams.get('year');

        let query = `
          SELECT p.*, COUNT(t.id) as task_count
          FROM projects p
          LEFT JOIN tasks t ON p.id = t.project_id
          WHERE p.status = ?
        `;
        const params: any[] = [statusFilter];

        if (statusFilter === 'COMPLETED' && yearFilter) {
          query += ` AND (strftime('%Y', p.completed_at) = ? OR strftime('%Y', p.end_date) = ?)`;
          params.push(yearFilter, yearFilter);
        }

        query += ` GROUP BY p.id ORDER BY p.start_date DESC, p.created_at DESC`;

        const stmt = db.prepare(query);
        const bound = params.length === 1 ? stmt.bind(params[0]) : stmt.bind(...params);
        const result = await bound.all();

        const projects = await Promise.all(
          (result.results || []).map(async (prj: any) => {
            const workersRes = await db
              .prepare(`SELECT DISTINCT worker_name FROM tasks WHERE project_id = ?`)
              .bind(prj.id)
              .all();
            const participating = (workersRes.results || []).map((w: any) => w.worker_name);
            return {
              ...prj,
              participating_workers: participating,
            };
          })
        );

        return jsonResponse(projects);
      }

      // 3. POST /api/projects
      if (method === 'POST' && path === '/api/projects') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = projectSchema.parse({ ...body, editor_name: editor });
        const id = `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const transResult = await translateProjectOrTaskName(env.AI, validated.name);

        await db
          .prepare(
            `INSERT INTO projects (
              id, name, start_date, end_date, progress, status,
              name_ko, name_vi, source_language, translation_status, translation_error
            ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            validated.name,
            validated.start_date,
            validated.end_date,
            validated.progress ?? 0,
            transResult.name_ko,
            transResult.name_vi,
            transResult.source_language,
            transResult.translation_status,
            transResult.translation_error
          )
          .run();

        const created = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
        return jsonResponse(created, 201);
      }

      // 4. GET /api/projects/:id/detail
      const getDetailMatch = path.match(/^\/api\/projects\/([^/]+)\/detail$/);
      if (method === 'GET' && getDetailMatch) {
        const projectId = getDetailMatch[1];
        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!project) {
          return errorResponse('프로젝트를 찾을 수 없습니다.', 404);
        }

        const tasksRes = await db
          .prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date ASC, created_at ASC`)
          .bind(projectId)
          .all();

        const tasks = await Promise.all(
          (tasksRes.results || []).map(async (t: any) => {
            const statusRes = await db
              .prepare(`SELECT work_date, status, updated_by_name, updated_at FROM daily_status WHERE task_id = ?`)
              .bind(t.id)
              .all();

            const daily_statuses: Record<string, string> = {};
            const daily_status_details: Record<string, any> = {};

            (statusRes.results || []).forEach((st: any) => {
              daily_statuses[st.work_date] = st.status;
              daily_status_details[st.work_date] = {
                status: st.status,
                updated_by_name: st.updated_by_name,
                updated_at: st.updated_at,
              };
            });

            return {
              ...t,
              daily_statuses,
              daily_status_details,
            };
          })
        );

        const workersRes = await db
          .prepare(`SELECT DISTINCT worker_name FROM tasks WHERE project_id = ?`)
          .bind(projectId)
          .all();
        const participating = (workersRes.results || []).map((w: any) => w.worker_name);

        return jsonResponse({
          project: {
            ...project,
            participating_workers: participating,
          },
          tasks,
        });
      }

      // 5. GET /api/projects/:id
      const getPrjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'GET' && getPrjMatch) {
        const projectId = getPrjMatch[1];
        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!project) {
          return errorResponse('프로젝트를 찾을 수 없습니다.', 404);
        }
        return jsonResponse(project);
      }

      // 6. PATCH /api/projects/:id
      const patchPrjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'PATCH' && patchPrjMatch) {
        const projectId = patchPrjMatch[1];
        if (await isProjectCompleted(db, projectId)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = updateProjectSchema.parse({ ...body, editor_name: editor });
        const existing = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        if (!existing) {
          return errorResponse('프로젝트를 찾을 수 없습니다.', 404);
        }

        let name_ko = existing.name_ko;
        let name_vi = existing.name_vi;
        let source_lang = existing.source_language;
        let trans_status = existing.translation_status;
        let trans_error = existing.translation_error;

        if (validated.name && validated.name !== existing.name) {
          const transResult = await translateProjectOrTaskName(env.AI, validated.name);
          name_ko = transResult.name_ko;
          name_vi = transResult.name_vi;
          source_lang = transResult.source_language;
          trans_status = transResult.translation_status;
          trans_error = transResult.translation_error;
        }

        const newName = validated.name ?? existing.name;
        const newStart = validated.start_date ?? existing.start_date;
        const newEnd = validated.end_date ?? existing.end_date;
        const newProgress = validated.progress ?? existing.progress;

        await db
          .prepare(
            `UPDATE projects SET
              name = ?, start_date = ?, end_date = ?, progress = ?,
              name_ko = ?, name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          )
          .bind(newName, newStart, newEnd, newProgress, name_ko, name_vi, source_lang, trans_status, trans_error, projectId)
          .run();

        const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        return jsonResponse(updated);
      }

      // 7. DELETE /api/projects/:id
      const delPrjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'DELETE' && delPrjMatch) {
        const projectId = delPrjMatch[1];
        const editor = request.headers.get('x-editor-name');
        if (!(await requireActiveWorker(db, editor ? decodeURIComponent(editor) : ''))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const taskIds = await db
          .prepare(`SELECT id FROM tasks WHERE project_id = ?`)
          .bind(projectId)
          .all();

        for (const t of taskIds.results || []) {
          await db.prepare(`DELETE FROM daily_status WHERE task_id = ?`).bind(t.id).run();
        }

        await db.prepare(`DELETE FROM tasks WHERE project_id = ?`).bind(projectId).run();
        await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();

        return jsonResponse({ id: projectId });
      }

      // 8. POST /api/projects/:id/complete
      const completeMatch = path.match(/^\/api\/projects\/([^/]+)\/complete$/);
      if (method === 'POST' && completeMatch) {
        const projectId = completeMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const todayStr = getKoreaDateString();

        await db
          .prepare(
            `UPDATE projects SET
              status = 'COMPLETED', progress = 100,
              completed_at = ?, completed_by_name = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          )
          .bind(todayStr, editor, projectId)
          .run();

        const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        return jsonResponse(updated);
      }

      // 9. POST /api/projects/:id/reopen
      const reopenMatch = path.match(/^\/api\/projects\/([^/]+)\/reopen$/);
      if (method === 'POST' && reopenMatch) {
        const projectId = reopenMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        await db
          .prepare(
            `UPDATE projects SET
              status = 'ACTIVE',
              completed_at = NULL, completed_by_name = NULL,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          )
          .bind(projectId)
          .run();

        await updateProjectAverageProgress(db, projectId);

        const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        return jsonResponse(updated);
      }

      // 10. GET /api/calendar/holidays
      if (method === 'GET' && path === '/api/calendar/holidays') {
        const country = (url.searchParams.get('country') || 'KR') as 'KR' | 'VN';
        const year = parseInt(url.searchParams.get('year') || '2026', 10);

        let holidays = await db
          .prepare(`SELECT * FROM country_holidays WHERE country_code = ? AND source_year = ? ORDER BY holiday_date ASC`)
          .bind(country, year)
          .all();

        if (!holidays.results || holidays.results.length === 0) {
          await syncHolidaysInternal(db, env, country, year);
          holidays = await db
            .prepare(`SELECT * FROM country_holidays WHERE country_code = ? AND source_year = ? ORDER BY holiday_date ASC`)
            .bind(country, year)
            .all();
        }

        return jsonResponse(holidays.results || []);
      }

      // 11. POST /api/calendar/holidays/sync
      if (method === 'POST' && path === '/api/calendar/holidays/sync') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const country_code = (body.country_code || 'KR') as 'KR' | 'VN';
        const year = parseInt(body.year || '2026', 10);

        const res = await syncHolidaysInternal(db, env, country_code, year);
        return jsonResponse(res);
      }

      // 12. GET /api/calendar/overrides
      if (method === 'GET' && path === '/api/calendar/overrides') {
        const workerId = url.searchParams.get('worker_id');
        const countryCode = url.searchParams.get('country_code');
        const start = url.searchParams.get('start');
        const end = url.searchParams.get('end');

        let query = `SELECT * FROM calendar_overrides WHERE 1=1`;
        const params: any[] = [];

        if (workerId) {
          query += ` AND (scope_type = 'WORKER' AND scope_key = ?)`;
          params.push(workerId);
        }
        if (countryCode) {
          query += ` AND (scope_type = 'COUNTRY' AND scope_key = ?)`;
          params.push(countryCode);
        }
        if (start) {
          query += ` AND work_date >= ?`;
          params.push(start);
        }
        if (end) {
          query += ` AND work_date <= ?`;
          params.push(end);
        }
        query += ` ORDER BY work_date ASC`;

        const stmt = db.prepare(query);
        const bound = params.length > 0 ? stmt.bind(...params) : stmt;
        const res = await bound.all();
        return jsonResponse(res.results || []);
      }

      // 13. POST /api/calendar/overrides
      if (method === 'POST' && path === '/api/calendar/overrides') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const scope_type = body.scope_type || 'WORKER';
        const scope_key = body.scope_key;
        const start_date = body.start_date;
        const end_date = body.end_date || start_date;
        const override_type = body.override_type || 'LEAVE';
        const label_ko = body.label_ko || '';
        const label_vi = body.label_vi || '';
        const note = body.note || '';

        if (!scope_key || !start_date) {
          return errorResponse('scope_key 및 start_date는 필수입니다.', 400);
        }

        const created: any[] = [];
        const startD = new Date(`${start_date}T00:00:00`);
        const endD = new Date(`${end_date}T00:00:00`);

        for (let cur = new Date(startD); cur <= endD; cur.setDate(cur.getDate() + 1)) {
          const dateStr = cur.toISOString().slice(0, 10);
          const id = `ovr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

          const existing = await db
            .prepare(`SELECT id FROM calendar_overrides WHERE scope_type = ? AND scope_key = ? AND work_date = ?`)
            .bind(scope_type, scope_key, dateStr)
            .first();

          if (existing) {
            await db
              .prepare(
                `UPDATE calendar_overrides SET override_type = ?, label_ko = ?, label_vi = ?, note = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
              )
              .bind(override_type, label_ko, label_vi, note, editor, existing.id)
              .run();
            created.push({ id: existing.id, scope_type, scope_key, work_date: dateStr, override_type, label_ko, label_vi, note, updated_by_name: editor });
          } else {
            await db
              .prepare(
                `INSERT INTO calendar_overrides (id, scope_type, scope_key, work_date, override_type, label_ko, label_vi, note, created_by_name, updated_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(id, scope_type, scope_key, dateStr, override_type, label_ko, label_vi, note, editor, editor)
              .run();
            created.push({ id, scope_type, scope_key, work_date: dateStr, override_type, label_ko, label_vi, note, created_by_name: editor, updated_by_name: editor });
          }
        }

        return jsonResponse(created);
      }

      // 14. DELETE /api/calendar/overrides/:id
      const delOverrideMatch = path.match(/^\/api\/calendar\/overrides\/([^/]+)$/);
      if (method === 'DELETE' && delOverrideMatch) {
        const ovrId = delOverrideMatch[1];
        const editor = request.headers.get('x-editor-name');
        if (!(await requireActiveWorker(db, editor ? decodeURIComponent(editor) : ''))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        await db.prepare(`DELETE FROM calendar_overrides WHERE id = ?`).bind(ovrId).run();
        return jsonResponse({ id: ovrId });
      }

      // 15. GET /api/calendar/workers/:workerId
      const getWorkerCalMatch = path.match(/^\/api\/calendar\/workers\/([^/]+)$/);
      if (method === 'GET' && getWorkerCalMatch) {
        const workerId = getWorkerCalMatch[1];
        const start = url.searchParams.get('start') || '2026-08-01';
        const end = url.searchParams.get('end') || '2026-08-31';

        const worker = await db.prepare(`SELECT * FROM workers WHERE id = ? OR name = ?`).bind(workerId, workerId).first();
        if (!worker) {
          return errorResponse('작업자를 찾을 수 없습니다.', 404);
        }

        const countryCode = worker.country_code || 'KR';
        const holidaysRes = await db
          .prepare(`SELECT * FROM country_holidays WHERE country_code = ? AND holiday_date >= ? AND holiday_date <= ?`)
          .bind(countryCode, start, end)
          .all();
        const overridesRes = await db
          .prepare(`SELECT * FROM calendar_overrides WHERE (scope_type = 'COUNTRY' AND scope_key = ?) OR (scope_type = 'WORKER' AND scope_key = ?)`)
          .bind(countryCode, worker.id)
          .all();

        const statuses: any[] = [];
        const startD = new Date(`${start}T00:00:00`);
        const endD = new Date(`${end}T00:00:00`);

        for (let cur = new Date(startD); cur <= endD; cur.setDate(cur.getDate() + 1)) {
          const dateStr = cur.toISOString().slice(0, 10);
          const st = resolveWorkDayStatusServer(dateStr, worker, holidaysRes.results || [], overridesRes.results || []);
          statuses.push(st);
        }

        return jsonResponse(statuses);
      }

      // 16. POST /api/tasks
      if (method === 'POST' && path === '/api/tasks') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);

        if (await isProjectCompleted(db, body.project_id)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = taskSchema.parse({ ...body, editor_name: editor });
        const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const transResult = await translateProjectOrTaskName(env.AI, validated.task_name);

        try {
          await db
            .prepare(
              `INSERT INTO tasks (
                id, project_id, worker_name, task_name, start_date, end_date, progress,
                created_by_name, updated_by_name,
                task_name_ko, task_name_vi, source_language, translation_status, translation_error
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              id,
              validated.project_id,
              validated.worker_name,
              validated.task_name,
              validated.start_date,
              validated.end_date,
              validated.progress ?? 0,
              editor,
              editor,
              transResult.name_ko,
              transResult.name_vi,
              transResult.source_language,
              transResult.translation_status,
              transResult.translation_error
            )
            .run();
        } catch {
          await db
            .prepare(
              `INSERT INTO tasks (
                id, project_id, worker_name, task_name, start_date, end_date, progress,
                task_name_ko, task_name_vi, source_language, translation_status, translation_error
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              id,
              validated.project_id,
              validated.worker_name,
              validated.task_name,
              validated.start_date,
              validated.end_date,
              validated.progress ?? 0,
              transResult.name_ko,
              transResult.name_vi,
              transResult.source_language,
              transResult.translation_status,
              transResult.translation_error
            )
            .run();
        }

        await updateProjectAverageProgress(db, validated.project_id);

        const created = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first();
        return jsonResponse(created, 201);
      }

      // 17. PATCH /api/tasks/:id
      const patchTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'PATCH' && patchTaskMatch) {
        const taskId = patchTaskMatch[1];
        const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        if (!existing) {
          return errorResponse('작업을 찾을 수 없습니다.', 404);
        }

        if (await isProjectCompleted(db, existing.project_id)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        if (!(await requireActiveWorker(db, editor))) {
          return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
        }

        const validated = updateTaskSchema.parse({ ...body, editor_name: editor });

        let task_name_ko = existing.task_name_ko;
        let task_name_vi = existing.task_name_vi;
        let source_lang = existing.source_language;
        let trans_status = existing.translation_status;
        let trans_error = existing.translation_error;

        if (validated.task_name && validated.task_name !== existing.task_name) {
          const transResult = await translateProjectOrTaskName(env.AI, validated.task_name);
          task_name_ko = transResult.name_ko;
          task_name_vi = transResult.name_vi;
          source_lang = transResult.source_language;
          trans_status = transResult.translation_status;
          trans_error = transResult.translation_error;
        }

        const newWorker = validated.worker_name ?? existing.worker_name;
        const newName = validated.task_name ?? existing.task_name;
        const newStart = validated.start_date ?? existing.start_date;
        const newEnd = validated.end_date ?? existing.end_date;
        const newProgress = validated.progress ?? existing.progress;

        try {
          await db
            .prepare(
              `UPDATE tasks SET
                worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?,
                updated_by_name = ?,
                task_name_ko = ?, task_name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            )
            .bind(newWorker, newName, newStart, newEnd, newProgress, editor, task_name_ko, task_name_vi, source_lang, trans_status, trans_error, taskId)
            .run();
        } catch {
          await db
            .prepare(
              `UPDATE tasks SET
                worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?,
                task_name_ko = ?, task_name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            )
            .bind(newWorker, newName, newStart, newEnd, newProgress, task_name_ko, task_name_vi, source_lang, trans_status, trans_error, taskId)
            .run();
        }

        await updateProjectAverageProgress(db, existing.project_id);

        const updated = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        return jsonResponse(updated);
      }

      // 18. DELETE /api/tasks/:id
      const delTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'DELETE' && delTaskMatch) {
        const taskId = delTaskMatch[1];
        const existing = await db.prepare(`SELECT project_id FROM tasks WHERE id = ?`).bind(taskId).first();

        if (existing) {
          if (await isProjectCompleted(db, existing.project_id)) {
            return errorResponse('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.', 403, 'PROJECT_COMPLETED_READ_ONLY');
          }
          const editor = request.headers.get('x-editor-name');
          if (!(await requireActiveWorker(db, editor ? decodeURIComponent(editor) : ''))) {
            return errorResponse('지정된 개발팀 작업자만 편집할 수 있습니다.', 403, 'INVALID_EDITOR');
          }
          await db.prepare(`DELETE FROM daily_status WHERE task_id = ?`).bind(taskId).run();
          await db.prepare(`DELETE FROM tasks WHERE id = ?`).bind(taskId).run();
          await updateProjectAverageProgress(db, existing.project_id);
        }
        return jsonResponse({ id: taskId });
      }

      // 19. PUT /api/tasks/:taskId/daily-status/:date
      const putStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/daily-status\/([^/]+)$/);
      if (method === 'PUT' && putStatusMatch) {
        const taskId = putStatusMatch[1];
        const workDate = putStatusMatch[2];

        const task = await db.prepare(`SELECT project_id FROM tasks WHERE id = ?`).bind(taskId).first();
        if (task && (await isProjectCompleted(db, task.project_id))) {
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

      // Protect unmatched /api/* routes
      if (path.startsWith('/api/')) {
        return errorResponse('API 경로를 찾을 수 없습니다.', 404, 'API_NOT_FOUND');
      }

      // Static assets handling with SPA rewrite fallback
      if (env.ASSETS) {
        if (!path.startsWith('/api/') && (method === 'GET' || method === 'HEAD')) {
          const assetRes = await env.ASSETS.fetch(request);
          if (assetRes.status !== 404) {
            return assetRes;
          }

          const indexUrl = new URL('/index.html', request.url);
          const indexRes = await env.ASSETS.fetch(new Request(indexUrl, request));
          if (indexRes.ok || indexRes.status === 200) {
            return indexRes;
          }
        }

        return await env.ASSETS.fetch(request);
      }

      return errorResponse('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return errorResponse(err.errors[0]?.message || '입력값이 올바르지 않습니다.', 400);
      }
      return errorResponse(err.message || '서버 오류가 발생했습니다.', 500);
    }
  },
};
