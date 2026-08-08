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
  getVietnamSaturdayCalendarServer,
  calculateVietnamSaturdayImpactServer,
  getManualHolidaysServer,
  calculateManualHolidayImpactServer,
  saveManualHolidaysMonthServer,
  fetchTaskAssigneesMapServer,
  backfillTaskAssigneesAndProgressModeServer,
  WorkerProfile,
} from './services/scheduleCalendar';
import {
  calculateTaskProgressServer,
  calculateProjectProgressServer,
  detectWorkerTaskConflictsServer,
  getTodayStrForWorkerServer,
} from './services/progressAndConflictServer';
import { detectCrossProjectWorkerConflictsServer } from './services/crossProjectConflictServer';
import {
  upsertProjectService,
  upsertTaskGroupService,
  upsertTaskService,
} from './services/domainServices';
import {
  authenticateIntegrationKey,
  generateIntegrationApiKey,
  checkAndEnforceRateLimit,
  logIntegrationApiRequest,
} from './services/integrationAuthServer';
import { OPENAPI_V1_SPEC } from './services/openapiSpec';
import { getTodayDashboardSummaryServer } from './services/todaySummaryService';
import { getProjectAllocations, updateProjectAllocations, getAllocationHistory, getProjectAllocationHistory } from './services/projectAllocationService';
import { completeProjectService } from './services/projectCompletionService';

export interface Env {
  DB: any;
  ASSETS?: any;
  AI?: any;
  KASI_HOLIDAY_API_KEY?: string;
  BUILD_SHA?: string;
  ENVIRONMENT_NAME?: string;
  DEPLOYED_AT?: string;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

function errorResponse(message: string, status = 400, code?: string, details?: any) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { message, code: code || 'BAD_REQUEST', ...(details ? { details } : {}) },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
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
  return null;
}

async function fetchCalendarBatchData(db: any) {
  const [workersRes, holidaysRes, overridesRes] = await Promise.all([
    db.prepare(`SELECT * FROM workers WHERE is_active = 1`).all(),
    db.prepare(`SELECT * FROM country_holidays`).all(),
    db.prepare(`SELECT * FROM calendar_overrides`).all(),
  ]);
  return {
    workers: workersRes.results || [],
    holidays: holidaysRes.results || [],
    overrides: overridesRes.results || [],
  };
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

  if (!ai) {
    return {
      name_ko: nameText,
      name_vi: nameText,
      source_language,
      translation_status: 'COMPLETED',
      translation_error: null,
    };
  }

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
    const cleanPath = path.replace(/\/$/, '') || '/';
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
      // 0. GET /api/version
      if (method === 'GET' && (cleanPath === '/api/version' || path === '/api/version')) {
        const isQa = url.hostname.includes('-qa') || url.hostname.includes('qa-') || url.searchParams.get('env') === 'qa';
        return jsonResponse({
          commit: env.BUILD_SHA || 'unknown',
          environment: env.ENVIRONMENT_NAME || (isQa ? 'qa' : 'production'),
          deployed_at: env.DEPLOYED_AT || new Date().toISOString(),
        });
      }

      // 0.01 GET /api/health/completion-integrity
      if (method === 'GET' && (cleanPath === '/api/health/completion-integrity' || path.startsWith('/api/health/completion-integrity'))) {
        const { results: completedProjects } = await db
          .prepare("SELECT id, name, name_ko, status FROM projects WHERE status = 'COMPLETED'")
          .all();

        const prjList = (completedProjects || []) as any[];
        const prjIds = prjList.map((p) => p.id);

        let inconsistentProjectsCount = 0;
        let inconsistentTasksCount = 0;
        const details: any[] = [];

        if (prjIds.length > 0) {
          const placeholders = prjIds.map(() => '?').join(',');
          const { results: tasks } = await db
            .prepare(`SELECT id, task_name, project_id, progress, completion_confirmed FROM tasks WHERE project_id IN (${placeholders})`)
            .bind(...prjIds)
            .all();

          const taskList = (tasks || []) as any[];
          const tasksByPrj = new Map<string, any[]>();
          for (const t of taskList) {
            if (!tasksByPrj.has(t.project_id)) tasksByPrj.set(t.project_id, []);
            tasksByPrj.get(t.project_id)!.push(t);
          }

          for (const prj of prjList) {
            const pTasks = tasksByPrj.get(prj.id) || [];
            const badTasks = pTasks.filter(
              (t) => Number(t.completion_confirmed) !== 1 || Number(t.progress) < 100
            );

            if (badTasks.length > 0) {
              inconsistentProjectsCount++;
              inconsistentTasksCount += badTasks.length;
              details.push({
                project_id: prj.id,
                project_name: prj.name_ko || prj.name,
                inconsistent_task_count: badTasks.length,
                inconsistent_tasks: badTasks.map((t) => ({
                  task_id: t.id,
                  task_name: t.task_name,
                  progress: t.progress,
                  completion_confirmed: t.completion_confirmed,
                })),
              });
            }
          }
        }

        return jsonResponse({
          completed_projects: prjList.length,
          inconsistent_projects: inconsistentProjectsCount,
          inconsistent_tasks: inconsistentTasksCount,
          details,
        });
      }

      // 0.02 GET /api/health/scheduler-integrity
      if (method === 'GET' && (cleanPath === '/api/health/scheduler-integrity' || path.startsWith('/api/health/scheduler-integrity'))) {
        // 1. Completion Domain
        let compPrjList: any[] = [];
        try {
          const { results } = await db.prepare("SELECT id FROM projects WHERE status = 'COMPLETED'").all();
          compPrjList = results || [];
        } catch {}

        const compPrjIds = compPrjList.map((p) => p.id);
        let inconsistentProjectsCount = 0;

        if (compPrjIds.length > 0) {
          const placeholders = compPrjIds.map(() => '?').join(',');
          try {
            const { results: tasksInComp } = await db
              .prepare(`SELECT project_id, progress, completion_confirmed FROM tasks WHERE project_id IN (${placeholders})`)
              .bind(...compPrjIds)
              .all();

            const tasksByPrj = new Map<string, any[]>();
            for (const t of (tasksInComp || []) as any[]) {
              if (!tasksByPrj.has(t.project_id)) tasksByPrj.set(t.project_id, []);
              tasksByPrj.get(t.project_id)!.push(t);
            }
            for (const prjId of compPrjIds) {
              const pTasks = tasksByPrj.get(prjId) || [];
              const hasBad = pTasks.some((t) => Number(t.completion_confirmed) !== 1 || Number(t.progress) < 100);
              if (hasBad) inconsistentProjectsCount++;
            }
          } catch {}
        }

        // 2. Tasks Domain
        let missingPicCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT t.id 
            FROM tasks t 
            LEFT JOIN task_assignees ta ON t.id = ta.task_id AND ta.assignment_role = 'PRIMARY'
            WHERE t.schedule_status = 'SCHEDULED' 
              AND (t.primary_worker_id IS NULL OR t.primary_worker_id = '') 
              AND ta.worker_id IS NULL
          `).all();
          missingPicCount = (results || []).length;
        } catch {}

        let invalidAssigneeCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT ta.id 
            FROM task_assignees ta 
            LEFT JOIN workers w ON ta.worker_id = w.id 
            LEFT JOIN tasks t ON ta.task_id = t.id 
            WHERE w.id IS NULL OR t.id IS NULL
          `).all();
          invalidAssigneeCount = (results || []).length;
        } catch {}

        let outsideRangeCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT t.id 
            FROM tasks t 
            JOIN projects p ON t.project_id = p.id 
            WHERE (t.start_date IS NOT NULL AND p.start_date IS NOT NULL AND t.start_date < p.start_date)
               OR (t.end_date IS NOT NULL AND p.end_date IS NOT NULL AND t.end_date > p.end_date)
          `).all();
          outsideRangeCount = (results || []).length;
        } catch {}

        // 3. Workforce Domain
        let invalidAllocCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT a.id 
            FROM project_worker_allocations a 
            LEFT JOIN projects p ON a.project_id = p.id 
            LEFT JOIN workers w ON a.worker_id = w.id 
            WHERE p.id IS NULL OR w.id IS NULL OR a.allocation_percent < 0 OR a.allocation_percent > 100
          `).all();
          invalidAllocCount = (results || []).length;
        } catch {}

        let historyOrphanCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT h.id 
            FROM project_worker_allocation_history h 
            LEFT JOIN projects p ON h.project_id = p.id 
            LEFT JOIN workers w ON h.worker_id = w.id 
            WHERE p.id IS NULL OR w.id IS NULL
          `).all();
          historyOrphanCount = (results || []).length;
        } catch {}

        // 4. Calendar Domain
        let invalidCalendarCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT o.id 
            FROM country_holidays_overrides o 
            LEFT JOIN workers w ON o.worker_id = w.id 
            WHERE o.worker_id IS NOT NULL AND w.id IS NULL
          `).all();
          invalidCalendarCount = (results || []).length;
        } catch {}

        // 5. Integration Domain
        let orphanIntegrationCount = 0;
        try {
          const { results } = await db.prepare(`
            SELECT l.id 
            FROM integration_api_key_usage_logs l 
            LEFT JOIN integration_api_keys k ON l.api_key_id = k.id 
            WHERE k.id IS NULL
          `).all();
          orphanIntegrationCount = (results || []).length;
        } catch {}

        // 6. Project Lifecycle Domain
        let activeScheduleCompletedCount = 0;
        let completedMissingTimestampCount = 0;
        try {
          const { results: activePrjs } = await db.prepare("SELECT id FROM projects WHERE status = 'ACTIVE'").all();
          const activeList = (activePrjs || []) as any[];
          if (activeList.length > 0) {
            const activeIds = activeList.map((p) => p.id);
            const placeholders = activeIds.map(() => '?').join(',');
            const { results: activeTasks } = await db
              .prepare(`SELECT project_id, progress, completion_confirmed FROM tasks WHERE project_id IN (${placeholders})`)
              .bind(...activeIds)
              .all();

            const tasksByPrj = new Map<string, any[]>();
            for (const t of (activeTasks || []) as any[]) {
              if (!tasksByPrj.has(t.project_id)) tasksByPrj.set(t.project_id, []);
              tasksByPrj.get(t.project_id)!.push(t);
            }

            for (const prjId of activeIds) {
              const pTasks = tasksByPrj.get(prjId) || [];
              if (pTasks.length > 0) {
                const allDone = pTasks.every((t) => Number(t.completion_confirmed) === 1 && Number(t.progress) >= 100);
                if (allDone) activeScheduleCompletedCount++;
              }
            }
          }
        } catch {}

        try {
          const nullRes = await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'COMPLETED' AND completed_at IS NULL").first();
          completedMissingTimestampCount = Number(nullRes?.count || 0);
        } catch {}

        return jsonResponse({
          completion: {
            status: inconsistentProjectsCount === 0 ? 'PASS' : 'FAIL',
            inconsistent_projects: inconsistentProjectsCount,
          },
          project_lifecycle: {
            active_schedule_completed: activeScheduleCompletedCount,
            completed_missing_completed_at: completedMissingTimestampCount,
          },
          tasks: {
            missing_pic: missingPicCount,
            invalid_assignee_relation: invalidAssigneeCount,
            outside_project_range: outsideRangeCount,
          },
          workforce: {
            invalid_allocation: invalidAllocCount,
            history_orphan: historyOrphanCount,
          },
          calendar: {
            invalid_worker_profile: invalidCalendarCount,
          },
          integration: {
            orphan_entity_links: orphanIntegrationCount,
          },
          build: {
            status: 'PASS',
          },
        });
      }

      // 0.05 GET /api/dashboard/today-summary
      if (method === 'GET' && path === '/api/dashboard/today-summary') {
        const targetDate = url.searchParams.get('date') || getTodayStrForWorkerServer(null);
        const summary = await getTodayDashboardSummaryServer(db, targetDate);
        return jsonResponse(summary);
      }

      // 0.1 GET /api/projects/:id/shift-logs
      const getShiftLogsMatch = path.match(/^\/api\/projects\/([^/]+)\/shift-logs$/);
      if (method === 'GET' && getShiftLogsMatch) {
        const prjId = getShiftLogsMatch[1];
        const projectLogsRes = await db
          .prepare(`SELECT * FROM project_schedule_shift_logs WHERE project_id = ? ORDER BY created_at DESC`)
          .bind(prjId)
          .all();
        const leaveLogsRes = await db
          .prepare(`SELECT lsl.*, t.task_name, p.name as project_name FROM leave_schedule_shift_task_logs lsl JOIN tasks t ON lsl.task_id = t.id JOIN projects p ON lsl.project_id = p.id WHERE lsl.project_id = ? ORDER BY lsl.created_at DESC`)
          .bind(prjId)
          .all();
        return jsonResponse({
          project_shift_logs: projectLogsRes.results || [],
          leave_shift_logs: leaveLogsRes.results || [],
        });
      }

      // 1. GET /api/workers
      if (method === 'GET' && path === '/api/workers') {
        const workers = await db
          .prepare(`SELECT id, name, is_active, sort_order, country_code, workweek_profile, access_role, ui_language, can_manage_country_calendar, can_manage_integrations FROM workers WHERE is_active = 1 ORDER BY sort_order ASC`)
          .all();
        return jsonResponse(workers.results || []);
      }

async function requireActiveCalendarEditor(
  db: any,
  request: Request,
  body?: any
): Promise<{ allowed: boolean; editorId?: string; editorName?: string; errorMsg?: string; errorCode?: string; status?: number }> {
  const rawHeaderId = request.headers.get('x-editor-id') || request.headers.get('x-worker-id') || '';
  const rawHeaderName = request.headers.get('x-editor-name') || request.headers.get('x-worker-name') || '';

  let editorHeaderId = rawHeaderId;
  let editorHeaderName = rawHeaderName;
  try {
    if (rawHeaderName) editorHeaderName = decodeURIComponent(rawHeaderName);
  } catch (e) {}

  const bodyId = body?.editor_id || body?.created_by_id || body?.updated_by_id || body?.worker_id || '';
  let bodyName = body?.editor_name || body?.created_by_name || body?.updated_by_name || body?.worker_name || '';
  try {
    if (bodyName) bodyName = decodeURIComponent(bodyName);
  } catch (e) {}

  let worker = null;

  if (editorHeaderId) {
    worker = await db.prepare(`SELECT id, name, is_active, access_role FROM workers WHERE id = ?`).bind(editorHeaderId).first();
  }
  if (!worker && bodyId) {
    worker = await db.prepare(`SELECT id, name, is_active, access_role FROM workers WHERE id = ?`).bind(bodyId).first();
  }
  if (!worker && editorHeaderName) {
    worker = await db.prepare(`SELECT id, name, is_active, access_role FROM workers WHERE name = ?`).bind(editorHeaderName).first();
  }
  if (!worker && bodyName) {
    worker = await db.prepare(`SELECT id, name, is_active, access_role FROM workers WHERE name = ?`).bind(bodyName).first();
  }

  if (!worker) {
    return {
      allowed: false,
      status: 400,
      errorCode: 'ACTIVE_WORKER_REQUIRED',
      errorMsg: '현재 접속자를 확인할 수 없습니다.',
    };
  }

  if (Number(worker.is_active) !== 1) {
    return {
      allowed: false,
      status: 403,
      errorCode: 'INACTIVE_WORKER',
      errorMsg: '비활성 작업자는 일정을 변경할 수 없습니다.',
    };
  }

  if (worker.access_role !== 'EDITOR') {
    return {
      allowed: false,
      status: 403,
      errorCode: 'EXECUTIVE_READ_ONLY',
      errorMsg: '경영진 계정은 국가 달력을 조회할 수만 있습니다.',
    };
  }

  return {
    allowed: true,
    editorId: worker.id,
    editorName: worker.name,
  };
}

async function validateAndNormalizeTaskAssigneesServer(
  db: any,
  body: any
): Promise<{
  valid: boolean;
  errorCode?: string;
  errorMsg?: string;
  primaryWorkerId?: string;
  primaryWorkerName?: string;
  assignees?: Array<{ worker_id: string; name: string; country_code: string; assignment_role: 'PRIMARY' | 'CO_ASSIGNEE'; allocation_percent: number; sort_order: number }>;
  progressMode?: 'AUTO_TIME' | 'STATUS_BASED';
  availabilityPolicy?: 'ANY_AVAILABLE' | 'ALL_REQUIRED';
}> {
  const workersRes = await db.prepare(`SELECT id, name, is_active, access_role, country_code FROM workers`).all();
  const allWorkers: any[] = workersRes.results || [];
  const workerMap = new Map<string, any>();
  allWorkers.forEach((w) => {
    workerMap.set(w.id, w);
    workerMap.set(w.name, w);
  });

  let rawAssigneeIds: string[] = body.assignee_ids || [];
  if (rawAssigneeIds.length === 0 && body.worker_name) {
    const w = workerMap.get(body.worker_name);
    if (w) rawAssigneeIds = [w.id];
  }
  if (rawAssigneeIds.length === 0 && body.primary_worker_id) {
    const w = workerMap.get(body.primary_worker_id);
    if (w) rawAssigneeIds = [w.id];
  }

  if (rawAssigneeIds.length === 0) {
    return { valid: false, errorCode: 'WORKER_REQUIRED', errorMsg: '최소 한 명 이상의 작업자를 배정해야 합니다.' };
  }

  const uniqueIds = Array.from(new Set(rawAssigneeIds));
  if (uniqueIds.length !== rawAssigneeIds.length) {
    return { valid: false, errorCode: 'DUPLICATE_ASSIGNEE', errorMsg: '중복된 작업자가 포함되어 있습니다.' };
  }

  let primaryId = body.primary_worker_id;
  if (!primaryId) {
    const pObj = workerMap.get(body.worker_name) || workerMap.get(uniqueIds[0]);
    primaryId = pObj ? pObj.id : uniqueIds[0];
  } else {
    const pObj = workerMap.get(primaryId);
    if (pObj) primaryId = pObj.id;
  }

  if (!uniqueIds.includes(primaryId)) {
    uniqueIds.unshift(primaryId);
  }

  const validatedAssignees: any[] = [];
  const rawAllocations: any[] = body.assignee_allocations || [];

  const defaultAlloc = Math.floor(100 / uniqueIds.length);
  const remainder = 100 - (defaultAlloc * uniqueIds.length);

  for (let idx = 0; idx < uniqueIds.length; idx++) {
    const wid = uniqueIds[idx];
    const wObj = workerMap.get(wid);
    if (!wObj) {
      return { valid: false, errorCode: 'WORKER_PROFILE_NOT_FOUND', errorMsg: '작업자 프로필을 찾을 수 없습니다.' };
    }

    if (Number(wObj.is_active) !== 1) {
      return { valid: false, errorCode: 'INACTIVE_WORKER', errorMsg: `비활성 작업자(${wObj.name})는 배정할 수 없습니다.` };
    }

    if (wObj.access_role !== 'EDITOR' || wObj.name === 'CEO' || wObj.name === 'COO') {
      return { valid: false, errorCode: 'EXECUTIVE_ASSIGNMENT_FORBIDDEN', errorMsg: `경영진 및 보기 전용 계정(${wObj.name})은 작업자로 배정할 수 없습니다.` };
    }

    const allocInput = rawAllocations.find((a: any) => a.worker_id === wid || a.worker_id === wObj.name);
    let allocPercent = allocInput && !isNaN(Number(allocInput.allocation_percent)) ? Number(allocInput.allocation_percent) : (defaultAlloc + (idx === 0 ? remainder : 0));

    if (allocPercent < 1 || allocPercent > 100) {
      return { valid: false, errorCode: 'INVALID_ALLOCATION_PERCENT', errorMsg: '작업 비중은 1%에서 100% 사이여야 합니다.' };
    }

    const isPrimary = wid === primaryId;
    validatedAssignees.push({
      worker_id: wObj.id,
      name: wObj.name,
      country_code: wObj.country_code,
      assignment_role: isPrimary ? 'PRIMARY' : 'CO_ASSIGNEE',
      allocation_percent: allocPercent,
      sort_order: idx,
    });
  }

  const totalAlloc = validatedAssignees.reduce((sum, a) => sum + a.allocation_percent, 0);
  if (totalAlloc !== 100) {
    return { valid: false, errorCode: 'ALLOCATION_TOTAL_INVALID', errorMsg: '담당 비중 합계는 100%여야 합니다.' };
  }

  const primaryObj = validatedAssignees.find((a) => a.assignment_role === 'PRIMARY') || validatedAssignees[0];

  return {
    valid: true,
    primaryWorkerId: primaryObj.worker_id,
    primaryWorkerName: primaryObj.name,
    assignees: validatedAssignees,
    progressMode: body.progress_mode === 'STATUS_BASED' ? 'STATUS_BASED' : 'AUTO_TIME',
    availabilityPolicy: body.availability_policy === 'ALL_REQUIRED' ? 'ALL_REQUIRED' : 'ANY_AVAILABLE',
  };
}

      // ==========================================
      // INTEGRATION REST API V1 (/api/integrations/v1/*)
      // ==========================================

      if (path.startsWith('/api/integrations/v1')) {
        const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

        if (path === '/api/integrations/v1/health') {
          return jsonResponse({
            status: 'ok',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/integrations/v1/openapi.json') {
          return jsonResponse(OPENAPI_V1_SPEC);
        }

        let requiredScope = 'tasks:write';
        if (method === 'GET') requiredScope = 'projects:read';
        if (method === 'DELETE') requiredScope = 'tasks:delete';

        const auth = await authenticateIntegrationKey(db, request, requiredScope);
        if (!auth.allowed) {
          await logIntegrationApiRequest(db, reqId, 'none', method, path, 401, undefined, undefined, undefined, undefined, auth.errorCode, clientIp);
          return errorResponse(auth.errorMessage!, 401, auth.errorCode!);
        }

        const apiKey = auth.apiKey!;

        const rateCheck = await checkAndEnforceRateLimit(db, apiKey.id, 120);
        if (!rateCheck.allowed) {
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 429, undefined, undefined, undefined, undefined, 'RATE_LIMIT_EXCEEDED', clientIp);
          return errorResponse('Rate limit exceeded (Max 120 requests/minute).', 429, 'RATE_LIMIT_EXCEEDED');
        }

        if (method === 'GET' && path === '/api/integrations/v1/workers') {
          const res = await db.prepare(`SELECT id, name, is_active, sort_order, country_code, workweek_profile, access_role FROM workers WHERE is_active = 1 ORDER BY sort_order ASC`).all();
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, undefined, undefined, undefined, undefined, undefined, clientIp);
          return jsonResponse(res.results || []);
        }

        if (method === 'GET' && path === '/api/integrations/v1/projects') {
          const res = await db.prepare(`SELECT * FROM projects ORDER BY start_date DESC`).all();
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, undefined, undefined, undefined, undefined, undefined, clientIp);
          return jsonResponse(res.results || []);
        }

        const prjMatch = path.match(/^\/api\/integrations\/v1\/projects\/([^/]+)$/);
        if (method === 'GET' && prjMatch) {
          const pId = prjMatch[1];
          const prj = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(pId).first();
          if (!prj) {
            await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 404, undefined, undefined, 'PROJECT', pId, 'PROJECT_NOT_FOUND', clientIp);
            return errorResponse('Project not found.', 404, 'PROJECT_NOT_FOUND');
          }
          const tasks = await db.prepare(`SELECT * FROM tasks WHERE project_id = ?`).bind(pId).all();
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, undefined, undefined, 'PROJECT', pId, undefined, clientIp);
          return jsonResponse({ project: prj, tasks: tasks.results || [] });
        }

        if (method === 'GET' && path === '/api/integrations/v1/entity-links') {
          const src = url.searchParams.get('source');
          const type = url.searchParams.get('entity_type');
          let q = `SELECT * FROM integration_entity_links WHERE 1=1`;
          const params: any[] = [];
          if (src) { q += ` AND source = ?`; params.push(src); }
          if (type) { q += ` AND entity_type = ?`; params.push(type); }
          q += ` ORDER BY created_at DESC LIMIT 200`;
          const stmt = db.prepare(q);
          const bound = params.length > 0 ? stmt.bind(...params) : stmt;
          const res = await bound.all();
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, undefined, undefined, undefined, undefined, undefined, clientIp);
          return jsonResponse(res.results || []);
        }

        if (method === 'POST' && path === '/api/integrations/v1/projects/upsert') {
          const body: any = await request.json().catch(() => ({}));
          if (!body.name || !body.start_date || !body.end_date) {
            await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 400, body.source, body.external_id, 'PROJECT', undefined, 'MISSING_REQUIRED_FIELDS', clientIp);
            return errorResponse('name, start_date, and end_date are required.', 400, 'MISSING_REQUIRED_FIELDS');
          }
          const result = await upsertProjectService(db, env, apiKey.id, body, `api:${apiKey.name}`);
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, body.source, body.external_id, 'PROJECT', result.project.id, undefined, clientIp);
          return jsonResponse(result);
        }

        if (method === 'POST' && path === '/api/integrations/v1/task-groups/upsert') {
          const body: any = await request.json().catch(() => ({}));
          if (!body.group_name) {
            await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 400, body.source, body.external_id, 'TASK_GROUP', undefined, 'MISSING_REQUIRED_FIELDS', clientIp);
            return errorResponse('group_name is required.', 400, 'MISSING_REQUIRED_FIELDS');
          }
          const result = await upsertTaskGroupService(db, env, apiKey.id, body, `api:${apiKey.name}`);
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, body.source, body.external_id, 'TASK_GROUP', result.group.id, undefined, clientIp);
          return jsonResponse(result);
        }

        if (method === 'POST' && path === '/api/integrations/v1/tasks/upsert') {
          const body: any = await request.json().catch(() => ({}));
          if (!body.task_name) {
            await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 400, body.source, body.external_id, 'TASK', undefined, 'MISSING_REQUIRED_FIELDS', clientIp);
            return errorResponse('task_name is required.', 400, 'MISSING_REQUIRED_FIELDS');
          }
          const result = await upsertTaskService(db, env, apiKey.id, body, `api:${apiKey.name}`);
          const status = result.conflict_warning ? 409 : 200;
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, status, body.source, body.external_id, 'TASK', result.task.id, result.conflict_warning?.code, clientIp);
          return jsonResponse(result, status);
        }

        if (method === 'POST' && path === '/api/integrations/v1/tasks/batch-upsert') {
          const body: any = await request.json().catch(() => ({}));
          const items: any[] = body.tasks || body.items || [];
          if (!Array.isArray(items) || items.length === 0) {
            return errorResponse('tasks array is required and must contain at least 1 task.', 400, 'EMPTY_BATCH');
          }
          if (items.length > 100) {
            return errorResponse('Batch size exceeds maximum limit of 100 tasks per request.', 400, 'BATCH_LIMIT_EXCEEDED');
          }

          const isDryRun = url.searchParams.get('dry_run') === 'true' || Boolean(body.dry_run);
          const syncRunId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const startTime = new Date().toISOString();

          if (isDryRun) {
            let wouldCreate = 0;
            let wouldUpdate = 0;
            let wouldSkip = 0;
            const changes: any[] = [];
            const warnings: string[] = [];

            for (const item of items) {
              const extId = item.external_id || item.id;
              const link = extId ? await db.prepare(`SELECT internal_id FROM integration_entity_links WHERE external_id = ? AND entity_type = 'TASK'`).bind(extId).first() : null;
              const existingTask = link ? await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(link.internal_id).first() : null;

              if (existingTask) {
                wouldUpdate++;
                changes.push({
                  external_id: extId,
                  action: 'UPDATE',
                  task_name: item.task_name || existingTask.task_name,
                  before: { start_date: existingTask.start_date, end_date: existingTask.end_date },
                  after: { start_date: item.start_date || existingTask.start_date, end_date: item.end_date || existingTask.end_date },
                });
              } else {
                wouldCreate++;
                changes.push({
                  external_id: extId,
                  action: 'CREATE',
                  task_name: item.task_name,
                  start_date: item.start_date,
                  end_date: item.end_date,
                });
              }
            }

            try {
              await db.prepare(
                `INSERT INTO integration_sync_runs (id, run_id, source, started_at, finished_at, dry_run, created_count, updated_count, failed_count, request_id, summary_json)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?, ?, 0, ?, ?)`
              ).bind(`isr_${syncRunId}`, syncRunId, items[0]?.source || 'CLI_INTEGRATION', startTime, wouldCreate, wouldUpdate, reqId, JSON.stringify({ would_create: wouldCreate, would_update: wouldUpdate, would_skip: wouldSkip })).run();
            } catch (e) {}

            await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, items[0]?.source, undefined, 'TASK_BATCH_DRY_RUN', undefined, undefined, clientIp);

            return jsonResponse({
              dry_run: true,
              run_id: syncRunId,
              total_processed: items.length,
              would_create: wouldCreate,
              would_update: wouldUpdate,
              would_skip: wouldSkip,
              changes,
              warnings,
            });
          }

          // Execution Mode (isDryRun = false)
          const results: any[] = [];
          let createdCount = 0;
          let updatedCount = 0;
          let failedCount = 0;

          for (const item of items) {
            try {
              const res = await upsertTaskService(db, env, apiKey.id, item, `api:${apiKey.name}`);
              if (res.created) createdCount++;
              else updatedCount++;
              results.push({ success: true, ...res });
            } catch (err: any) {
              failedCount++;
              results.push({ success: false, external_id: item.external_id, error: err.message });
            }
          }

          try {
            await db.prepare(
              `INSERT INTO integration_sync_runs (id, run_id, source, started_at, finished_at, dry_run, created_count, updated_count, failed_count, request_id, summary_json)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?, ?, ?, ?, ?)`
            ).bind(`isr_${syncRunId}`, syncRunId, items[0]?.source || 'CLI_INTEGRATION', startTime, createdCount, updatedCount, failedCount, reqId, JSON.stringify({ created: createdCount, updated: updatedCount, failed: failedCount })).run();
          } catch (e) {}

          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, items[0]?.source, undefined, 'TASK_BATCH', undefined, undefined, clientIp);
          return jsonResponse({ run_id: syncRunId, total_processed: items.length, created_count: createdCount, updated_count: updatedCount, failed_count: failedCount, results });
        }

        const taskMatch = path.match(/^\/api\/integrations\/v1\/tasks\/([^/]+)$/);
        if ((method === 'PATCH' || method === 'PUT') && taskMatch) {
          const tId = taskMatch[1];
          const body: any = await request.json().catch(() => ({}));
          body.internal_id = tId;
          const result = await upsertTaskService(db, env, apiKey.id, body, `api:${apiKey.name}`);
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, body.source, body.external_id, 'TASK', tId, undefined, clientIp);
          return jsonResponse(result);
        }

        if (method === 'DELETE' && taskMatch) {
          const tId = taskMatch[1];
          await db.prepare(`DELETE FROM tasks WHERE id = ?`).bind(tId).run();
          await db.prepare(`DELETE FROM integration_entity_links WHERE internal_id = ?`).bind(tId).run();
          await logIntegrationApiRequest(db, reqId, apiKey.id, method, path, 200, undefined, undefined, 'TASK', tId, undefined, clientIp);
          return jsonResponse({ deleted: true, id: tId });
        }

        return errorResponse('Integration route not found.', 404, 'NOT_FOUND');
      }

      // ==========================================
      // INTEGRATION MANAGEMENT API FOR ADMIN UI (/api/admin/integration-keys/*)
      // ==========================================

      if (path.startsWith('/api/admin/integration-keys') || path.startsWith('/api/admin/integration-logs')) {
        const editor = getEditorName(null, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const currentWorker = editCheck.worker!;
        if (Number(currentWorker.can_manage_integrations) !== 1) {
          return errorResponse('Integration key management requires can_manage_integrations permission.', 403, 'INTEGRATION_MANAGEMENT_FORBIDDEN');
        }

        if (method === 'GET' && path === '/api/admin/integration-keys') {
          const res = await db.prepare(`SELECT id, name, key_prefix, scopes_json, is_active, expires_at, last_used_at, created_by_id, created_by_name, created_at, revoked_at FROM integration_api_keys ORDER BY created_at DESC`).all();
          return jsonResponse(res.results || []);
        }

        if (method === 'POST' && path === '/api/admin/integration-keys') {
          const body: any = await request.json().catch(() => ({}));
          if (!body.name) return errorResponse('Key name is required.', 400);
          const scopes = body.scopes || ['tasks:write', 'projects:read'];
          const expiresInDays = body.expires_in_days ? Number(body.expires_in_days) : undefined;
          const result = await generateIntegrationApiKey(db, body.name, scopes, currentWorker.id, currentWorker.name, expiresInDays);
          return jsonResponse({
            key: result.record,
            raw_token_once: result.raw_secret_once,
          });
        }

        const revokeMatch = path.match(/^\/api\/admin\/integration-keys\/([^/]+)$/);
        if (method === 'DELETE' && revokeMatch) {
          const keyId = revokeMatch[1];
          await db.prepare(`UPDATE integration_api_keys SET is_active = 0, revoked_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(keyId).run();
          return jsonResponse({ revoked: true, id: keyId });
        }

        if (method === 'GET' && path === '/api/admin/integration-logs') {
          const res = await db.prepare(`SELECT * FROM integration_api_logs ORDER BY created_at DESC LIMIT 100`).all();
          return jsonResponse(res.results || []);
        }
      }

      // 0.9 POST /api/admin/backfill-assignees
      if ((method === 'POST' || method === 'GET') && path === '/api/admin/backfill-assignees') {
        const report = await backfillTaskAssigneesAndProgressModeServer(db);
        return jsonResponse(report);
      }

      // 1.0 POST /api/calendar/holidays/sync -> 410 Disabled
      if (method === 'POST' && path === '/api/calendar/holidays/sync') {
        return errorResponse(
          '자동 공휴일 동기화가 중단되었습니다. 월별 공휴일 관리에서 직접 지정하세요.',
          410,
          'AUTO_HOLIDAY_SYNC_DISABLED'
        );
      }

      // 1.01 GET /api/calendar/manual-holidays
      if (method === 'GET' && path === '/api/calendar/manual-holidays') {
        const country = (url.searchParams.get('country') || 'KR') as 'KR' | 'VN';
        const now = new Date();
        const year = Number(url.searchParams.get('year') || now.getFullYear());
        const month = Number(url.searchParams.get('month') || now.getMonth() + 1);

        const holidays = await getManualHolidaysServer(db, country, year, month);
        return jsonResponse(holidays);
      }

      // 1.02 POST /api/calendar/manual-holidays/impact
      if (method === 'POST' && path === '/api/calendar/manual-holidays/impact') {
        const body: any = await request.json();
        const country = (body.country_code || 'KR') as 'KR' | 'VN';
        const year = Number(body.year);
        const month = Number(body.month);
        const holidays = body.holidays || [];

        const impact = await calculateManualHolidayImpactServer(db, country, year, month, holidays);
        return jsonResponse(impact);
      }

      // 1.03 PUT /api/calendar/manual-holidays/month
      if (method === 'PUT' && path === '/api/calendar/manual-holidays/month') {
        const body: any = await request.json();
        const permCheck = await requireActiveCalendarEditor(db, request, body);
        if (!permCheck.allowed) {
          return errorResponse(permCheck.errorMsg!, permCheck.status || 403, permCheck.errorCode!);
        }

        const country = (body.country_code || 'KR') as 'KR' | 'VN';
        const year = Number(body.year);
        const month = Number(body.month);
        const holidays = body.holidays || [];
        const restoreShiftedTasks = body.restore_shifted_tasks === true;

        try {
          const result = await saveManualHolidaysMonthServer(
            db,
            country,
            year,
            month,
            holidays,
            permCheck.editorId,
            permCheck.editorName,
            restoreShiftedTasks
          );
          return jsonResponse(result);
        } catch (e: any) {
          return errorResponse(e.message || 'Save failed', e.status || 500, e.code || 'MANUAL_HOLIDAY_ERROR', e.details);
        }
      }

      // 1.1 GET /api/calendar/vietnam-saturdays
      if (method === 'GET' && path === '/api/calendar/vietnam-saturdays') {
        const now = new Date();
        const year = Number(url.searchParams.get('year') || now.getFullYear());
        const month = Number(url.searchParams.get('month') || now.getMonth() + 1);
        const data = await getVietnamSaturdayCalendarServer(db, year, month);
        return jsonResponse(data);
      }

      // 1.2 POST /api/calendar/vietnam-saturdays/impact
      if (method === 'POST' && path === '/api/calendar/vietnam-saturdays/impact') {
        const body: any = await request.json();
        const year = Number(body.year);
        const month = Number(body.month);
        const targetScope = body.target_scope || 'ALL_VN';
        const saturdays = body.saturdays || [];
        const targetWorkerIds = body.target_worker_ids || [];

        const impact = await calculateVietnamSaturdayImpactServer(db, year, month, targetScope, saturdays, targetWorkerIds);
        return jsonResponse(impact);
      }

      // 1.3 PUT /api/calendar/vietnam-saturdays
      if (method === 'PUT' && path === '/api/calendar/vietnam-saturdays') {
        const body: any = await request.json();
        const permCheck = await requireActiveCalendarEditor(db, request, body);
        if (!permCheck.allowed) {
          return errorResponse(permCheck.errorMsg!, permCheck.status || 403, permCheck.errorCode!);
        }
        const editor = permCheck.editorName;

        const year = Number(body.year);
        const month = Number(body.month);
        const targetScope = body.target_scope || 'ALL_VN';
        const saturdays: Array<{ date: string; status: 'WORK' | 'OFF' }> = body.saturdays || [];
        const shiftSchedule = body.shift_schedule === true;
        const targetWorkerIds: string[] = body.target_worker_ids || [];

        // Save overrides atomically
        for (const sat of saturdays) {
          if (sat.status === 'OFF') {
            await db
              .prepare(
                `INSERT INTO calendar_overrides (
                  id, scope_type, scope_key, work_date, override_type, label_ko, label_vi, created_by_name, updated_by_name
                ) VALUES (?, 'COUNTRY', 'VN', ?, 'OFF', '베트남 토요일 정기 휴무', 'Nghỉ thứ Bảy định kỳ VN', ?, ?)
                ON CONFLICT(scope_type, scope_key, work_date) DO UPDATE SET
                  override_type = 'OFF',
                  updated_by_name = excluded.updated_by_name,
                  updated_at = CURRENT_TIMESTAMP`
              )
              .bind(`ovr_vn_sat_${sat.date}`, sat.date, editor, editor)
              .run();
          } else if (sat.status === 'WORK') {
            await db
              .prepare(`DELETE FROM calendar_overrides WHERE scope_type = 'COUNTRY' AND scope_key = 'VN' AND work_date = ? AND override_type = 'OFF'`)
              .bind(sat.date)
              .run();
          }
        }

        // Calculate impact if schedule shift is requested
        let impactData: any = null;
        if (shiftSchedule) {
          impactData = await calculateVietnamSaturdayImpactServer(db, year, month, targetScope, saturdays, targetWorkerIds);
        }

        // Insert batch event record
        const batchId = `vn_sat_batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db
          .prepare(
            `INSERT INTO country_calendar_batch_events (
              id, country_code, year, month, event_type, selected_dates_json,
              affected_worker_count, affected_project_count, affected_task_count,
              changed_by_name, status
            ) VALUES (?, 'VN', ?, ?, 'VN_SATURDAY_OFF_BATCH', ?, ?, ?, ?, ?, 'ACTIVE')`
          )
          .bind(
            batchId,
            year,
            month,
            JSON.stringify(saturdays),
            impactData?.affected_worker_count || 0,
            impactData?.affected_project_count || 0,
            impactData?.affected_task_count || 0,
            editor
          )
          .run();

        // Perform task schedule shift if requested
        if (shiftSchedule && impactData && impactData.worker_impacts) {
          for (const wImpact of impactData.worker_impacts) {
            for (const tImp of wImpact.task_impacts) {
              await db
                .prepare(`UPDATE tasks SET start_date = ?, end_date = ?, schedule_revision = schedule_revision + 1, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .bind(tImp.new_start_date, tImp.new_end_date, editor, tImp.task.id)
                .run();
            }
          }
        }

        return jsonResponse({
          batch_id: batchId,
          year,
          month,
          saturdays,
          affected: impactData,
        });
      }

      // 2. GET /api/projects
      if (method === 'GET' && path === '/api/projects') {
        const statusFilter = url.searchParams.get('status') || 'ACTIVE';
        const yearFilter = url.searchParams.get('year');

        let query = '';
        let params: any[] = [];

        if (statusFilter === 'ALL') {
          query = `
            SELECT p.*, COUNT(t.id) as task_count
            FROM projects p
            LEFT JOIN tasks t ON p.id = t.project_id
            GROUP BY p.id
            ORDER BY
              CASE WHEN p.status = 'ACTIVE' THEN 0 ELSE 1 END,
              CASE WHEN p.status = 'ACTIVE' THEN p.start_date END DESC,
              CASE WHEN p.status = 'COMPLETED' THEN COALESCE(p.completed_at, p.end_date) END DESC,
              p.created_at DESC
          `;
        } else {
          query = `
            SELECT p.*, COUNT(t.id) as task_count
            FROM projects p
            LEFT JOIN tasks t ON p.id = t.project_id
            WHERE p.status = ?
          `;
          params = [statusFilter];

          if (statusFilter === 'COMPLETED' && yearFilter) {
            query += ` AND (strftime('%Y', p.completed_at) = ? OR strftime('%Y', p.end_date) = ?)`;
            params.push(yearFilter, yearFilter);
          }

          query += ` GROUP BY p.id ORDER BY p.start_date DESC, p.created_at DESC`;
        }

        const stmt = db.prepare(query);
        const bound = params.length === 0 ? stmt : (params.length === 1 ? stmt.bind(params[0]) : stmt.bind(...params));
        const result = await bound.all();

        const calendarBatch = await fetchCalendarBatchData(db);
        const [allActiveProjectsRes, allActiveTasksRes, allDailyStatusesRes, ackRes] = await Promise.all([
          db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
          db.prepare(`SELECT * FROM tasks`).all(),
          db.prepare(`SELECT task_id, work_date, status FROM daily_status`).all(),
          db.prepare(`SELECT * FROM conflict_acknowledgements`).all().catch(() => ({ results: [] })),
        ]);

        const allActiveProjects = allActiveProjectsRes.results || [];
        const allActiveTasks = allActiveTasksRes.results || [];
        const ackRecords = ackRes.results || [];

        const dailyStatusMap: Record<string, Record<string, string>> = {};
        (allDailyStatusesRes.results || []).forEach((st: any) => {
          if (!dailyStatusMap[st.task_id]) dailyStatusMap[st.task_id] = {};
          dailyStatusMap[st.task_id][st.work_date] = st.status;
        });

        const projects = (result.results || []).map((prj: any) => {
          const projectTasks = allActiveTasks.filter((t: any) => t.project_id === prj.id);
          const participating = Array.from(new Set(projectTasks.map((t: any) => t.worker_name)));

          const progressMetrics = calculateProjectProgressServer(
            prj,
            projectTasks,
            calendarBatch.workers,
            calendarBatch.holidays,
            calendarBatch.overrides,
            dailyStatusMap
          );

          let conflict_count = 0;
          if (prj.status === 'ACTIVE') {
            const conflictData = detectCrossProjectWorkerConflictsServer(
              allActiveProjects,
              allActiveTasks,
              calendarBatch.workers,
              calendarBatch.holidays,
              calendarBatch.overrides,
              prj.id,
              ackRecords
            );
            conflict_count = conflictData.unacknowledged_conflict_count;
          }

          return {
            ...prj,
            ...progressMetrics,
            conflict_count,
            participating_workers: participating,
          };
        });

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

        // Create project and initial default task group atomically
        const transResult = await translateProjectOrTaskName(env.AI, validated.name);
        const defaultGroupId = `tgrp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.batch([
          db.prepare(
            `INSERT INTO projects (
              id, name, start_date, end_date, progress, status,
              name_ko, name_vi, source_language, translation_status, translation_error
            ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`
          ).bind(
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
          ),
          db.prepare(
            `INSERT INTO task_groups (
              id, project_id, group_name, group_name_ko, group_name_vi,
              source_language, translation_status, color_key, sort_order, created_by_name
            ) VALUES (?, ?, '기존 작업', '기존 작업', 'Công việc hiện có', 'ko', 'COMPLETED', 'BLUE', 1, ?)`
          ).bind(defaultGroupId, id, editor)
        ]);

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

        let taskGroupsRes = await db
          .prepare(`SELECT * FROM task_groups WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`)
          .bind(projectId)
          .all();
        let taskGroups: any[] = taskGroupsRes.results || [];

        // Fallback: If no task groups exist for this project, create a default group
        if (taskGroups.length === 0) {
          const defaultGroupId = `tgrp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await db
            .prepare(
              `INSERT INTO task_groups (
                id, project_id, group_name, group_name_ko, group_name_vi,
                source_language, translation_status, color_key, sort_order, created_by_name
              ) VALUES (?, ?, '기존 작업', '기존 작업', 'Công việc hiện có', 'ko', 'COMPLETED', 'BLUE', 1, 'system_fallback')`
            )
            .bind(defaultGroupId, projectId)
            .run();

          await db
            .prepare(`UPDATE tasks SET task_group_id = ? WHERE project_id = ? AND task_group_id IS NULL`)
            .bind(defaultGroupId, projectId)
            .run();

          taskGroupsRes = await db
            .prepare(`SELECT * FROM task_groups WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`)
            .bind(projectId)
            .all();
          taskGroups = taskGroupsRes.results || [];
        }

        const calendarBatch = await fetchCalendarBatchData(db);
        const [allActiveProjectsRes, allActiveTasksRes, tasksRes] = await Promise.all([
          db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
          db.prepare(`SELECT * FROM tasks`).all(),
          db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY task_sort_order ASC, start_date ASC, created_at ASC`).bind(projectId).all(),
        ]);

        const allActiveProjects = allActiveProjectsRes.results || [];
        const allActiveTasks = allActiveTasksRes.results || [];

        const rawTasks = tasksRes.results || [];
        const dailyStatusMap: Record<string, Record<string, string>> = {};

        await Promise.all(
          rawTasks.map(async (t: any) => {
            const statusRes = await db
              .prepare(`SELECT work_date, status, updated_by_name, updated_at FROM daily_status WHERE task_id = ?`)
              .bind(t.id)
              .all();

            const daily_statuses: Record<string, string> = {};

            (statusRes.results || []).forEach((st: any) => {
              daily_statuses[st.work_date] = st.status;
            });

            dailyStatusMap[t.id] = daily_statuses;
          })
        );

        const rawTaskIds = rawTasks.map((t: any) => t.id);
        const taskAssigneesMap = await fetchTaskAssigneesMapServer(db, rawTaskIds);

        const defaultGroupId = taskGroups[0]?.id || null;

        const formattedTasks = await Promise.all(
          rawTasks.map(async (t: any) => {
            const daily_statuses = dailyStatusMap[t.id] || {};
            const assignees = taskAssigneesMap[t.id] || (t.worker_name ? [{ worker_id: t.worker_name, name: t.worker_name, assignment_role: 'PRIMARY', allocation_percent: 100 }] : []);
            const tWithAssignees = {
              ...t,
              task_group_id: t.task_group_id || defaultGroupId,
              assignees,
              assignee_ids: assignees.map((a: any) => a.worker_id),
              primary_worker_id: t.primary_worker_id || (assignees.find((a: any) => a.assignment_role === 'PRIMARY')?.worker_id || assignees[0]?.worker_id),
              progress_mode: t.progress_mode || 'AUTO_TIME',
              availability_policy: t.availability_policy || 'ANY_AVAILABLE',
            };

            const progressMetrics = calculateTaskProgressServer(
              tWithAssignees,
              calendarBatch.workers,
              calendarBatch.holidays,
              calendarBatch.overrides,
              project.status,
              daily_statuses
            );

            const conflicts = detectWorkerTaskConflictsServer(
              tWithAssignees,
              allActiveProjects,
              allActiveTasks,
              calendarBatch.workers,
              calendarBatch.holidays,
              calendarBatch.overrides
            );

            return {
              ...tWithAssignees,
              ...progressMetrics,
              has_schedule_conflict: conflicts.length > 0,
              schedule_conflicts: conflicts,
              daily_statuses,
            };
          })
        );

        const projectMetrics = calculateProjectProgressServer(
          project,
          formattedTasks,
          calendarBatch.workers,
          calendarBatch.holidays,
          calendarBatch.overrides,
          dailyStatusMap
        );

        let total_conflicts = 0;
        formattedTasks.forEach((t: any) => {
          if (t.schedule_conflicts && t.schedule_conflicts.length > 0) {
            total_conflicts += t.schedule_conflicts.length;
          }
        });

        const participating = Array.from(new Set(formattedTasks.map((t: any) => t.worker_name)));

        return jsonResponse({
          project: {
            ...project,
            ...projectMetrics,
            conflict_count: total_conflicts,
            participating_workers: participating,
          },
          tasks: formattedTasks,
          task_groups: taskGroups,
        });
      }

      // 4.1 POST /api/projects/:projectId/task-groups (공정 대분류 생성)
      const postTaskGroupMatch = path.match(/^\/api\/projects\/([^/]+)\/task-groups$/);
      if (method === 'POST' && postTaskGroupMatch) {
        const projectId = postTaskGroupMatch[1];
        if (await isProjectCompleted(db, projectId)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const groupName = (body.group_name || body.name || '').trim();
        if (!groupName) {
          return errorResponse('공정 대분류 이름은 필수입니다.', 400);
        }

        // Get max sort_order
        const maxSortRes = await db
          .prepare(`SELECT MAX(sort_order) as max_sort FROM task_groups WHERE project_id = ? AND deleted_at IS NULL`)
          .bind(projectId)
          .first();
        const nextSortOrder = (maxSortRes?.max_sort || 0) + 1;

        const transResult = await translateProjectOrTaskName(env.AI, groupName);

        const groupNameKo = body.group_name_ko || transResult.name_ko;
        const groupNameVi = body.group_name_vi || transResult.name_vi;
        const sourceLang = body.source_language || transResult.source_language;
        const colorKey = ['BLUE', 'GREEN', 'ORANGE', 'VIOLET', 'SLATE'].includes(body.color_key) ? body.color_key : 'BLUE';

        const id = `tgrp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        await db
          .prepare(
            `INSERT INTO task_groups (
              id, project_id, group_name, group_name_ko, group_name_vi,
              source_language, translation_status, color_key, sort_order,
              created_by_name, updated_by_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            projectId,
            groupName,
            groupNameKo,
            groupNameVi,
            sourceLang,
            body.translation_status || transResult.translation_status,
            colorKey,
            nextSortOrder,
            editor,
            editor
          )
          .run();

        const created = await db.prepare(`SELECT * FROM task_groups WHERE id = ?`).bind(id).first();
        return jsonResponse(created, 201);
      }

      // 4.2 PATCH /api/task-groups/:id (공정 대분류 수정)
      const patchTaskGroupMatch = path.match(/^\/api\/task-groups\/([^/]+)$/);
      if (method === 'PATCH' && patchTaskGroupMatch) {
        const groupId = patchTaskGroupMatch[1];
        const existing: any = await db.prepare(`SELECT * FROM task_groups WHERE id = ? AND deleted_at IS NULL`).bind(groupId).first();
        if (!existing) {
          return errorResponse('공정 대분류를 찾을 수 없습니다.', 404);
        }

        if (await isProjectCompleted(db, existing.project_id)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        let groupName = existing.group_name;
        let groupNameKo = existing.group_name_ko;
        let groupNameVi = existing.group_name_vi;
        let sourceLang = existing.source_language;
        let transStatus = existing.translation_status;

        if (body.group_name !== undefined || body.name !== undefined) {
          const newName = (body.group_name || body.name || '').trim();
          if (newName && newName !== existing.group_name) {
            groupName = newName;
            const transResult = await translateProjectOrTaskName(env.AI, groupName);
            groupNameKo = transResult.name_ko;
            groupNameVi = transResult.name_vi;
            sourceLang = transResult.source_language;
            transStatus = transResult.translation_status;
          }
        }

        if (body.group_name_ko !== undefined) groupNameKo = body.group_name_ko;
        if (body.group_name_vi !== undefined) groupNameVi = body.group_name_vi;
        if (body.translation_status !== undefined) transStatus = body.translation_status;

        const colorKey = body.color_key && ['BLUE', 'GREEN', 'ORANGE', 'VIOLET', 'SLATE'].includes(body.color_key) ? body.color_key : existing.color_key;
        const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) : existing.sort_order;

        await db
          .prepare(
            `UPDATE task_groups SET
              group_name = ?, group_name_ko = ?, group_name_vi = ?,
              source_language = ?, translation_status = ?, color_key = ?, sort_order = ?,
              updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          )
          .bind(groupName, groupNameKo, groupNameVi, sourceLang, transStatus, colorKey, sortOrder, editor, groupId)
          .run();

        const updated = await db.prepare(`SELECT * FROM task_groups WHERE id = ?`).bind(groupId).first();
        return jsonResponse(updated);
      }

      // 4.3 DELETE /api/task-groups/:id (공정 대분류 삭제)
      const delTaskGroupMatch = path.match(/^\/api\/task-groups\/([^/]+)$/);
      if (method === 'DELETE' && delTaskGroupMatch) {
        const groupId = delTaskGroupMatch[1];
        const existing: any = await db.prepare(`SELECT * FROM task_groups WHERE id = ? AND deleted_at IS NULL`).bind(groupId).first();
        if (!existing) {
          return errorResponse('공정 대분류를 찾을 수 없습니다.', 404);
        }

        if (await isProjectCompleted(db, existing.project_id)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const editor = request.headers.get('x-editor-name');
        const editCheck = await requireEditableWorker(db, editor ? decodeURIComponent(editor) : '');
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const taskCountRes = await db
          .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE task_group_id = ?`)
          .bind(groupId)
          .first();
        const taskCount = Number(taskCountRes?.cnt || 0);

        const moveToGroupId = url.searchParams.get('move_to_group_id');
        const deleteTasks = url.searchParams.get('delete_tasks') === 'true';

        if (taskCount > 0 && !moveToGroupId && !deleteTasks) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'TASK_GROUP_NOT_EMPTY',
                message: `이 공정에는 ${taskCount}개의 세부 작업이 있습니다.`,
                details: { task_count: taskCount, group_id: groupId },
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        const batch: any[] = [];
        if (taskCount > 0) {
          if (moveToGroupId) {
            batch.push(
              db.prepare(`UPDATE tasks SET task_group_id = ? WHERE task_group_id = ?`).bind(moveToGroupId, groupId)
            );
          } else if (deleteTasks) {
            const taskIdsRes = await db.prepare(`SELECT id FROM tasks WHERE task_group_id = ?`).bind(groupId).all();
            for (const t of taskIdsRes.results || []) {
              batch.push(db.prepare(`DELETE FROM daily_status WHERE task_id = ?`).bind(t.id));
              batch.push(db.prepare(`DELETE FROM task_assignees WHERE task_id = ?`).bind(t.id));
            }
            batch.push(db.prepare(`DELETE FROM tasks WHERE task_group_id = ?`).bind(groupId));
          }
        }

        batch.push(
          db.prepare(`UPDATE task_groups SET deleted_at = CURRENT_TIMESTAMP, updated_by_name = ? WHERE id = ?`).bind(editCheck.worker!.name, groupId)
        );

        await db.batch(batch);
        return jsonResponse({ id: groupId });
      }

      // 4.4 PATCH /api/projects/:projectId/task-structure-order (대분류 및 세부작업 순서/그룹 이동)
      const patchOrderMatch = path.match(/^\/api\/projects\/([^/]+)\/task-structure-order$/);
      if (method === 'PATCH' && patchOrderMatch) {
        const projectId = patchOrderMatch[1];
        if (await isProjectCompleted(db, projectId)) {
          return errorResponse('완료된 프로젝트는 읽기 전용입니다.', 403, 'PROJECT_COMPLETED_READ_ONLY');
        }

        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const groupsList: Array<{ group_id: string; sort_order: number; task_ids: string[] }> = body.groups || [];
        if (groupsList.length === 0) {
          return errorResponse('구조 변경 정보가 비어있습니다.', 400);
        }

        // Verify active groups exist for this project
        const groupIds = groupsList.map((g) => g.group_id);
        const activeGroupsRes = await db
          .prepare(`SELECT id, project_id FROM task_groups WHERE project_id = ? AND deleted_at IS NULL`)
          .bind(projectId)
          .all();
        const activeGroupIds = new Set((activeGroupsRes.results || []).map((g: any) => g.id));

        for (const gId of groupIds) {
          if (!activeGroupIds.has(gId)) {
            return errorResponse('삭제되었거나 존재하지 않는 공정 대분류입니다.', 409, 'TASK_GROUP_NOT_AVAILABLE');
          }
        }

        // Collect all task IDs and verify project_id consistency
        const allTaskIds: string[] = [];
        groupsList.forEach((grp) => {
          if (grp.task_ids && Array.isArray(grp.task_ids)) {
            allTaskIds.push(...grp.task_ids);
          }
        });

        // Check duplicate task_ids
        if (new Set(allTaskIds).size !== allTaskIds.length) {
          return errorResponse('요청에 중복된 세부 작업이 포함되어 있습니다.', 400, 'DUPLICATE_TASK_ID');
        }

        const batch: any[] = [];
        const nowIso = new Date().toISOString();

        groupsList.forEach((grp, gIdx) => {
          const gSortOrder = grp.sort_order !== undefined ? grp.sort_order : (gIdx + 1);
          batch.push(
            db.prepare(`UPDATE task_groups SET sort_order = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(gSortOrder, editor, grp.group_id, projectId)
          );

          if (grp.task_ids && Array.isArray(grp.task_ids)) {
            grp.task_ids.forEach((tId, tIdx) => {
              batch.push(
                db
                  .prepare(`UPDATE tasks SET task_group_id = ?, task_sort_order = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`)
                  .bind(grp.group_id, tIdx + 1, editor, tId, projectId)
              );
            });
          }
        });

        // Log structure change if details specified
        const movedTaskId = body.moved_task_id;
        const sourceGroupId = body.source_group_id;
        const targetGroupId = body.target_group_id;
        const targetIndex = body.target_index !== undefined ? Number(body.target_index) : undefined;
        let changeType = body.change_type || 'STRUCTURE_REORDERED';

        if (movedTaskId && sourceGroupId && targetGroupId) {
          changeType = sourceGroupId !== targetGroupId ? 'TASK_MOVED_BETWEEN_GROUPS' : 'TASK_REORDERED';
        } else if (!movedTaskId && body.group_reordered === true) {
          changeType = 'GROUP_REORDERED';
        }

        const logId = `tsl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        batch.push(
          db.prepare(
            `INSERT INTO task_structure_change_logs (
              id, project_id, task_id, change_type, source_group_id, target_group_id, new_sort_order, changed_by_id, changed_by_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(logId, projectId, movedTaskId || null, changeType, sourceGroupId || null, targetGroupId || null, targetIndex ?? null, editCheck.worker?.id || null, editor, nowIso)
        );

        if (batch.length > 0) {
          await db.batch(batch);
        }

        return jsonResponse({ success: true, project_id: projectId, change_type: changeType, log_id: logId });
      }

      // 4.9 GET /api/projects/:id/worker-allocations
      const getAllocsMatch = path.match(/^\/api\/projects\/([^/]+)\/worker-allocations$/);
      if (method === 'GET' && getAllocsMatch) {
        const projectId = getAllocsMatch[1];
        const allocs = await getProjectAllocations(db, projectId);
        return jsonResponse(allocs);
      }

      // 4.95 PUT /api/projects/:id/worker-allocations
      if (method === 'PUT' && getAllocsMatch) {
        const projectId = getAllocsMatch[1];
        const body: any = await request.json().catch(() => ({}));
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const allocList = Array.isArray(body?.allocations) ? body.allocations : [];
        try {
          const updated = await updateProjectAllocations(db, projectId, allocList, editCheck.worker, 'MANUAL');
          return jsonResponse(updated);
        } catch (err: any) {
          if (err.message === 'PROJECT_NOT_FOUND') {
            return errorResponse('프로젝트를 찾을 수 없습니다.', 404);
          }
          return errorResponse(err.message || 'Worker allocations update failed.', 500);
        }
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

      // 5.5 GET /api/projects/:id/conflicts
      const getConflictsMatch = path.match(/^\/api\/projects\/([^/]+)\/conflicts$/);
      if (method === 'GET' && getConflictsMatch) {
        const projectId = getConflictsMatch[1];
        const [allActiveProjectsRes, allActiveTasksRes, batch, ackRes] = await Promise.all([
          db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
          db.prepare(`SELECT * FROM tasks`).all(),
          fetchCalendarBatchData(db),
          db.prepare(`SELECT * FROM conflict_acknowledgements`).all().catch(() => ({ results: [] })),
        ]);

        const conflictData = detectCrossProjectWorkerConflictsServer(
          allActiveProjectsRes.results || [],
          allActiveTasksRes.results || [],
          batch.workers,
          batch.holidays,
          batch.overrides,
          projectId,
          ackRes.results || []
        );

        return jsonResponse(conflictData);
      }

      // 5.6 POST /api/projects/:id/conflicts/:fingerprint/acknowledge
      const ackMatch = path.match(/^\/api\/projects\/([^/]+)\/conflicts\/([^/]+)\/acknowledge$/);
      if (method === 'POST' && ackMatch) {
        const projectId = ackMatch[1];
        const fingerprint = decodeURIComponent(ackMatch[2]);
        const body: any = await request.json().catch(() => ({}));
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const id = `ack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const workerId = body.worker_id || '';
        const projectIdsJson = JSON.stringify(body.project_ids || []);
        const startDate = body.overlap_start_date || '2000-01-01';
        const endDate = body.overlap_end_date || '2099-12-31';

        await db.prepare(`
          INSERT INTO conflict_acknowledgements (id, conflict_fingerprint, policy_version, worker_id, project_ids_json, overlap_start_date, overlap_end_date, acknowledged_by_id, acknowledged_by_name)
          VALUES (?, ?, 'cross_project_v1', ?, ?, ?, ?, ?, ?)
          ON CONFLICT(conflict_fingerprint) DO UPDATE SET
            acknowledged_by_id = excluded.acknowledged_by_id,
            acknowledged_by_name = excluded.acknowledged_by_name,
            acknowledged_at = CURRENT_TIMESTAMP
        `).bind(id, fingerprint, workerId, projectIdsJson, startDate, endDate, editCheck.worker?.id || 'editor', editor).run();

        const [allActiveProjectsRes, allActiveTasksRes, batch, ackRes] = await Promise.all([
          db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
          db.prepare(`SELECT * FROM tasks`).all(),
          fetchCalendarBatchData(db),
          db.prepare(`SELECT * FROM conflict_acknowledgements`).all().catch(() => ({ results: [] })),
        ]);

        const conflictData = detectCrossProjectWorkerConflictsServer(
          allActiveProjectsRes.results || [],
          allActiveTasksRes.results || [],
          batch.workers,
          batch.holidays,
          batch.overrides,
          projectId,
          ackRes.results || []
        );

        return jsonResponse({
          acknowledged: true,
          fingerprint,
          remaining_conflict_count: conflictData.unacknowledged_conflict_count,
        });
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

        const isManual = body.translation_status === 'MANUAL' || (existing.translation_status === 'MANUAL' && !body.translation_status);
        const hasManualTarget =
          (body.name_ko !== undefined && body.name_ko.trim() !== '') ||
          (body.name_vi !== undefined && body.name_vi.trim() !== '');

        if (validated.name && validated.name !== existing.name && !isManual && !hasManualTarget) {
          const transResult = await translateProjectOrTaskName(env.AI, validated.name);
          name_ko = transResult.name_ko;
          name_vi = transResult.name_vi;
          source_lang = transResult.source_language;
          trans_status = transResult.translation_status;
          trans_error = transResult.translation_error;
        }

        if (body.name_ko !== undefined) name_ko = body.name_ko;
        if (body.name_vi !== undefined) name_vi = body.name_vi;
        if (body.source_language !== undefined) source_lang = body.source_language;
        if (body.translation_status !== undefined) trans_status = body.translation_status;

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
            for (const fSt of futureSts) {
              const nWorkDate = addPureCalendarDays(fSt.work_date, deltaDays);
              batchStatements.push(
                db.prepare(`UPDATE daily_status SET work_date = ? WHERE id = ?`).bind(nWorkDate, fSt.id)
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
        const body: any = await request.json().catch(() => ({}));
        const editorName = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editorName);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const mode = body.mode === 'STRICT' ? 'STRICT' : 'COMPLETE_ALL';
        const completedDate = body.completed_date || body.completedDate || undefined;
        const result = await completeProjectService(db, {
          projectId,
          mode,
          completedDate,
          editor: editCheck.worker ? { id: editCheck.worker.id, name: editCheck.worker.name } : { name: editorName },
        });

        if (!result.success) {
          return errorResponse(result.message!, result.status, result.code, result);
        }

        const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        return jsonResponse({
          ...result,
          project: updated,
        });
      }

      // 8-1. POST /api/projects/:id/completion-repair
      const repairMatch = path.match(/^\/api\/projects\/([^/]+)\/completion-repair$/);
      if (method === 'POST' && repairMatch) {
        const projectId = repairMatch[1];
        const body: any = await request.json().catch(() => ({}));
        const editorName = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editorName);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const result = await completeProjectService(db, {
          projectId,
          mode: 'REPAIR',
          editor: editCheck.worker ? { id: editCheck.worker.id, name: editCheck.worker.name } : { name: editorName },
        });

        if (!result.success) {
          return errorResponse(result.message!, result.status, result.code, result);
        }

        const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
        return jsonResponse({
          ...result,
          project: updated,
        });
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

      // 9-1. GET /api/workforce/allocation-history
      if (method === 'GET' && path === '/api/workforce/allocation-history') {
        const dateFrom = url.searchParams.get('date_from') || undefined;
        const dateTo = url.searchParams.get('date_to') || undefined;
        const workerId = url.searchParams.get('worker_id') || undefined;
        const projectId = url.searchParams.get('project_id') || undefined;
        const changedBy = url.searchParams.get('changed_by') || undefined;
        const changeType = url.searchParams.get('change_type') || undefined;
        const limitStr = url.searchParams.get('limit');
        const offsetStr = url.searchParams.get('offset');

        const history = await getAllocationHistory(db, {
          dateFrom,
          dateTo,
          workerId,
          projectId,
          changedBy,
          changeType,
          limit: limitStr ? parseInt(limitStr, 10) : undefined,
          offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
        });

        return jsonResponse(history);
      }

      // 9-2. GET /api/projects/:id/worker-allocation-history
      const prjHistMatch = path.match(/^\/api\/projects\/([^/]+)\/worker-allocation-history$/);
      if (method === 'GET' && prjHistMatch) {
        const projectId = prjHistMatch[1];
        const history = await getProjectAllocationHistory(db, projectId);
        return jsonResponse(history);
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

      // 11-1. POST /api/calendar/manual-holidays
      if (method === 'POST' && path === '/api/calendar/manual-holidays') {
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const editorWorker = editCheck.worker!;
        const targetCountry = (body.country_code || editorWorker.country_code || 'KR') as 'KR' | 'VN';

        if (editorWorker.country_code && editorWorker.country_code !== targetCountry) {
          return errorResponse('본인 국가의 공휴일만 수동으로 등록할 수 있습니다.', 403, 'HOLIDAY_COUNTRY_MISMATCH');
        }

        const holidayDate = body.holiday_date;
        const nameKo = (body.name_ko || '').trim();
        const nameVi = (body.name_vi || '').trim();

        if (!holidayDate || (!nameKo && !nameVi)) {
          return errorResponse('공휴일 날짜와 이름은 필수입니다.', 400);
        }

        const year = parseInt(holidayDate.substring(0, 4), 10);
        const id = `hol_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const nameLocal = targetCountry === 'VN' ? (nameVi || nameKo) : (nameKo || nameVi);

        await db
          .prepare(
            `INSERT INTO country_holidays (
              id, country_code, holiday_date, name_local, name_ko, name_vi, source, source_year, is_verified, created_by_name, updated_by_name
            ) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, 1, ?, ?)
            ON CONFLICT(country_code, holiday_date) DO UPDATE SET
              name_local = excluded.name_local,
              name_ko = excluded.name_ko,
              name_vi = excluded.name_vi,
              source = 'MANUAL',
              is_verified = 1,
              updated_by_name = excluded.updated_by_name,
              updated_at = CURRENT_TIMESTAMP`
          )
          .bind(id, targetCountry, holidayDate, nameLocal, nameKo, nameVi, year, editor, editor)
          .run();

        const created = await db.prepare(`SELECT * FROM country_holidays WHERE id = ?`).bind(id).first();
        return jsonResponse(created);
      }

      // 11-2. DELETE /api/calendar/manual-holidays/:id
      const manualHolDeleteMatch = path.match(/^\/api\/calendar\/manual-holidays\/([^/]+)$/);
      if (method === 'DELETE' && manualHolDeleteMatch) {
        const holidayId = manualHolDeleteMatch[1];
        const editor = getEditorName(null, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const editorWorker = editCheck.worker!;
        const existing = await db.prepare(`SELECT * FROM country_holidays WHERE id = ?`).bind(holidayId).first();
        if (!existing) {
          return errorResponse('해당 공휴일을 찾을 수 없습니다.', 404);
        }

        if (existing.source !== 'MANUAL' && existing.is_manual !== 1) {
          return errorResponse('자동 수집된 공휴일은 삭제할 수 없습니다.', 403, 'AUTO_HOLIDAY_DELETE_BLOCKED');
        }

        if (editorWorker.country_code && editorWorker.country_code !== existing.country_code) {
          return errorResponse('본인 국가의 공휴일만 삭제할 수 있습니다.', 403, 'HOLIDAY_COUNTRY_MISMATCH');
        }

        await db.prepare(`DELETE FROM country_holidays WHERE id = ?`).bind(holidayId).run();
        return jsonResponse({ id: holidayId });
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
          query += ` AND (scope_type = 'WORKER' AND (scope_key = ? OR scope_key = (SELECT name FROM workers WHERE id = ?)))`;
          params.push(workerId, workerId);
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
          e.working_leave_days, e.affected_project_count, e.affected_task_count, e.event_status
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

      // 14. GET /api/calendar/pending-schedule-decisions
      if (method === 'GET' && path === '/api/calendar/pending-schedule-decisions') {
        const editor = getEditorName(null, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const worker = editCheck.worker!;
        const eventsRes = await db
          .prepare(
            `SELECT e.*, g.start_date as leave_start_date, g.end_date as leave_end_date, g.label_ko, g.label_vi
             FROM leave_schedule_shift_events e
             JOIN calendar_override_groups g ON e.override_group_id = g.id
             WHERE (e.worker_id = ? OR e.worker_id = ?) AND e.event_status = 'LEAVE_DELETED_PENDING_DECISION'`
          )
          .bind(worker.id, worker.name)
          .all();

        const events: any[] = eventsRes.results || [];
        const pendingDecisions: any[] = [];

        for (const event of events) {
          const taskLogsRes = await db
            .prepare(
              `SELECT ltl.*, t.task_name, t.start_date as current_start_date, t.end_date as current_end_date, t.schedule_revision, t.progress, p.name as project_name, p.start_date as project_start_date, p.end_date as project_end_date, p.status as project_status
               FROM leave_schedule_shift_task_logs ltl
               JOIN tasks t ON ltl.task_id = t.id
               JOIN projects p ON ltl.project_id = p.id
               WHERE ltl.event_id = ?`
            )
            .bind(event.id)
            .all();

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
            } else if (tl.old_start_date < tl.project_start_date || tl.old_end_date > tl.project_end_date || tl.old_start_date > tl.old_end_date) {
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

          pendingDecisions.push({
            groupId: event.override_group_id,
            working_leave_days: event.working_leave_days,
            restore_token: event.restore_token,
            affected_project_count: event.affected_project_count,
            affected_task_count: event.affected_task_count,
            restorable_task_count: restorableCount,
            conflict_task_count: conflictCount,
            task_preview: previews,
          });
        }

        return jsonResponse(pendingDecisions);
      }

      // 15. POST /api/calendar/overrides
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
          if (override_type === 'OFF') {
            const isVi = editorWorker.ui_language === 'vi';
            const msg = isVi
              ? 'Lịch nghỉ cá nhân vui lòng đăng ký dưới dạng Nghỉ phép (LEAVE).'
              : '개인 비근무 일정은 개인 휴가(LEAVE)로 등록하세요.';
            return errorResponse(msg, 400, 'WORKER_MANUAL_OFF_DISABLED');
          }
        }

        const workerProfile = await db
          .prepare(`SELECT * FROM workers WHERE id = ? OR name = ?`)
          .bind(scope_key, scope_key)
          .first();
        if (!workerProfile) {
          return errorResponse('작업자 캘린더 정보를 확인할 수 없습니다.', 400, 'WORKER_PROFILE_NOT_FOUND');
        }
        const targetWorker: WorkerProfile = workerProfile;

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
        const impact = ((override_type === 'LEAVE' || override_type === 'OFF') && !isPastLeave)
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
                message: '휴가/휴무 반영 후 일부 작업이 프로젝트 종료일을 초과합니다.',
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
          (override_type === 'LEAVE' || override_type === 'OFF') &&
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
                message: '휴가/휴무로 변경되는 작업 일정을 확인해야 합니다.',
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
          (override_type === 'LEAVE' || override_type === 'OFF') &&
          impact.working_leave_days > 0 &&
          impact.affected_task_count > 0 &&
          body.confirm_leave_schedule_cascade === true &&
          body.save_leave_without_schedule_shift !== true
        ) {
          const eventId = `lse_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

          // Insert Event Log with restore_token = NULL initially (Section 3 requirement)
          batchStatements.push(
            db.prepare(
              `INSERT INTO leave_schedule_shift_events (
                id, override_group_id, worker_id, leave_start_date, leave_end_date, working_leave_days,
                affected_project_count, affected_task_count, shifted_future_status_count, event_status, restore_token, changed_by_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NULL, ?)`
            ).bind(
              eventId, groupId, targetWorker.id, start_date, end_date, impact.working_leave_days,
              impact.affected_project_count, impact.affected_task_count, impact.shifted_future_status_count, editor
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

            // Section 11: Multi-leave active log coordination
            // If previous active leave events exist for this worker, update their task log target dates
            const activeLogsRes = await db
              .prepare(
                `SELECT ltl.* FROM leave_schedule_shift_task_logs ltl
                 JOIN leave_schedule_shift_events lse ON ltl.event_id = lse.id
                 WHERE ltl.task_id = ? AND lse.event_status IN ('ACTIVE', 'LEAVE_DELETED_PENDING_DECISION')`
              )
              .bind(ti.task.id)
              .all();
            const activeLogs: any[] = activeLogsRes.results || [];
            for (const activeLog of activeLogs) {
              batchStatements.push(
                db.prepare(
                  `UPDATE leave_schedule_shift_task_logs
                   SET new_start_date = ?, new_end_date = ?
                   WHERE id = ?`
                ).bind(ti.new_start_date, ti.new_end_date, activeLog.id)
              );
            }
          }

          // Shift Future Daily Statuses & Pre-validate conflicts
          for (const si of impact.status_impacts) {
            // Check for conflict before shifting
            const existingOther = await db
              .prepare(`SELECT id FROM daily_status WHERE task_id = ? AND work_date = ? AND id != ?`)
              .bind(si.task_id, si.new_work_date, si.daily_status_id)
              .first();

            if (existingOther) {
              return errorResponse('일별 상태 이동 중 날짜 충돌이 발생하였습니다.', 409, 'DAILY_STATUS_SHIFT_CONFLICT');
            }

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

      // 16. DELETE /api/calendar/override-groups/:groupId
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

        // Section 4: Deletion State Transition Validation
        if (group.status !== 'ACTIVE') {
          return errorResponse('이미 삭제된 휴가 항목입니다.', 409, 'LEAVE_GROUP_ALREADY_DELETED');
        }

        const event = await db.prepare(`SELECT * FROM leave_schedule_shift_events WHERE override_group_id = ?`).bind(groupId).first();

        if (event) {
          if (event.event_status === 'LEAVE_DELETED_SCHEDULE_KEPT') {
            return errorResponse('이미 일정 유지가 확정된 항목입니다.', 409, 'LEAVE_SCHEDULE_DECISION_FINALIZED');
          }
          if (event.event_status === 'RESTORED') {
            return errorResponse('이미 일정이 원복 완료된 항목입니다.', 409, 'LEAVE_SCHEDULE_ALREADY_RESTORED');
          }
          if (event.event_status !== 'ACTIVE') {
            return errorResponse('휴가 이벤트 상태가 올바르지 않습니다.', 409, 'INVALID_LEAVE_EVENT_STATE');
          }
        }

        // Soft delete group & delete date overrides
        await db.batch([
          db.prepare(`UPDATE calendar_override_groups SET status = 'DELETED', deleted_by_name = ?, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(editor, groupId),
          db.prepare(`DELETE FROM calendar_overrides WHERE override_group_id = ?`).bind(groupId),
        ]);

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

        // Section 3 & 4: Generate Restore Token using crypto.randomUUID() upon deletion
        const restoreToken = crypto.randomUUID();
        await db.prepare(
          `UPDATE leave_schedule_shift_events
           SET event_status = 'LEAVE_DELETED_PENDING_DECISION', restore_token = ?, leave_deleted_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(restoreToken, event.id).run();

        // Fetch task logs and evaluate restore readiness
        const taskLogsRes = await db.prepare(
          `SELECT ltl.*, t.task_name, t.start_date as current_start_date, t.end_date as current_end_date, t.schedule_revision, t.progress, p.name as project_name, p.start_date as project_start_date, p.end_date as project_end_date, p.status as project_status
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
          } else if (tl.old_start_date < tl.project_start_date || tl.old_end_date > tl.project_end_date || tl.old_start_date > tl.old_end_date) {
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

      // 17. POST /api/calendar/override-groups/:groupId/keep-schedule
      const keepScheduleMatch = path.match(/^\/api\/calendar\/override-groups\/([^/]+)\/keep-schedule$/);
      if (method === 'POST' && keepScheduleMatch) {
        const groupId = keepScheduleMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const group = await db.prepare(`SELECT * FROM calendar_override_groups WHERE id = ?`).bind(groupId).first();
        if (!group) {
          return errorResponse('휴가 항목을 찾을 수 없습니다.', 404);
        }

        // Section 5: Authorization Check
        if (group.worker_id !== editCheck.worker!.id && group.worker_id !== editCheck.worker!.name) {
          return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
        }

        const event = await db.prepare(`SELECT * FROM leave_schedule_shift_events WHERE override_group_id = ?`).bind(groupId).first();
        if (!event) {
          return errorResponse('휴가 이벤트를 찾을 수 없습니다.', 404);
        }

        if (event.worker_id !== editCheck.worker!.id && event.worker_id !== editCheck.worker!.name) {
          return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
        }

        if (event.event_status !== 'LEAVE_DELETED_PENDING_DECISION') {
          return errorResponse('유효하지 않은 이벤트 상태입니다.', 409, 'INVALID_LEAVE_EVENT_STATE');
        }

        const restoreToken = body.restore_token;
        if (!restoreToken || !event.restore_token || restoreToken !== event.restore_token) {
          return errorResponse('유효하지 않거나 이미 처리된 복원 요청입니다.', 409, 'RESTORE_TOKEN_INVALID');
        }

        if (body.confirm_keep !== true) {
          return errorResponse('확인 플래그(confirm_keep)가 필요합니다.', 400);
        }

        await db.prepare(
          `UPDATE leave_schedule_shift_events SET event_status = 'LEAVE_DELETED_SCHEDULE_KEPT', restore_token = NULL WHERE id = ?`
        ).bind(event.id).run();

        return jsonResponse({
          success: true,
          message: '휴가 기록만 삭제되었습니다. 변경된 작업 일정은 유지됩니다.',
        });
      }

      // 18. POST /api/calendar/override-groups/:groupId/restore-schedule
      const restoreScheduleMatch = path.match(/^\/api\/calendar\/override-groups\/([^/]+)\/restore-schedule$/);
      if (method === 'POST' && restoreScheduleMatch) {
        const groupId = restoreScheduleMatch[1];
        const body: any = await request.json();
        const editor = getEditorName(body, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const group = await db.prepare(`SELECT * FROM calendar_override_groups WHERE id = ?`).bind(groupId).first();
        if (!group || group.status !== 'DELETED') {
          return errorResponse('삭제된 휴가 항목을 찾을 수 없습니다.', 409, 'INVALID_LEAVE_EVENT_STATE');
        }

        if (group.worker_id !== editCheck.worker!.id && group.worker_id !== editCheck.worker!.name) {
          return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
        }

        const restoreToken = body.restore_token;
        if (!restoreToken) {
          return errorResponse('복원 토큰이 필요합니다.', 400);
        }

        const event = await db
          .prepare(`SELECT * FROM leave_schedule_shift_events WHERE override_group_id = ? AND restore_token = ?`)
          .bind(groupId, restoreToken)
          .first();

        if (!event || event.event_status !== 'LEAVE_DELETED_PENDING_DECISION') {
          return errorResponse('유효하지 않거나 이미 처리된 복원 요청입니다.', 409, 'RESTORE_TOKEN_INVALID');
        }

        if (event.worker_id !== editCheck.worker!.id && event.worker_id !== editCheck.worker!.name) {
          return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
        }

        if (body.confirm_restore !== true) {
          return errorResponse('확인 플래그(confirm_restore)가 필요합니다.', 400);
        }

        // Fetch task logs
        const taskLogsRes = await db
          .prepare(
            `SELECT ltl.*, t.schedule_revision, t.start_date as current_start_date, t.end_date as current_end_date, t.progress, p.start_date as project_start_date, p.end_date as project_end_date, p.status as project_status
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

        // Section 6 & 7: Comprehensive Pre-checks (No continue! Abort on ANY conflict)
        for (const tl of taskLogs) {
          if (tl.progress === 100) {
            return errorResponse('완료된 작업이 포함되어 있어 전체 원복을 진행할 수 없습니다.', 409, 'LEAVE_RESTORE_COMPLETED_TASK');
          }
          if (tl.project_status === 'COMPLETED') {
            return errorResponse('완료된 프로젝트가 포함되어 있어 전체 원복을 진행할 수 없습니다.', 409, 'LEAVE_RESTORE_COMPLETED_PROJECT');
          }
          if (tl.schedule_revision !== tl.task_revision_after_shift || tl.current_start_date !== tl.new_start_date || tl.current_end_date !== tl.new_end_date) {
            return errorResponse('일부 작업은 휴가 등록 이후 일정이 수정되어 자동으로 앞당길 수 없습니다.', 409, 'LEAVE_RESTORE_MANUAL_CHANGED');
          }
          if (tl.old_start_date < tl.project_start_date || tl.old_end_date > tl.project_end_date || tl.old_start_date > tl.old_end_date) {
            return errorResponse('원복 후 일부 작업이 프로젝트 기간을 벗어납니다.', 409, 'LEAVE_RESTORE_OUTSIDE_PROJECT_RANGE');
          }
        }

        // Section 8 & 9: Pre-validate daily_status manual changes and conflicts
        for (const sl of statusLogs) {
          const currentSt = await db.prepare(`SELECT * FROM daily_status WHERE id = ?`).bind(sl.daily_status_id).first();
          if (!currentSt || currentSt.work_date !== sl.new_work_date || currentSt.status !== sl.status) {
            return errorResponse('휴가 반영 후 일부 일별 상태가 수동 수정되어 전체 원복을 진행할 수 없습니다.', 409, 'DAILY_STATUS_MANUAL_CHANGED');
          }
          const conflictOther = await db
            .prepare(`SELECT id FROM daily_status WHERE task_id = ? AND work_date = ? AND id != ?`)
            .bind(sl.task_id, sl.old_work_date, sl.daily_status_id)
            .first();
          if (conflictOther) {
            return errorResponse('일별 상태 원복 중 날짜 충돌이 발생하였습니다.', 409, 'DAILY_STATUS_RESTORE_CONFLICT');
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

      // 19. DELETE /api/calendar/overrides/:id (Legacy Group Delegation)
      const delOverrideMatch = path.match(/^\/api\/calendar\/overrides\/([^/]+)$/);
      if (method === 'DELETE' && delOverrideMatch) {
        const ovrId = delOverrideMatch[1];
        const editor = request.headers.get('x-editor-name');
        const editCheck = await requireEditableWorker(db, editor ? decodeURIComponent(editor) : '');
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const ovr = await db.prepare(`SELECT * FROM calendar_overrides WHERE id = ?`).bind(ovrId).first();
        if (!ovr) {
          return errorResponse('휴일·휴가 항목을 찾을 수 없습니다.', 404);
        }

        if (ovr.scope_type === 'WORKER') {
          const editorWorker = editCheck.worker!;
          if (ovr.scope_key !== editorWorker.id && ovr.scope_key !== editorWorker.name) {
            return errorResponse('본인의 휴일·휴가 일정만 변경할 수 있습니다.', 403, 'CALENDAR_SELF_ONLY');
          }
        }

        if (ovr.override_group_id) {
          const grp = await db.prepare(`SELECT * FROM calendar_override_groups WHERE id = ?`).bind(ovr.override_group_id).first();
          if (grp && grp.status === 'ACTIVE') {
            await db.batch([
              db.prepare(`UPDATE calendar_override_groups SET status = 'DELETED', deleted_by_name = ?, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(editCheck.worker!.name, grp.id),
              db.prepare(`DELETE FROM calendar_overrides WHERE override_group_id = ?`).bind(grp.id),
            ]);
            return jsonResponse({ id: ovrId, group_delegated: true, groupId: grp.id });
          }
        }

        await db.prepare(`DELETE FROM calendar_overrides WHERE id = ?`).bind(ovrId).run();
        return jsonResponse({ id: ovrId });
      }

      // 14.5 POST /api/projects/:id/baseline
      const baselineMatch = path.match(/^\/api\/projects\/([^/]+)\/baseline$/);
      if (method === 'POST' && baselineMatch) {
        const pId = baselineMatch[1];
        const editor = getEditorName({}, request);
        const editCheck = await requireEditableWorker(db, editor);
        if (!editCheck.allowed) {
          return errorResponse(editCheck.errorMsg!, 403, editCheck.errorCode!);
        }

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(pId).first();
        if (!project) return errorResponse('프로젝트를 찾을 수 없습니다.', 404);

        const versionRes = await db.prepare(`SELECT COALESCE(MAX(version), 0) as max_v FROM project_baselines WHERE project_id = ?`).bind(pId).first();
        const nextVersion = Number(versionRes?.max_v || 0) + 1;
        const baselineId = `pbl_${pId}_v${nextVersion}_${Date.now()}`;

        // Get current tasks
        const { results: taskResults } = await db.prepare(`SELECT * FROM tasks WHERE project_id = ?`).bind(pId).all();
        const currentTasks = taskResults || [];

        const batchStmts: any[] = [
          db.prepare(`UPDATE projects SET baseline_start_date = start_date, baseline_end_date = end_date, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(pId),
          db.prepare(`INSERT INTO project_baselines (id, project_id, version, baseline_start_date, baseline_end_date, created_by) VALUES (?, ?, ?, ?, ?, ?)`).bind(baselineId, pId, nextVersion, project.start_date, project.end_date, editCheck.worker?.name || editor),
        ];

        for (const t of currentTasks) {
          if (t.start_date && t.end_date) {
            batchStmts.push(
              db.prepare(`UPDATE tasks SET baseline_start_date = start_date, baseline_end_date = end_date WHERE id = ?`).bind(t.id)
            );
            batchStmts.push(
              db.prepare(`INSERT INTO task_baselines (id, baseline_id, task_id, baseline_start_date, baseline_end_date) VALUES (?, ?, ?, ?, ?)`).bind(`tbl_${t.id}_v${nextVersion}`, baselineId, t.id, t.start_date, t.end_date)
            );
          }
        }

        await db.batch(batchStmts);
        return jsonResponse({
          success: true,
          baseline_id: baselineId,
          version: nextVersion,
          baseline_start_date: project.start_date,
          baseline_end_date: project.end_date,
        });
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

      // 15.5 GET /api/tasks
      if (method === 'GET' && path === '/api/tasks') {
        const projectId = url.searchParams.get('project_id');
        let stmt;
        if (projectId) {
          stmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC`).bind(projectId);
        } else {
          stmt = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`);
        }
        const { results } = await stmt.all();
        const rawTasks = results || [];
        const taskIds = rawTasks.map((t: any) => t.id);
        const assigneesMap = await fetchTaskAssigneesMapServer(db, taskIds);
        const tasks = rawTasks.map((t: any) => ({
          ...t,
          assignees: assigneesMap[t.id] || [],
        }));
        return jsonResponse(tasks);
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

        const assignValidation = await validateAndNormalizeTaskAssigneesServer(db, body);
        if (!assignValidation.valid) {
          return errorResponse(assignValidation.errorMsg!, 400, assignValidation.errorCode!);
        }

        const isUnscheduled = validated.schedule_status === 'UNSCHEDULED';
        const finalStartDate = isUnscheduled ? null : (validated.start_date || null);
        const finalEndDate = isUnscheduled ? null : (validated.end_date || null);

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(validated.project_id).first();
        if (project && !isUnscheduled && finalStartDate && finalEndDate) {
          if (finalStartDate < project.start_date || finalEndDate > project.end_date || finalStartDate > finalEndDate) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Lịch công việc phải nằm trong thời gian của dự án.' : '작업 일정은 프로젝트 기간 안에서만 설정할 수 있습니다.';
            return errorResponse(msg, 409, 'TASK_OUTSIDE_PROJECT_RANGE');
          }
        }

        if (!isUnscheduled && finalStartDate && finalEndDate) {
          const batch = await fetchCalendarBatchData(db);
          const taskMetrics = calculateTaskProgressServer(
            { start_date: finalStartDate, end_date: finalEndDate, assignees: assignValidation.assignees, availability_policy: assignValidation.availabilityPolicy },
            batch.workers,
            batch.holidays,
            batch.overrides
          );
          if (taskMetrics.planned_working_days === 0) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Không có ngày làm việc thực tế trong khoảng thời gian đã chọn.' : '선택한 기간에 실제 근무 가능한 날짜가 없습니다.';
            return errorResponse(msg, 400, 'WORKING_DAY_RANGE_EMPTY');
          }
        }

        if (!isUnscheduled && finalStartDate && finalEndDate && body.confirm_worker_schedule_conflict !== true) {
          const prospectiveTask = {
            id: 'temp_create_id',
            project_id: validated.project_id,
            task_name: validated.task_name,
            start_date: finalStartDate,
            end_date: finalEndDate,
            schedule_status: 'SCHEDULED',
            primary_worker_id: assignValidation.primaryWorkerId,
            worker_name: assignValidation.primaryWorkerName,
            assignees: assignValidation.assignees,
          };

          const [allActiveProjectsRes, allActiveTasksRes, batch, ackRes] = await Promise.all([
            db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
            db.prepare(`SELECT * FROM tasks`).all(),
            fetchCalendarBatchData(db),
            db.prepare(`SELECT * FROM conflict_acknowledgements`).all().catch(() => ({ results: [] })),
          ]);

          const prospectiveTasks = [...(allActiveTasksRes.results || []), prospectiveTask];

          const conflictData = detectCrossProjectWorkerConflictsServer(
            allActiveProjectsRes.results || [],
            prospectiveTasks,
            batch.workers,
            batch.holidays,
            batch.overrides,
            validated.project_id,
            ackRes.results || []
          );

          const unackNewConflicts = conflictData.groups.filter((g) => !g.acknowledged);

          if (unackNewConflicts.length > 0 && body.confirm_worker_schedule_conflict !== true && !Array.isArray(body.confirm_cross_project_conflicts)) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Tổng tỷ lệ phân công của nhân viên vượt quá 100%.' : '담당자의 업무 배정 비중이 100%를 초과합니다.';
            const first = unackNewConflicts[0];
            return new Response(
              JSON.stringify({
                success: false,
                error: {
                  code: 'CROSS_PROJECT_CONFLICT_CONFIRMATION_REQUIRED',
                  message: msg,
                  details: {
                    worker_id: first.worker_id,
                    worker_name: first.worker_name,
                    fingerprints: unackNewConflicts.map((g) => g.fingerprint),
                    conflicts: unackNewConflicts,
                  },
                },
              }),
              { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
          }

          if (Array.isArray(body.confirm_cross_project_conflicts)) {
            for (const fp of body.confirm_cross_project_conflicts) {
              const matchingGroup = conflictData.groups.find((g) => g.fingerprint === fp);
              if (matchingGroup) {
                const ackId = `ack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                await db.prepare(`
                  INSERT INTO conflict_acknowledgements (id, conflict_fingerprint, policy_version, worker_id, project_ids_json, overlap_start_date, overlap_end_date, acknowledged_by_id, acknowledged_by_name)
                  VALUES (?, ?, 'cross_project_v1', ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(conflict_fingerprint) DO UPDATE SET
                    acknowledged_by_id = excluded.acknowledged_by_id,
                    acknowledged_by_name = excluded.acknowledged_by_name,
                    acknowledged_at = CURRENT_TIMESTAMP
                `).bind(ackId, fp, matchingGroup.worker_id, JSON.stringify(matchingGroup.project_ids), matchingGroup.overlap_start_date, matchingGroup.overlap_end_date, editCheck.worker?.id || 'editor', editor).run();
              }
            }
          }
        }

        const id = `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const transResult = await translateProjectOrTaskName(env.AI, validated.task_name);
        const nowIso = new Date().toISOString();

        let taskGroupId = body.task_group_id || null;
        if (!taskGroupId) {
          const firstGroup = await db
            .prepare(`SELECT id FROM task_groups WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC LIMIT 1`)
            .bind(validated.project_id)
            .first();
          if (firstGroup) {
            taskGroupId = firstGroup.id;
          } else {
            const newGroupId = `tgrp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await db
              .prepare(
                `INSERT INTO task_groups (id, project_id, group_name, group_name_ko, group_name_vi, source_language, translation_status, color_key, sort_order, created_by_name)
                 VALUES (?, ?, '기존 작업', '기존 작업', 'Công việc hiện có', 'ko', 'COMPLETED', 'BLUE', 1, ?)`
              )
              .bind(newGroupId, validated.project_id, editor)
              .run();
            taskGroupId = newGroupId;
          }
        }

        let taskSortOrder = Number(body.task_sort_order || 0);
        if (!taskSortOrder) {
          const maxSort = await db
            .prepare(`SELECT MAX(task_sort_order) as max_sort FROM tasks WHERE project_id = ? AND task_group_id = ?`)
            .bind(validated.project_id, taskGroupId)
            .first();
          taskSortOrder = (maxSort?.max_sort || 0) + 1;
        }

        const dbQueries: any[] = [];
        dbQueries.push(
          db
            .prepare(
              `INSERT INTO tasks (
                id, project_id, task_group_id, task_sort_order, worker_name, primary_worker_id, task_name, start_date, end_date, progress,
                progress_mode, availability_policy, completion_confirmed, schedule_status,
                created_by_name, updated_by_name,
                task_name_ko, task_name_vi, source_language, translation_status, translation_error
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              id,
              validated.project_id,
              taskGroupId,
              taskSortOrder,
              assignValidation.primaryWorkerName,
              assignValidation.primaryWorkerId,
              validated.task_name,
              finalStartDate,
              finalEndDate,
              validated.progress ?? 0,
              assignValidation.progressMode,
              assignValidation.availabilityPolicy,
              isUnscheduled ? 'UNSCHEDULED' : 'SCHEDULED',
              editor,
              editor,
              transResult.name_ko,
              transResult.name_vi,
              transResult.source_language,
              transResult.translation_status,
              transResult.translation_error
            )
        );

        for (const a of assignValidation.assignees!) {
          const assignId = `ta_${id}_${a.worker_id}`;
          dbQueries.push(
            db
              .prepare(
                `INSERT INTO task_assignees (id, task_id, worker_id, assignment_role, allocation_percent, sort_order, assigned_by_name, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(assignId, id, a.worker_id, a.assignment_role, a.allocation_percent, a.sort_order, editor, nowIso)
          );
        }

        await db.batch(dbQueries);

        await updateProjectAverageProgress(db, validated.project_id);

        const created: any = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first();
        const assigneesMap = await fetchTaskAssigneesMapServer(db, [id]);
        created.assignees = assigneesMap[id] || assignValidation.assignees;
        created.assignee_ids = created.assignees.map((a: any) => a.worker_id);
        created.actual_progress_source = created.progress_mode;

        return jsonResponse(created, 201);
      }

      // 17. PATCH /api/tasks/:id
      const patchTaskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'PATCH' && patchTaskMatch) {
        const taskId = patchTaskMatch[1];
        const existing: any = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
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

        // Merge assignees
        const currentAssigneesMap = await fetchTaskAssigneesMapServer(db, [taskId]);
        const currentAssignees = currentAssigneesMap[taskId] || [];

        const mergeBody = {
          ...body,
          primary_worker_id: body.primary_worker_id || existing.primary_worker_id,
          worker_name: body.worker_name || existing.worker_name,
          assignee_ids: body.assignee_ids || (currentAssignees.length > 0 ? currentAssignees.map((a: any) => a.worker_id) : undefined),
          assignee_allocations: body.assignee_allocations || (currentAssignees.length > 0 ? currentAssignees.map((a: any) => ({ worker_id: a.worker_id, allocation_percent: a.allocation_percent })) : undefined),
          progress_mode: body.progress_mode || existing.progress_mode || 'AUTO_TIME',
          availability_policy: body.availability_policy || existing.availability_policy || 'ANY_AVAILABLE',
        };

        const assignValidation = await validateAndNormalizeTaskAssigneesServer(db, mergeBody);
        if (!assignValidation.valid) {
          return errorResponse(assignValidation.errorMsg!, 400, assignValidation.errorCode!);
        }

        const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(existing.project_id).first();
        const targetStart = validated.start_date ?? existing.start_date;
        const targetEnd = validated.end_date ?? existing.end_date;

        if (project) {
          if (targetStart < project.start_date || targetEnd > project.end_date || targetStart > targetEnd) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Lịch công việc phải nằm trong thời gian của dự án.' : '작업 일정은 프로젝트 기간 안에서만 설정할 수 있습니다.';
            return errorResponse(msg, 409, 'TASK_OUTSIDE_PROJECT_RANGE');
          }
        }

        const batch = await fetchCalendarBatchData(db);
        const taskMetrics = calculateTaskProgressServer(
          { start_date: targetStart, end_date: targetEnd, assignees: assignValidation.assignees, availability_policy: assignValidation.availabilityPolicy },
          batch.workers,
          batch.holidays,
          batch.overrides
        );
        if (taskMetrics.planned_working_days === 0) {
          const isVi = editCheck.worker?.ui_language === 'vi';
          const msg = isVi ? 'Không có ngày làm việc thực tế trong khoảng thời gian đã chọn.' : '선택한 기간에 실제 근무 가능한 날짜가 없습니다.';
          return errorResponse(msg, 400, 'WORKING_DAY_RANGE_EMPTY');
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

        if (body.task_name_ko !== undefined) task_name_ko = body.task_name_ko;
        if (body.task_name_vi !== undefined) task_name_vi = body.task_name_vi;
        if (body.translation_status !== undefined) trans_status = body.translation_status;

        const newName = validated.task_name ?? existing.task_name;
        const newStart = validated.start_date ?? existing.start_date;
        const newEnd = validated.end_date ?? existing.end_date;
        const newProgress = validated.progress ?? existing.progress;
        const completionConfirmed = body.completion_confirmed !== undefined ? Number(body.completion_confirmed) : (existing.completion_confirmed || 0);

        const targetGroupId = body.task_group_id || existing.task_group_id;
        const targetSortOrder = body.task_sort_order !== undefined ? Number(body.task_sort_order) : (existing.task_sort_order || 0);

        const dateChanged = (validated.start_date !== undefined && validated.start_date !== existing.start_date) || (validated.end_date !== undefined && validated.end_date !== existing.end_date);
        const scheduleStatusChanged = body.schedule_status !== undefined && body.schedule_status !== existing.schedule_status;

        const existingAssigneeIds = currentAssignees.map((a: any) => a.worker_id).sort().join(',');
        const newAssigneeIds = (assignValidation.assignees || []).map((a: any) => a.worker_id).sort().join(',');
        const assigneeChanged = body.assignee_ids !== undefined && existingAssigneeIds !== newAssigneeIds;

        const existingAllocations = JSON.stringify(currentAssignees.map((a: any) => ({ worker_id: a.worker_id, allocation_percent: a.allocation_percent })));
        const newAllocations = JSON.stringify((assignValidation.assignees || []).map((a: any) => ({ worker_id: a.worker_id, allocation_percent: a.allocation_percent })));
        const allocationChanged = body.assignee_allocations !== undefined && existingAllocations !== newAllocations;

        const availabilityPolicyChanged = body.availability_policy !== undefined && body.availability_policy !== existing.availability_policy;

        const scheduleRelevantChanged = dateChanged || scheduleStatusChanged || assigneeChanged || allocationChanged || availabilityPolicyChanged;
        const targetScheduleStatus = body.schedule_status !== undefined ? body.schedule_status : existing.schedule_status;

        if (scheduleRelevantChanged && body.confirm_worker_schedule_conflict !== true && !Array.isArray(body.confirm_cross_project_conflicts)) {
          const [allActiveProjectsRes, allActiveTasksRes, batch, ackRes] = await Promise.all([
            db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
            db.prepare(`SELECT * FROM tasks`).all(),
            fetchCalendarBatchData(db),
            db.prepare(`SELECT * FROM conflict_acknowledgements`).all().catch(() => ({ results: [] })),
          ]);

          const updatedTasks = (allActiveTasksRes.results || []).map((t: any) => {
            if (t.id === taskId) {
              return {
                ...t,
                start_date: targetScheduleStatus === 'UNSCHEDULED' ? null : newStart,
                end_date: targetScheduleStatus === 'UNSCHEDULED' ? null : newEnd,
                schedule_status: targetScheduleStatus,
                assignees: assignValidation.assignees,
                availability_policy: assignValidation.availabilityPolicy,
              };
            }
            return t;
          });

          const conflictData = detectCrossProjectWorkerConflictsServer(
            allActiveProjectsRes.results || [],
            updatedTasks,
            batch.workers,
            batch.holidays,
            batch.overrides,
            existing.project_id,
            ackRes.results || []
          );

          const unackNewConflicts = conflictData.groups.filter((g) => !g.acknowledged);

          if (unackNewConflicts.length > 0) {
            const isVi = editCheck.worker?.ui_language === 'vi';
            const msg = isVi ? 'Tổng tỷ lệ phân công của nhân viên vượt quá 100%.' : '담당자의 업무 배정 비중이 100%를 초과합니다.';
            const first = unackNewConflicts[0];
            return new Response(
              JSON.stringify({
                success: false,
                error: {
                  code: 'CROSS_PROJECT_CONFLICT_CONFIRMATION_REQUIRED',
                  message: msg,
                  details: {
                    worker_id: first.worker_id,
                    worker_name: first.worker_name,
                    fingerprints: unackNewConflicts.map((g) => g.fingerprint),
                    conflicts: unackNewConflicts,
                  },
                },
              }),
              { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
          }
        }

        if (Array.isArray(body.confirm_cross_project_conflicts)) {
          for (const fp of body.confirm_cross_project_conflicts) {
            const ackId = `ack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await db.prepare(`
              INSERT INTO conflict_acknowledgements (id, conflict_fingerprint, policy_version, worker_id, project_ids_json, overlap_start_date, overlap_end_date, acknowledged_by_id, acknowledged_by_name)
              VALUES (?, ?, 'cross_project_v1', ?, ?, ?, ?, ?, ?)
              ON CONFLICT(conflict_fingerprint) DO UPDATE SET
                acknowledged_by_id = excluded.acknowledged_by_id,
                acknowledged_by_name = excluded.acknowledged_by_name,
                acknowledged_at = CURRENT_TIMESTAMP
            `).bind(ackId, fp, assignValidation.primaryWorkerId || 'wrk_unknown', JSON.stringify([existing.project_id]), '2000-01-01', '2099-12-31', editCheck.worker?.id || 'editor', editor).run();
          }
        }

        const nextRevision = (dateChanged || scheduleStatusChanged) ? (existing.schedule_revision || 0) + 1 : (existing.schedule_revision || 0);
        const nowIso = new Date().toISOString();

        const dbQueries: any[] = [];

        // Log mode change if changed
        if (body.progress_mode && body.progress_mode !== existing.progress_mode) {
          const logId = `tpml_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          dbQueries.push(
            db
              .prepare(
                `INSERT INTO task_progress_mode_logs (id, task_id, old_mode, new_mode, old_actual_progress, new_actual_progress, changed_by_name, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(logId, taskId, existing.progress_mode || 'AUTO_TIME', body.progress_mode, existing.actual_progress || 0, taskMetrics.actual_progress, editor, nowIso)
          );
        }

        dbQueries.push(
          db
            .prepare(
              `UPDATE tasks SET
                task_group_id = ?,
                task_sort_order = ?,
                worker_name = ?,
                primary_worker_id = ?,
                task_name = ?,
                start_date = ?,
                end_date = ?,
                progress = ?,
                progress_mode = ?,
                availability_policy = ?,
                completion_confirmed = ?,
                schedule_revision = ?,
                updated_by_name = ?,
                task_name_ko = ?,
                task_name_vi = ?,
                source_language = ?,
                translation_status = ?,
                translation_error = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
            )
            .bind(
              targetGroupId,
              targetSortOrder,
              assignValidation.primaryWorkerName,
              assignValidation.primaryWorkerId,
              newName,
              newStart,
              newEnd,
              newProgress,
              assignValidation.progressMode,
              assignValidation.availabilityPolicy,
              completionConfirmed,
              nextRevision,
              editor,
              task_name_ko,
              task_name_vi,
              source_lang,
              trans_status,
              trans_error,
              taskId
            )
        );

        // Replace task_assignees
        dbQueries.push(db.prepare(`DELETE FROM task_assignees WHERE task_id = ?`).bind(taskId));

        for (const a of assignValidation.assignees!) {
          const assignId = `ta_${taskId}_${a.worker_id}`;
          dbQueries.push(
            db
              .prepare(
                `INSERT INTO task_assignees (id, task_id, worker_id, assignment_role, allocation_percent, sort_order, assigned_by_name, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(assignId, taskId, a.worker_id, a.assignment_role, a.allocation_percent, a.sort_order, editor, nowIso)
          );
        }

        await db.batch(dbQueries);

        await updateProjectAverageProgress(db, existing.project_id);

        const updated: any = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first();
        const assigneesMap = await fetchTaskAssigneesMapServer(db, [taskId]);
        updated.assignees = assigneesMap[taskId] || assignValidation.assignees;
        updated.assignee_ids = updated.assignees.map((a: any) => a.worker_id);
        updated.actual_progress_source = updated.progress_mode;

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
