// worker/index.ts
import { projectSchema, updateProjectSchema, taskSchema, updateTaskSchema, dailyStatusSchema } from './schemas/validation';
import { translateText } from './services/translation';
import { resolveWorkDayStatusServer } from './services/workCalendar';
import { fetchKrHolidaysKasi, fetchHolidaysNager, SyncedHoliday } from './services/holidayApi';
import {
  isWorkerWorkingDayServer,
  countWorkerWorkingDaysServer,
  addWorkerWorkingDaysServer,
  calculateLeaveImpactServer,
  WorkerProfile,
} from './services/scheduleCalendar';

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

async function getActiveWorkerProfile(db: any, editorName: string): Promise<any | null> {
  if (!editorName || !editorName.trim()) return null;
  const trimmed = editorName.trim();
  try {
    const worker = await db
      .prepare(`SELECT * FROM workers WHERE (id = ? OR name = ?) AND is_active = 1`)
      .bind(trimmed, trimmed)
      .first();
    if (worker) return worker;
  } catch {}

  const hardcoded: Record<string, any> = {
    'wrk_00_ceo': { id: 'wrk_00_ceo', name: 'CEO', access_role: 'VIEWER', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    'CEO': { id: 'wrk_00_ceo', name: 'CEO', access_role: 'VIEWER', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    'wrk_00_coo': { id: 'wrk_00_coo', name: 'COO', access_role: 'VIEWER', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    'COO': { id: 'wrk_00_coo', name: 'COO', access_role: 'VIEWER', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    'wrk_01': { id: 'wrk_01', name: '유종욱 실장', access_role: 'EDITOR', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    '유종욱 실장': { id: 'wrk_01', name: '유종욱 실장', access_role: 'EDITOR', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    'wrk_02': { id: 'wrk_02', name: '박용진 수석', access_role: 'EDITOR', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    '박용진 수석': { id: 'wrk_02', name: '박용진 수석', access_role: 'EDITOR', ui_language: 'ko', country_code: 'KR', workweek_profile: 'MON_FRI' },
    'wrk_03': { id: 'wrk_03', name: 'Thanh Phuong(탄 프엉)', access_role: 'EDITOR', ui_language: 'vi', country_code: 'VN', workweek_profile: 'MON_SAT' },
    'Thanh Phuong(탄 프엉)': { id: 'wrk_03', name: 'Thanh Phuong(탄 프엉)', access_role: 'EDITOR', ui_language: 'vi', country_code: 'VN', workweek_profile: 'MON_SAT' },
    'wrk_04': { id: 'wrk_04', name: 'Manh Cuong(끄엉)', access_role: 'EDITOR', ui_language: 'vi', country_code: 'VN', workweek_profile: 'MON_SAT' },
    'Manh Cuong(끄엉)': { id: 'wrk_04', name: 'Manh Cuong(끄엉)', access_role: 'EDITOR', ui_language: 'vi', country_code: 'VN', workweek_profile: 'MON_SAT' },
    'wrk_05': { id: 'wrk_05', name: 'Quoc Nhut(꾸옥 느엿)', access_role: 'EDITOR', ui_language: 'vi', country_code: 'VN', workweek_profile: 'MON_SAT' },
    'Quoc Nhut(꾸옥 느엿)': { id: 'wrk_05', name: 'Quoc Nhut(꾸옥 느엿)', access_role: 'EDITOR', ui_language: 'vi', country_code: 'VN', workweek_profile: 'MON_SAT' },
  };
  return hardcoded[trimmed] || null;
}

async function requireEditableWorker(db: any, editorName: string): Promise<{ allowed: boolean; worker?: any; errorMsg?: string; errorCode?: string }> {
  if (!editorName || !editorName.trim()) {
    return { allowed: false, errorMsg: '현재 접속자를 먼저 선택하세요.', errorCode: 'INVALID_EDITOR' };
  }
  const worker = await getActiveWorkerProfile(db, editorName);
  if (!worker) {
    return { allowed: false, errorMsg: '지정된 개발팀 작업자만 편집할 수 있습니다.', errorCode: 'INVALID_EDITOR' };
  }
  if (worker.access_role !== 'EDITOR') {
    return { allowed: false, errorMsg: '경영진 계정은 일정을 조회할 수만 있습니다.', errorCode: 'EXECUTIVE_READ_ONLY' };
  }
  return { allowed: true, worker };
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
          .prepare(`SELECT id, name, is_active, sort_order, country_code, workweek_profile, access_role, ui_language FROM workers WHERE is_active = 1 ORDER BY sort_order ASC`)
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function differenceInPureCalendarDays(dateStr2: string, dateStr1: string): number {
  const p2 = parseDateParts(dateStr2);
  const p1 = parseDateParts(dateStr1);
  const utc1 = Date.UTC(p1.year, p1.month - 1, p1.day);
  const utc2 = Date.UTC(p2.year, p2.month - 1, p2.day);
  return Math.round((utc2 - utc1) / 86400000);
}

function addPureCalendarDays(dateStr: string, deltaDays: number): string {
  const p = parseDateParts(dateStr);
  const utc = Date.UTC(p.year, p.month - 1, p.day);
  const next = new Date(utc + deltaDays * 86400000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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

        const oldStart = existing.start_date;
        const oldEnd = existing.end_date;
        const newStart = validated.start_date ?? oldStart;
        const deltaDays = differenceInPureCalendarDays(newStart, oldStart);

        const tasksRes = await db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date ASC, created_at ASC`).bind(projectId).all();
        const tasks: any[] = tasksRes.results || [];

        // Case A: deltaDays === 0 (Project start_date is unchanged)
        if (deltaDays === 0) {
          const targetEnd = validated.end_date ?? oldEnd;
          if (targetEnd < oldEnd && tasks.length > 0) {
            const conflicting = tasks.filter((t) => t.end_date > targetEnd || t.start_date > targetEnd);
            if (conflicting.length > 0) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: {
                    code: 'TASK_OUTSIDE_PROJECT_RANGE',
                    message: '일부 작업 일정이 프로젝트 기간을 벗어납니다.',
                    details: conflicting.map((t) => ({
                      task_id: t.id,
                      task_name: t.task_name,
                      task_start_date: t.start_date,
                      task_end_date: t.end_date,
                      project_end_date: targetEnd,
                    })),
                  },
                }),
                { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
              );
            }
          }

          const newName = validated.name ?? existing.name;
          const newProgress = validated.progress ?? existing.progress;
          await db
            .prepare(
              `UPDATE projects SET
                name = ?, start_date = ?, end_date = ?, progress = ?,
                name_ko = ?, name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            )
            .bind(newName, newStart, targetEnd, newProgress, name_ko, name_vi, source_lang, trans_status, trans_error, projectId)
            .run();

          const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
          return jsonResponse(updated);
        }

        // Case B: deltaDays !== 0 (Project start_date changed!)
        const autoShiftedEnd = addPureCalendarDays(oldEnd, deltaDays);
        let targetProjectEnd = autoShiftedEnd;
        let projectEndAutoShifted = true;

        if (validated.end_date && validated.end_date !== autoShiftedEnd) {
          targetProjectEnd = validated.end_date;
          projectEndAutoShifted = false;
        }

        // Check if any shifted task violates project date boundaries
        if (tasks.length > 0) {
          const conflicting = tasks.filter((t) => {
            const nStart = addPureCalendarDays(t.start_date, deltaDays);
            const nEnd = addPureCalendarDays(t.end_date, deltaDays);
            return nEnd > targetProjectEnd || nStart < newStart;
          });

          if (conflicting.length > 0) {
            return new Response(
              JSON.stringify({
                success: false,
                error: {
                  code: 'TASK_OUTSIDE_PROJECT_RANGE',
                  message: '일부 작업 일정이 프로젝트 기간을 벗어납니다.',
                  details: conflicting.map((t) => ({
                    task_id: t.id,
                    task_name: t.task_name,
                    task_start_date: addPureCalendarDays(t.start_date, deltaDays),
                    task_end_date: addPureCalendarDays(t.end_date, deltaDays),
                    project_end_date: targetProjectEnd,
                  })),
                },
              }),
              { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
          }
        }

        const todayStr = getKoreaDateString();

        let totalFutureStatusCount = 0;
        let totalPastStatusCount = 0;
        const taskPreviews: any[] = [];

        for (const t of tasks) {
          const nStart = addPureCalendarDays(t.start_date, deltaDays);
          const nEnd = addPureCalendarDays(t.end_date, deltaDays);
          taskPreviews.push({
            task_id: t.id,
            task_name: t.task_name,
            old_start_date: t.start_date,
            new_start_date: nStart,
            old_end_date: t.end_date,
            new_end_date: nEnd,
          });

          const statusRes = await db.prepare(`SELECT work_date FROM daily_status WHERE task_id = ?`).bind(t.id).all();
          const stList: any[] = statusRes.results || [];
          stList.forEach((st) => {
            if (st.work_date >= todayStr) {
              totalFutureStatusCount++;
            } else {
              totalPastStatusCount++;
            }
          });
        }

        // Confirmation required check
        if (validated.confirm_schedule_cascade !== true && tasks.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'PROJECT_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED',
                message: '프로젝트 일정 변경 확인이 필요합니다.',
                details: {
                  old_start_date: oldStart,
                  new_start_date: newStart,
                  delta_days: deltaDays,
                  old_end_date: oldEnd,
                  new_end_date: targetProjectEnd,
                  shifted_task_count: tasks.length,
                  shifted_future_status_count: totalFutureStatusCount,
                  preserved_past_status_count: totalPastStatusCount,
                  task_preview: taskPreviews,
                },
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        // Validate daily_status shift conflict
        for (const t of tasks) {
          const statusRes = await db.prepare(`SELECT * FROM daily_status WHERE task_id = ?`).bind(t.id).all();
          const stList: any[] = statusRes.results || [];
          const pastSet = new Set(stList.filter((st) => st.work_date < todayStr).map((st) => st.work_date));
          const futureList = stList.filter((st) => st.work_date >= todayStr);

          const futureNewDates = new Set<string>();
          for (const fSt of futureList) {
            const nWorkDate = addPureCalendarDays(fSt.work_date, deltaDays);
            if (pastSet.has(nWorkDate) || futureNewDates.has(nWorkDate)) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: {
                    code: 'DAILY_STATUS_SHIFT_CONFLICT',
                    message: '일별 상태 날짜 이동 중 충돌이 발생했습니다.',
                    details: {
                      task_id: t.id,
                      task_name: t.task_name,
                      old_work_date: fSt.work_date,
                      new_work_date: nWorkDate,
                    },
                  },
                }),
                { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
              );
            }
            futureNewDates.add(nWorkDate);
          }
        }

        // Prepare Atomic Batch
        const batchStatements: any[] = [];
        const newName = validated.name ?? existing.name;
        const newProgress = validated.progress ?? existing.progress;

        // 1. Update Project
        batchStatements.push(
          db.prepare(
            `UPDATE projects SET
              name = ?, start_date = ?, end_date = ?, progress = ?,
              name_ko = ?, name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          ).bind(newName, newStart, targetProjectEnd, newProgress, name_ko, name_vi, source_lang, trans_status, trans_error, projectId)
        );

        // 2. Update Tasks and Daily Statuses
        for (const t of tasks) {
          const nStart = addPureCalendarDays(t.start_date, deltaDays);
          const nEnd = addPureCalendarDays(t.end_date, deltaDays);

          batchStatements.push(
            db.prepare(
              `UPDATE tasks SET
                start_date = ?, end_date = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            ).bind(nStart, nEnd, editor, t.id)
          );

          const statusRes = await db.prepare(`SELECT * FROM daily_status WHERE task_id = ?`).bind(t.id).all();
          const stList: any[] = statusRes.results || [];
          const futureSts = stList.filter((st) => st.work_date >= todayStr);

          if (futureSts.length > 0) {
            batchStatements.push(
              db.prepare(`DELETE FROM daily_status WHERE task_id = ? AND work_date >= ?`).bind(t.id, todayStr)
            );

            for (const fSt of futureSts) {
              const nWorkDate = addPureCalendarDays(fSt.work_date, deltaDays);
              const newStId = `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              batchStatements.push(
                db.prepare(
                  `INSERT INTO daily_status (id, task_id, work_date, status, updated_by_name, updated_at)
                   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
                ).bind(newStId, t.id, nWorkDate, fSt.status, editor)
              );
            }
          }
        }

        // 3. Coordinate Active Leave Shift Logs for Tasks in Project
        const leaveTaskLogsRes = await db
          .prepare(
            `SELECT ltl.* FROM leave_schedule_shift_task_logs ltl
             JOIN leave_schedule_shift_events lse ON ltl.event_id = lse.id
             WHERE ltl.project_id = ? AND lse.event_status IN ('ACTIVE', 'LEAVE_DELETED_PENDING_DECISION')`
          )
          .bind(projectId)
          .all();
        const ltlList: any[] = leaveTaskLogsRes.results || [];
        for (const ltl of ltlList) {
          const nOldStart = addPureCalendarDays(ltl.old_start_date, deltaDays);
          const nOldEnd = addPureCalendarDays(ltl.old_end_date, deltaDays);
          const nNewStart = addPureCalendarDays(ltl.new_start_date, deltaDays);
          const nNewEnd = addPureCalendarDays(ltl.new_end_date, deltaDays);
          batchStatements.push(
            db.prepare(
              `UPDATE leave_schedule_shift_task_logs SET
                old_start_date = ?, old_end_date = ?, new_start_date = ?, new_end_date = ?
               WHERE id = ?`
            ).bind(nOldStart, nOldEnd, nNewStart, nNewEnd, ltl.id)
          );
        }

        const leaveStatusLogsRes = await db
          .prepare(
            `SELECT lsl.* FROM leave_schedule_shift_status_logs lsl
             JOIN leave_schedule_shift_events lse ON lsl.event_id = lse.id
             JOIN tasks t ON lsl.task_id = t.id
             WHERE t.project_id = ? AND lse.event_status IN ('ACTIVE', 'LEAVE_DELETED_PENDING_DECISION')`
          )
          .bind(projectId)
          .all();
        const lslList: any[] = leaveStatusLogsRes.results || [];
        for (const lsl of lslList) {
          const nOldDate = addPureCalendarDays(lsl.old_work_date, deltaDays);
          const nNewDate = addPureCalendarDays(lsl.new_work_date, deltaDays);
          batchStatements.push(
            db.prepare(
              `UPDATE leave_schedule_shift_status_logs SET
                old_work_date = ?, new_work_date = ?
               WHERE id = ?`
            ).bind(nOldDate, nNewDate, lsl.id)
          );
        }

        // 4. Insert Shift Log Entry
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        batchStatements.push(
          db.prepare(
            `INSERT INTO project_schedule_shift_logs (
              id, project_id, old_start_date, new_start_date, old_end_date, new_end_date,
              delta_days, shifted_task_count, shifted_future_status_count, preserved_past_status_count,
              changed_by_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            logId, projectId, oldStart, newStart, oldEnd, targetProjectEnd,
            deltaDays, tasks.length, totalFutureStatusCount, totalPastStatusCount, editor
          )
        );

        // Execute batch transaction atomically!
        await db.batch(batchStatements);

        const updatedProject = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        return jsonResponse({
          project: updatedProject,
          schedule_cascade: {
            applied: true,
            delta_days: deltaDays,
            project_end_auto_shifted: projectEndAutoShifted,
            shifted_task_count: tasks.length,
            shifted_future_status_count: totalFutureStatusCount,
            preserved_past_status_count: totalPastStatusCount,
            tasks: taskPreviews,
          },
        });
      }

      // 7. DELETE /api/projects/:id
      const delPrjMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'DELETE' && delPrjMatch) {
        const projectId = delPrjMatch[1];
        const editor = request.headers.get('x-editor-name');
        const editCheck = await requireEditableWorker(db, editor ? decodeURIComponent(editor) : '');
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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

      // 13. GET /api/calendar/override-groups
      if (method === 'GET' && path === '/api/calendar/override-groups') {
        const workerId = url.searchParams.get('worker_id');
        let query = `SELECT g.*,
          (SELECT COUNT(*) FROM calendar_overrides WHERE override_group_id = g.id) as date_count,
          e.working_leave_days, e.affected_project_count, e.affected_task_count, e.event_status, e.restore_token
          FROM calendar_override_groups g
          LEFT JOIN leave_schedule_shift_events e ON g.id = e.override_group_id
          WHERE g.status = 'ACTIVE'`;
        const params: any[] = [];
        if (workerId) {
          query += ` AND g.worker_id = ?`;
          params.push(workerId);
        }
        query += ` ORDER BY g.start_date DESC, g.created_at DESC`;
        const stmt = db.prepare(query);
        const bound = params.length > 0 ? stmt.bind(...params) : stmt;
        const res = await bound.all();
        return jsonResponse(res.results || []);
      }

      // 14. POST /api/calendar/overrides
      if (method === 'POST' && path === '/api/calendar/overrides') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const scope_type = body.scope_type || 'WORKER';
        const scope_key = body.scope_key;
        const start_date = body.start_date || body.work_date;
        const end_date = body.end_date || start_date;
        const override_type = body.override_type || 'LEAVE';
        const label_ko = body.label_ko || '';
        const label_vi = body.label_vi || '';
        const note = body.note || '';

        if (!scope_key || !start_date) {
          return errorResponse('scope_key 및 start_date는 필수입니다.', 400);
        }

        // Restriction: EDITOR can only alter their own worker schedule!
        if (scope_type === 'WORKER') {
          const editorWorker = editCheck.worker!;
          if (scope_key !== editorWorker.id && scope_key !== editorWorker.name) {
            return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
          }
        }

        const workerProfile = await db
          .prepare(`SELECT * FROM workers WHERE id = ? OR name = ?`)
          .bind(scope_key, scope_key)
          .first();
        const targetWorker: WorkerProfile = workerProfile || {
          id: scope_key,
          name: scope_key,
          country_code: 'KR',
          ui_language: 'ko',
        };

        const todayStr = getKoreaDateString();

        // 1. Check for Duplicate LEAVE dates
        if (override_type === 'LEAVE') {
          const dupRes = await db
            .prepare(
              `SELECT work_date FROM calendar_overrides
               WHERE scope_type = 'WORKER' AND scope_key IN (?, ?) AND override_type = 'LEAVE'
               AND work_date >= ? AND work_date <= ?`
            )
            .bind(targetWorker.id, targetWorker.name, start_date, end_date)
            .all();
          const dupList: any[] = dupRes.results || [];
          if (dupList.length > 0) {
            const dupDates = dupList.map((d) => d.work_date).join(', ');
            const isVi = targetWorker.ui_language === 'vi';
            const msg = isVi
              ? `Lịch nghỉ 이미 등록된 날짜가 존재합니다: ${dupDates}`
              : `이미 등록된 휴가 날짜가 포함되어 있습니다: ${dupDates}`;
            return errorResponse(msg, 409, 'LEAVE_DATE_ALREADY_REGISTERED');
          }
        }

        // 2. Evaluate Leave Impact
        const isPastLeave = end_date < todayStr;
        const impact = (override_type === 'LEAVE' && !isPastLeave)
          ? await calculateLeaveImpactServer(db, targetWorker, start_date, end_date, todayStr)
          : { working_leave_days: 0, affected_project_count: 0, affected_task_count: 0, shifted_future_status_count: 0, has_range_conflict: false, task_impacts: [], status_impacts: [] };

        // 3. Range Conflict Check
        if (impact.has_range_conflict && body.save_leave_without_schedule_shift !== true) {
          const conflicts = impact.task_impacts
            .filter((ti) => ti.range_conflict)
            .map((ti) => ({
              project_id: ti.task.project_id,
              project_name: ti.task.project_name,
              project_end_date: ti.task.project_end_date,
              task_id: ti.task.id,
              task_name: ti.task.task_name,
              old_start_date: ti.old_start_date,
              old_end_date: ti.old_end_date,
              new_start_date: ti.new_start_date,
              new_end_date: ti.new_end_date,
              exceeded_working_days: ti.exceeded_days,
            }));
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'LEAVE_SHIFT_PROJECT_RANGE_CONFLICT',
                message: '휴가 반영 후 일부 작업이 프로젝트 종료일을 초과합니다.',
                details: {
                  worker_id: targetWorker.id,
                  working_leave_days: impact.working_leave_days,
                  conflicts,
                },
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        // 4. Confirmation Required Check
        if (
          override_type === 'LEAVE' &&
          impact.working_leave_days > 0 &&
          impact.affected_task_count > 0 &&
          body.confirm_leave_schedule_cascade !== true &&
          body.save_leave_without_schedule_shift !== true
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED',
                message: '휴가로 변경되는 작업 일정을 확인해야 합니다.',
                details: {
                  worker_id: targetWorker.id,
                  worker_name: targetWorker.name,
                  leave_start_date: start_date,
                  leave_end_date: end_date,
                  working_leave_days: impact.working_leave_days,
                  affected_project_count: impact.affected_project_count,
                  affected_task_count: impact.affected_task_count,
                  shifted_future_status_count: impact.shifted_future_status_count,
                  task_preview: impact.task_impacts.map((ti) => ({
                    project_id: ti.task.project_id,
                    project_name: ti.task.project_name,
                    task_id: ti.task.id,
                    task_name: ti.task.task_name,
                    old_start_date: ti.old_start_date,
                    old_end_date: ti.old_end_date,
                    new_start_date: ti.new_start_date,
                    new_end_date: ti.new_end_date,
                    shift_mode: ti.shift_mode,
                  })),
                },
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        // 5. Execute Atomic Batch Transaction
        const groupId = `ovg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const batchStatements: any[] = [];

        // Insert Override Group
        batchStatements.push(
          db.prepare(
            `INSERT INTO calendar_override_groups (
              id, worker_id, override_type, start_date, end_date, label_ko, label_vi, note, status, created_by_name, updated_by_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
          ).bind(groupId, targetWorker.id, override_type, start_date, end_date, label_ko, label_vi, note, editor, editor)
        );

        // Insert Date-specific Overrides
        const startD = new Date(`${start_date}T00:00:00`);
        const endD = new Date(`${end_date}T00:00:00`);

        for (let cur = new Date(startD); cur <= endD; cur.setDate(cur.getDate() + 1)) {
          const dateStr = cur.toISOString().slice(0, 10);
          const id = `ovr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          batchStatements.push(
            db.prepare(
              `INSERT INTO calendar_overrides (
                id, scope_type, scope_key, work_date, override_type, override_group_id, label_ko, label_vi, note, created_by_name, updated_by_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(id, scope_type, scope_key, dateStr, override_type, groupId, label_ko, label_vi, note, editor, editor)
          );
        }

        // If Schedule Shift confirmed: execute task & status updates and log history
        if (
          override_type === 'LEAVE' &&
          impact.working_leave_days > 0 &&
          impact.affected_task_count > 0 &&
          body.confirm_leave_schedule_cascade === true &&
          body.save_leave_without_schedule_shift !== true
        ) {
          const eventId = `lse_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const restoreToken = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

          // Insert Event Log
          batchStatements.push(
            db.prepare(
              `INSERT INTO leave_schedule_shift_events (
                id, override_group_id, worker_id, leave_start_date, leave_end_date, working_leave_days,
                affected_project_count, affected_task_count, shifted_future_status_count, event_status, restore_token, changed_by_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
            ).bind(
              eventId, groupId, targetWorker.id, start_date, end_date, impact.working_leave_days,
              impact.affected_project_count, impact.affected_task_count, impact.shifted_future_status_count, restoreToken, editor
            )
          );

          // Update Tasks & Insert Task Logs
          for (const ti of impact.task_impacts) {
            const nextRev = (ti.task.schedule_revision || 0) + 1;
            batchStatements.push(
              db.prepare(
                `UPDATE tasks SET
                  start_date = ?, end_date = ?, schedule_revision = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`
              ).bind(ti.new_start_date, ti.new_end_date, nextRev, editor, ti.task.id)
            );

            const taskLogId = `ltl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            batchStatements.push(
              db.prepare(
                `INSERT INTO leave_schedule_shift_task_logs (
                  id, event_id, project_id, task_id, old_start_date, old_end_date, new_start_date, new_end_date,
                  shift_mode, task_revision_after_shift, restore_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESTORABLE')`
              ).bind(
                taskLogId, eventId, ti.task.project_id, ti.task.id,
                ti.old_start_date, ti.old_end_date, ti.new_start_date, ti.new_end_date,
                ti.shift_mode, nextRev
              )
            );
          }

          // Shift Future Daily Statuses & Preserve Metadata (id, status, updated_by_name, created_at, updated_at)
          for (const si of impact.status_impacts) {
            batchStatements.push(
              db.prepare(`DELETE FROM daily_status WHERE id = ?`).bind(si.daily_status_id)
            );

            batchStatements.push(
              db.prepare(
                `INSERT INTO daily_status (id, task_id, work_date, status, updated_by_name, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
              ).bind(
                si.daily_status_id, si.task_id, si.new_work_date, si.status,
                si.original_updated_by_name || editor, si.original_updated_at || new Date().toISOString()
              )
            );

            const statusLogId = `lsl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            batchStatements.push(
              db.prepare(
                `INSERT INTO leave_schedule_shift_status_logs (
                  id, event_id, daily_status_id, task_id, old_work_date, new_work_date, status,
                  original_updated_by_name, original_created_at, original_updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                statusLogId, eventId, si.daily_status_id, si.task_id,
                si.old_work_date, si.new_work_date, si.status,
                si.original_updated_by_name, si.original_created_at, si.original_updated_at
              )
            );
          }
        }

        await db.batch(batchStatements);

        return jsonResponse({
          id: groupId,
          worker_id: targetWorker.id,
          override_type,
          start_date,
          end_date,
          working_leave_days: impact.working_leave_days,
          affected_task_count: impact.affected_task_count,
        }, 201);
      }

      // 15. DELETE /api/calendar/override-groups/:groupId
      const delGroupMatch = path.match(/^\/api\/calendar\/override-groups\/([^/]+)$/);
      if (method === 'DELETE' && delGroupMatch) {
        const groupId = delGroupMatch[1];
        const editor = getEditorName(null, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const group = await db.prepare(`SELECT * FROM calendar_override_groups WHERE id = ?`).bind(groupId).first();
        if (!group) {
          return errorResponse('휴가 항목을 찾을 수 없습니다.', 404);
        }

        if (group.worker_id !== editCheck.worker!.id && group.worker_id !== editCheck.worker!.name) {
          return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
        }

        // Soft delete group & delete date overrides
        await db.batch([
          db.prepare(`UPDATE calendar_override_groups SET status = 'DELETED', deleted_by_name = ?, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(editor, groupId),
          db.prepare(`DELETE FROM calendar_overrides WHERE override_group_id = ?`).bind(groupId),
        ]);

        // Check if active shift event exists
        const event = await db.prepare(`SELECT * FROM leave_schedule_shift_events WHERE override_group_id = ?`).bind(groupId).first();

        if (!event || event.working_leave_days === 0 || event.affected_task_count === 0) {
          return jsonResponse({
            deleted_group_id: groupId,
            restore_available: false,
            working_leave_days: 0,
            affected_project_count: 0,
            affected_task_count: 0,
            restorable_task_count: 0,
            conflict_task_count: 0,
            task_preview: [],
          });
        }

        // Generate Restore Token & Set event_status = 'LEAVE_DELETED_PENDING_DECISION'
        const restoreToken = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.prepare(
          `UPDATE leave_schedule_shift_events
           SET event_status = 'LEAVE_DELETED_PENDING_DECISION', restore_token = ?, leave_deleted_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(restoreToken, event.id).run();

        // Fetch task logs and evaluate restore readiness
        const taskLogsRes = await db.prepare(
          `SELECT ltl.*, t.task_name, t.start_date as current_start_date, t.end_date as current_end_date, t.schedule_revision, t.progress, p.name as project_name, p.status as project_status, p.end_date as project_end_date
           FROM leave_schedule_shift_task_logs ltl
           JOIN tasks t ON ltl.task_id = t.id
           JOIN projects p ON ltl.project_id = p.id
           WHERE ltl.event_id = ?`
        ).bind(event.id).all();

        const taskLogs: any[] = taskLogsRes.results || [];
        let restorableCount = 0;
        let conflictCount = 0;

        const previews: any[] = [];
        for (const tl of taskLogs) {
          let restoreStatus = 'RESTORABLE';
          let conflictReason: string | undefined = undefined;

          if (tl.progress === 100) {
            restoreStatus = 'COMPLETED';
            conflictReason = '완료된 작업';
            conflictCount++;
          } else if (tl.project_status === 'COMPLETED') {
            restoreStatus = 'PROJECT_COMPLETED';
            conflictReason = '완료된 프로젝트';
            conflictCount++;
          } else if (tl.schedule_revision !== tl.task_revision_after_shift || tl.current_start_date !== tl.new_start_date || tl.current_end_date !== tl.new_end_date) {
            restoreStatus = 'MANUAL_CHANGED';
            conflictReason = '휴가 등록 후 작업 일정이 수동 수정됨';
            conflictCount++;
          } else if (tl.old_end_date > tl.project_end_date) {
            restoreStatus = 'CONFLICT';
            conflictReason = '복원 후 프로젝트 기간 초과';
            conflictCount++;
          } else {
            restorableCount++;
          }

          previews.push({
            ...tl,
            restore_status: restoreStatus,
            conflict_reason: conflictReason,
          });
        }

        return jsonResponse({
          deleted_group_id: groupId,
          restore_available: true,
          working_leave_days: event.working_leave_days,
          affected_project_count: event.affected_project_count,
          affected_task_count: event.affected_task_count,
          restorable_task_count: restorableCount,
          conflict_task_count: conflictCount,
          restore_token: restoreToken,
          task_preview: previews,
        });
      }

      // 16. POST /api/calendar/override-groups/:groupId/keep-schedule
      const keepScheduleMatch = path.match(/^\/api\/calendar\/override-groups\/([^/]+)\/keep-schedule$/);
      if (method === 'POST' && keepScheduleMatch) {
        const groupId = keepScheduleMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const event = await db.prepare(`SELECT * FROM leave_schedule_shift_events WHERE override_group_id = ?`).bind(groupId).first();
        if (!event) {
          return errorResponse('휴가 이벤트를 찾을 수 없습니다.', 404);
        }

        await db.prepare(
          `UPDATE leave_schedule_shift_events SET event_status = 'LEAVE_DELETED_SCHEDULE_KEPT', restore_token = NULL WHERE id = ?`
        ).bind(event.id).run();

        return jsonResponse({
          success: true,
          message: '휴가 기록만 삭제되었습니다. 변경된 작업 일정은 유지됩니다.',
        });
      }

      // 17. POST /api/calendar/override-groups/:groupId/restore-schedule
      const restoreScheduleMatch = path.match(/^\/api\/calendar\/override-groups\/([^/]+)\/restore-schedule$/);
      if (method === 'POST' && restoreScheduleMatch) {
        const groupId = restoreScheduleMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const restoreToken = body.restore_token;
        if (!restoreToken) {
          return errorResponse('복원 토큰이 필요합니다.', 400);
        }

        const event = await db
          .prepare(`SELECT * FROM leave_schedule_shift_events WHERE override_group_id = ? AND restore_token = ?`)
          .bind(groupId, restoreToken)
          .first();

        if (!event) {
          return errorResponse('유효하지 않거나 이미 처리된 복원 요청입니다.', 409, 'RESTORE_TOKEN_INVALID');
        }

        // Fetch task logs
        const taskLogsRes = await db
          .prepare(
            `SELECT ltl.*, t.schedule_revision, t.start_date as current_start_date, t.end_date as current_end_date, t.progress, p.status as project_status, p.end_date as project_end_date
             FROM leave_schedule_shift_task_logs ltl
             JOIN tasks t ON ltl.task_id = t.id
             JOIN projects p ON ltl.project_id = p.id
             WHERE ltl.event_id = ?`
          )
          .bind(event.id)
          .all();

        const taskLogs: any[] = taskLogsRes.results || [];
        const statusLogsRes = await db.prepare(`SELECT * FROM leave_schedule_shift_status_logs WHERE event_id = ?`).bind(event.id).all();
        const statusLogs: any[] = statusLogsRes.results || [];

        // Check for conflicts
        for (const tl of taskLogs) {
          if (tl.progress === 100 || tl.project_status === 'COMPLETED') continue;
          if (tl.schedule_revision !== tl.task_revision_after_shift || tl.current_start_date !== tl.new_start_date || tl.current_end_date !== tl.new_end_date) {
            return errorResponse('일부 작업은 휴가 등록 이후 일정이 수정되어 자동으로 앞당길 수 없습니다.', 409, 'LEAVE_RESTORE_MANUAL_CHANGED');
          }
          if (tl.old_end_date > tl.project_end_date) {
            return errorResponse('복원 후 일부 작업이 프로젝트 종료일을 초과합니다.', 409, 'LEAVE_RESTORE_OUTSIDE_PROJECT_RANGE');
          }
        }

        // Atomic Schedule Restore
        const batchStatements: any[] = [];

        for (const tl of taskLogs) {
          const nextRev = (tl.schedule_revision || 0) + 1;
          batchStatements.push(
            db.prepare(
              `UPDATE tasks SET
                start_date = ?, end_date = ?, schedule_revision = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            ).bind(tl.old_start_date, tl.old_end_date, nextRev, editor, tl.task_id)
          );

          batchStatements.push(
            db.prepare(`UPDATE leave_schedule_shift_task_logs SET restore_status = 'RESTORED' WHERE id = ?`).bind(tl.id)
          );
        }

        for (const sl of statusLogs) {
          batchStatements.push(
            db.prepare(`DELETE FROM daily_status WHERE id = ?`).bind(sl.daily_status_id)
          );

          batchStatements.push(
            db.prepare(
              `INSERT INTO daily_status (id, task_id, work_date, status, updated_by_name, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
              sl.daily_status_id, sl.task_id, sl.old_work_date, sl.status,
              sl.original_updated_by_name || editor, sl.original_updated_at || new Date().toISOString()
            )
          );
        }

        batchStatements.push(
          db.prepare(
            `UPDATE leave_schedule_shift_events
             SET event_status = 'RESTORED', restored_at = CURRENT_TIMESTAMP, restore_token = NULL
             WHERE id = ?`
          ).bind(event.id)
        );

        await db.batch(batchStatements);

        return jsonResponse({
          restored_task_count: taskLogs.length,
          restored_status_count: statusLogs.length,
          working_leave_days: event.working_leave_days,
        });
      }

      // 18. DELETE /api/calendar/overrides/:id (Legacy Override Fallback)
      const delOverrideMatch = path.match(/^\/api\/calendar\/overrides\/([^/]+)$/);
      if (method === 'DELETE' && delOverrideMatch) {
        const ovrId = delOverrideMatch[1];
        const editor = request.headers.get('x-editor-name');
        const editCheck = await requireEditableWorker(db, editor ? decodeURIComponent(editor) : '');
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        // Check if override belongs to current worker
        const ovr = await db.prepare(`SELECT * FROM calendar_overrides WHERE id = ?`).bind(ovrId).first();
        if (ovr && ovr.scope_type === 'WORKER') {
          const editorWorker = editCheck.worker!;
          if (ovr.scope_key !== editorWorker.id && ovr.scope_key !== editorWorker.name) {
            return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
          }
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const validated = taskSchema.parse({ ...body, editor_name: editor });

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(validated.project_id).first();
        if (project) {
          if (validated.start_date < project.start_date || validated.end_date > project.end_date || validated.start_date > validated.end_date) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Lịch công việc phải nằm trong thời gian của dự án.' : '작업 일정은 프로젝트 기간 안에서만 설정할 수 있습니다.';
            return errorResponse(msg, 409, 'TASK_OUTSIDE_PROJECT_RANGE');
          }
        }

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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const validated = updateTaskSchema.parse({ ...body, editor_name: editor });

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(existing.project_id).first();
        if (project) {
          const targetStart = validated.start_date ?? existing.start_date;
          const targetEnd = validated.end_date ?? existing.end_date;
          if (targetStart < project.start_date || targetEnd > project.end_date || targetStart > targetEnd) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Lịch công việc phải nằm trong thời gian của dự án.' : '작업 일정은 프로젝트 기간 안에서만 설정할 수 있습니다.';
            return errorResponse(msg, 409, 'TASK_OUTSIDE_PROJECT_RANGE');
          }
        }

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

        const isDateChanged = (validated.start_date && validated.start_date !== existing.start_date) || (validated.end_date && validated.end_date !== existing.end_date);
        const nextRevision = isDateChanged ? (existing.schedule_revision || 0) + 1 : (existing.schedule_revision || 0);

        try {
          await db
            .prepare(
              `UPDATE tasks SET
                worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?,
                schedule_revision = ?, updated_by_name = ?,
                task_name_ko = ?, task_name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            )
            .bind(newWorker, newName, newStart, newEnd, newProgress, nextRevision, editor, task_name_ko, task_name_vi, source_lang, trans_status, trans_error, taskId)
            .run();
        } catch {
          await db
            .prepare(
              `UPDATE tasks SET
                worker_name = ?, task_name = ?, start_date = ?, end_date = ?, progress = ?,
                schedule_revision = ?,
                task_name_ko = ?, task_name_vi = ?, source_language = ?, translation_status = ?, translation_error = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            )
            .bind(newWorker, newName, newStart, newEnd, newProgress, nextRevision, task_name_ko, task_name_vi, source_lang, trans_status, trans_error, taskId)
            .run();
        }

        if (isDateChanged) {
          await db
            .prepare(
              `UPDATE leave_schedule_shift_task_logs
               SET restore_status = 'MANUAL_CHANGED', conflict_reason = '사용자가 작업 일정을 수동으로 수정함'
               WHERE task_id = ? AND restore_status = 'RESTORABLE'`
            )
            .bind(taskId)
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
          const editCheck = await requireEditableWorker(db, editor ? decodeURIComponent(editor) : '');
          if (!editCheck.allowed) {
            return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
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
