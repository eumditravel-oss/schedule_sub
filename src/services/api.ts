// src/services/api.ts
import { ActorContext, ApiResponse, Project, ProjectProgressFoundation, Task, TaskGroup, Worker, DailyStatusType, CountryHoliday, CalendarOverride, ProjectWorkerAllocation } from '../types';

const WORKER_ID_KEY = 'schedule_current_worker_id';
const WORKER_NAME_KEY = 'schedule_current_worker_name';
const TEST_SESSION_KEY = 'schedule_test_session_id';

export const ACTUAL_WORKERS = [
  'CEO',
  'COO',
  '유종욱 실장',
  '박용진 수석',
  'Thanh Phuong(탄 프엉)',
  'Manh Cuong(끄엉)',
  'Quoc Nhut(꾸옥 느엿)',
];

export function getCurrentWorkerId(): string {
  try {
    return localStorage.getItem(WORKER_ID_KEY) || localStorage.getItem(WORKER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function getCurrentWorkerName(): string {
  try {
    const val = localStorage.getItem(WORKER_NAME_KEY) || localStorage.getItem(WORKER_ID_KEY) || '';
    if (val && !ACTUAL_WORKERS.includes(val) && !val.startsWith('wrk_')) {
      return '';
    }
    return val;
  } catch {
    return '';
  }
}

export function setCurrentWorker(worker: Worker | string): void {
  try {
    const targetName = typeof worker === 'string' ? worker : worker.name;
    if (targetName && !ACTUAL_WORKERS.includes(targetName) && !targetName.startsWith('wrk_')) {
      return;
    }
    if (typeof worker === 'string') {
      localStorage.setItem(WORKER_ID_KEY, worker);
      localStorage.setItem(WORKER_NAME_KEY, worker);
    } else {
      localStorage.setItem(WORKER_ID_KEY, worker.id);
      localStorage.setItem(WORKER_NAME_KEY, worker.name);
    }
  } catch {}
}

export function clearCurrentWorker(): void {
  try {
    localStorage.removeItem(WORKER_ID_KEY);
    localStorage.removeItem(WORKER_NAME_KEY);
  } catch {}
}

export function getActorContext(): ActorContext {
  let testSessionId = '';
  try {
    testSessionId = localStorage.getItem(TEST_SESSION_KEY) || '';
    if (!testSessionId) {
      testSessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `test-session-${Date.now()}`;
      localStorage.setItem(TEST_SESSION_KEY, testSessionId);
    }
  } catch {
    testSessionId = 'test-session-unavailable';
  }
  const actorUserId = getCurrentWorkerId() || null;
  return {
    actorMode: 'TEST_SELECTOR',
    actorUserId,
    actorEmployeeId: actorUserId,
    selectedViewEmployeeId: actorUserId,
    testSessionId,
  };
}

function getWriteHeaders() {
  const currentWorker = getCurrentWorkerName();
  const actor = getActorContext();
  return {
    'Content-Type': 'application/json',
    'x-editor-name': encodeURIComponent(currentWorker),
    'x-actor-mode': actor.actorMode,
    'x-actor-user-id': actor.actorUserId || '',
    'x-actor-employee-id': actor.actorEmployeeId || '',
    'x-selected-view-employee-id': actor.selectedViewEmployeeId || '',
    'x-test-session-id': actor.testSessionId,
  };
}

function withIdempotencyKey(key?: string) {
  return { ...getWriteHeaders(), 'Idempotency-Key': key || crypto.randomUUID() };
}

async function handleResponse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch (parseErr) {
    const errorMsg = res.status === 429
      ? '서버 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
      : `서버 응답 오류 (HTTP ${res.status}): JSON 형식이 아닙니다.`;
    const errorObj = new Error(errorMsg) as any;
    errorObj.code = res.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'INVALID_SERVER_RESPONSE';
    errorObj.status = res.status;
    throw errorObj;
  }

  if (!res.ok || !json.success) {
    const errorMsg = json.error?.message || `요청 처리 중 오류가 발생했습니다. (HTTP ${res.status})`;
    const errorObj = new Error(errorMsg) as any;
    errorObj.code = json.error?.code || `HTTP_${res.status}`;
    errorObj.details = json.error?.details;
    throw errorObj;
  }
  return json.data as T;
}

export const api = {
  async getWorklogContext(employeeId: string, localWorkDate: string): Promise<any> {
    const params = new URLSearchParams({ employee_id: employeeId, local_work_date: localWorkDate });
    const res = await fetch(`/api/v3/worklogs/context?${params}`, { headers: getWriteHeaders() });
    return handleResponse<any>(res);
  },

  async getDailyCapacity(employeeId: string, localWorkDate: string): Promise<any> {
    const params = new URLSearchParams({ employee_id: employeeId, local_work_date: localWorkDate });
    const res = await fetch(`/api/v3/capacity/day?${params}`, { headers: getWriteHeaders() });
    return handleResponse<any>(res);
  },

  async getWorklog(worklogId: string): Promise<any> {
    const res = await fetch(`/api/v3/worklogs/${encodeURIComponent(worklogId)}`, { headers: getWriteHeaders() });
    return handleResponse<any>(res);
  },

  async submitMorning(payload: any, idempotencyKey?: string): Promise<any> {
    const res = await fetch('/api/v3/worklogs/morning', {
      method: 'POST', headers: withIdempotencyKey(idempotencyKey), body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async submitEod(worklogId: string, payload: any, idempotencyKey?: string): Promise<any> {
    const res = await fetch(`/api/v3/worklogs/${encodeURIComponent(worklogId)}/eod`, {
      method: 'POST', headers: withIdempotencyKey(idempotencyKey), body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async reviseWorklog(worklogId: string, payload: any, idempotencyKey?: string): Promise<any> {
    const res = await fetch(`/api/v3/worklogs/${encodeURIComponent(worklogId)}/revisions`, {
      method: 'POST', headers: withIdempotencyKey(idempotencyKey), body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async requestWorklogCorrection(worklogId: string, payload: any, idempotencyKey?: string): Promise<any> {
    const res = await fetch(`/api/v3/worklogs/${encodeURIComponent(worklogId)}/correction-requests`, {
      method: 'POST', headers: withIdempotencyKey(idempotencyKey), body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async getTaskActual(taskId: string): Promise<any> {
    const res = await fetch(`/api/v3/tasks/${encodeURIComponent(taskId)}/actual`, { headers: getWriteHeaders() });
    return handleResponse<any>(res);
  },

  // 0. Workers
  async getWorkers(): Promise<Worker[]> {
    const res = await fetch('/api/workers');
    return handleResponse<Worker[]>(res);
  },

  // 1. Projects
  async getProjects(status: 'ALL' | 'ACTIVE' | 'COMPLETED' = 'ACTIVE', year?: string): Promise<Project[]> {
    let url = `/api/projects?status=${status}`;
    if (status === 'COMPLETED' && year) {
      url += `&year=${year}`;
    }
    const res = await fetch(url);
    return handleResponse<Project[]>(res);
  },

  async getCompletedYears(): Promise<string[]> {
    const projects = await this.getProjects('COMPLETED');
    const years = new Set<string>();
    const currentYear = new Date().getFullYear().toString();
    years.add(currentYear);

    projects.forEach((p) => {
      if (p.completed_at) {
        years.add(p.completed_at.substring(0, 4));
      } else if (p.end_date) {
        years.add(p.end_date.substring(0, 4));
      }
    });

    return Array.from(years).sort((a, b) => b.localeCompare(a));
  },

  async getProjectDetail(id: string): Promise<{ project: Project; tasks: Task[]; task_groups: TaskGroup[] }> {
    const res = await fetch(`/api/projects/${id}/detail`);
    return handleResponse<{ project: Project; tasks: Task[]; task_groups: TaskGroup[] }>(res);
  },

  async getProjectProgressFoundation(id: string, date?: string): Promise<ProjectProgressFoundation> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetch(`/api/projects/${id}/progress-foundation${query}`);
    return handleResponse<ProjectProgressFoundation>(res);
  },

  async getProjectWorkerAllocations(projectId: string): Promise<ProjectWorkerAllocation[]> {
    const res = await fetch(`/api/projects/${projectId}/worker-allocations`);
    return handleResponse<ProjectWorkerAllocation[]>(res);
  },

  async updateProjectWorkerAllocations(
    projectId: string,
    allocations: Array<{ worker_id: string; allocation_percent: number; note?: string }>
  ): Promise<ProjectWorkerAllocation[]> {
    const res = await fetch(`/api/projects/${projectId}/worker-allocations`, {
      method: 'PUT',
      headers: getWriteHeaders(),
      body: JSON.stringify({ allocations }),
    });
    return handleResponse<ProjectWorkerAllocation[]>(res);
  },

  async saveProjectWorkerAllocations(
    projectId: string,
    allocations: Array<{ worker_id: string; allocation_percent: number; note?: string }>
  ): Promise<ProjectWorkerAllocation[]> {
    return this.updateProjectWorkerAllocations(projectId, allocations);
  },

  async createTaskGroup(projectId: string, data: Partial<TaskGroup>): Promise<TaskGroup> {
    const res = await fetch(`/api/projects/${projectId}/task-groups`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TaskGroup>(res);
  },

  async updateTaskGroup(id: string, data: Partial<TaskGroup>): Promise<TaskGroup> {
    const res = await fetch(`/api/task-groups/${id}`, {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TaskGroup>(res);
  },

  async deleteTaskGroup(id: string, options?: { move_to_group_id?: string; delete_tasks?: boolean }): Promise<{ id: string }> {
    let url = `/api/task-groups/${id}`;
    const params = new URLSearchParams();
    if (options?.move_to_group_id) params.set('move_to_group_id', options.move_to_group_id);
    if (options?.delete_tasks) params.set('delete_tasks', 'true');
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  async updateTaskStructureOrder(
    projectId: string,
    groups: Array<{ group_id: string; sort_order: number; task_ids: string[] }>,
    details?: {
      moved_task_id?: string;
      source_group_id?: string;
      target_group_id?: string;
      target_index?: number;
      change_type?: string;
      group_reordered?: boolean;
    }
  ): Promise<any> {
    const res = await fetch(`/api/projects/${projectId}/task-structure-order`, {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify({ groups, ...details }),
    });
    return handleResponse<any>(res);
  },

  async createProject(data: Partial<Project>): Promise<Project> {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Project>(res);
  },

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Project>(res);
  },

  async deleteProject(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  async completeProject(
    id: string,
    mode: 'STRICT' | 'COMPLETE_ALL' = 'COMPLETE_ALL',
    completedDate?: string
  ): Promise<any> {
    const res = await fetch(`/api/projects/${id}/complete`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ mode, completed_date: completedDate }),
    });
    return handleResponse<any>(res);
  },

  async repairProjectCompletion(id: string): Promise<any> {
    const res = await fetch(`/api/projects/${id}/completion-repair`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<any>(res);
  },

  async reopenProject(id: string): Promise<Project> {
    const res = await fetch(`/api/projects/${id}/reopen`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<Project>(res);
  },

  async saveProjectBaseline(id: string): Promise<any> {
    const res = await fetch(`/api/projects/${id}/baseline`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<any>(res);
  },

  async getProjectConflicts(id: string): Promise<any> {
    const res = await fetch(`/api/projects/${id}/conflicts`);
    return handleResponse<any>(res);
  },

  // 2. Tasks
  async getTasks(projectId?: string): Promise<Task[]> {
    const url = projectId ? `/api/tasks?project_id=${projectId}` : '/api/tasks';
    const res = await fetch(url);
    return handleResponse<Task[]>(res);
  },

  async createTask(data: Partial<Task>): Promise<Task> {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Task>(res);
  },

  async updateTask(id: string, data: Partial<Task>): Promise<Task> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Task>(res);
  },

  async deleteTask(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  async updateDailyStatus(taskId: string, date: string, status: DailyStatusType): Promise<any> {
    const res = await fetch(`/api/tasks/${taskId}/daily-status/${date}`, {
      method: 'PUT',
      headers: getWriteHeaders(),
      body: JSON.stringify({ status }),
    });
    return handleResponse<any>(res);
  },

  // 3. Translation
  async translate(text: string, sourceLang: string, targetLang: string): Promise<{ translated_text: string }> {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
    });
    return handleResponse<{ translated_text: string }>(res);
  },

  // 4. Calendar & Holidays
  async getHolidays(country: 'KR' | 'VN', year: number): Promise<CountryHoliday[]> {
    const res = await fetch(`/api/calendar/holidays?country=${country}&year=${year}`);
    return handleResponse<CountryHoliday[]>(res);
  },

  async syncHolidays(countryCode: 'KR' | 'VN', year: number): Promise<any> {
    const res = await fetch('/api/calendar/holidays/sync', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ country_code: countryCode, year }),
    });
    return handleResponse<any>(res);
  },

  async addManualHoliday(data: { country_code: 'KR' | 'VN'; holiday_date: string; name_ko: string; name_vi: string }): Promise<CountryHoliday> {
    const res = await fetch('/api/calendar/manual-holidays', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<CountryHoliday>(res);
  },

  async deleteManualHoliday(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/calendar/manual-holidays/${id}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  async getOverrides(params?: { worker_id?: string; country_code?: string; start?: string; end?: string }): Promise<CalendarOverride[]> {
    const query = new URLSearchParams();
    if (params?.worker_id) query.set('worker_id', params.worker_id);
    if (params?.country_code) query.set('country_code', params.country_code);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);

    const res = await fetch(`/api/calendar/overrides?${query.toString()}`);
    return handleResponse<CalendarOverride[]>(res);
  },

  async getCalendarOverrides(): Promise<CalendarOverride[]> {
    return this.getOverrides();
  },

  async getManualCountryHolidays(): Promise<CountryHoliday[]> {
    const currentYear = new Date().getFullYear();
    try {
      const [kr, vn] = await Promise.all([
        this.getHolidays('KR', currentYear),
        this.getHolidays('VN', currentYear),
      ]);
      return [...(kr || []), ...(vn || [])];
    } catch {
      return [];
    }
  },

  async getAllocationHistory(params?: {
    date_from?: string;
    date_to?: string;
    worker_id?: string;
    project_id?: string;
    changed_by?: string;
    change_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.date_from) query.set('date_from', params.date_from);
    if (params?.date_to) query.set('date_to', params.date_to);
    if (params?.worker_id) query.set('worker_id', params.worker_id);
    if (params?.project_id) query.set('project_id', params.project_id);
    if (params?.changed_by) query.set('changed_by', params.changed_by);
    if (params?.change_type) query.set('change_type', params.change_type);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const res = await fetch(`/api/workforce/allocation-history?${query.toString()}`);
    return handleResponse<any[]>(res);
  },

  async getProjectAllocationHistory(projectId: string): Promise<any[]> {
    const res = await fetch(`/api/projects/${projectId}/worker-allocation-history`);
    return handleResponse<any[]>(res);
  },

  async getCompletionIntegrityHealth(): Promise<{ completed_projects: number; inconsistent_projects: number; inconsistent_tasks: number; details: any[] }> {
    const res = await fetch('/api/health/completion-integrity');
    return handleResponse<any>(res);
  },

  async createOverride(data: any): Promise<CalendarOverride[]> {
    const res = await fetch('/api/calendar/overrides', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<CalendarOverride[]>(res);
  },

  async getVietnamSaturdayCalendar(year: number, month: number): Promise<any> {
    const res = await fetch(`/api/calendar/vietnam-saturdays?year=${year}&month=${month}`);
    return handleResponse<any>(res);
  },

  async calculateVietnamSaturdayImpact(payload: any): Promise<any> {
    const res = await fetch('/api/calendar/vietnam-saturdays/impact', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async updateVietnamSaturdayCalendar(payload: any): Promise<any> {
    const res = await fetch('/api/calendar/vietnam-saturdays', {
      method: 'PUT',
      headers: getWriteHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async deleteOverride(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/calendar/overrides/${id}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  async getOverrideGroups(workerId?: string): Promise<any[]> {
    const url = workerId ? `/api/calendar/override-groups?worker_id=${encodeURIComponent(workerId)}` : '/api/calendar/override-groups';
    const res = await fetch(url);
    return handleResponse<any[]>(res);
  },

  async deleteOverrideGroup(groupId: string): Promise<any> {
    const res = await fetch(`/api/calendar/override-groups/${groupId}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<any>(res);
  },

  async keepLeaveSchedule(groupId: string, restoreToken: string): Promise<any> {
    const res = await fetch(`/api/calendar/override-groups/${groupId}/keep-schedule`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ restore_token: restoreToken, confirm_keep: true }),
    });
    return handleResponse<any>(res);
  },

  async restoreLeaveSchedule(groupId: string, restoreToken: string): Promise<any> {
    const res = await fetch(`/api/calendar/override-groups/${groupId}/restore-schedule`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ restore_token: restoreToken, confirm_restore: true }),
    });
    return handleResponse<any>(res);
  },

  async getPendingScheduleDecisions(): Promise<any[]> {
    const res = await fetch('/api/calendar/pending-schedule-decisions', {
      headers: getWriteHeaders(),
    });
    return handleResponse<any[]>(res);
  },

  async getVersion(): Promise<{ commit: string; environment: string; deployed_at: string }> {
    try {
      const res = await fetch('/api/version');
      return await handleResponse<{ commit: string; environment: string; deployed_at: string }>(res);
    } catch {
      const isQa = typeof window !== 'undefined' && window.location.hostname.includes('-qa');
      return {
        commit: 'unknown',
        environment: isQa ? 'qa' : 'production',
        deployed_at: new Date().toISOString(),
      };
    }
  },

  async getProjectShiftLogs(projectId: string): Promise<{ project_shift_logs: any[]; leave_shift_logs: any[] }> {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/shift-logs`);
    return handleResponse<{ project_shift_logs: any[]; leave_shift_logs: any[] }>(res);
  },

  async getManualHolidays(country: 'KR' | 'VN', year: number, month: number): Promise<CountryHoliday[]> {
    const res = await fetch(`/api/calendar/manual-holidays?country=${country}&year=${year}&month=${month}`);
    return handleResponse<CountryHoliday[]>(res);
  },

  async calculateManualHolidayImpact(country: 'KR' | 'VN', year: number, month: number, holidays: Array<{ date: string; name_ko?: string; name_vi?: string }>): Promise<any> {
    const res = await fetch(`/api/calendar/manual-holidays/impact`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ country_code: country, year, month, holidays }),
    });
    return handleResponse<any>(res);
  },

  async saveManualHolidaysMonth(country: 'KR' | 'VN', year: number, month: number, holidays: Array<{ date: string; name_ko?: string; name_vi?: string }>, restoreShiftedTasks: boolean = false): Promise<any> {
    const res = await fetch(`/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: getWriteHeaders(),
      body: JSON.stringify({ country_code: country, year, month, holidays, restore_shifted_tasks: restoreShiftedTasks }),
    });
    return handleResponse<any>(res);
  },

  async acknowledgeConflict(projectId: string, fingerprint: string): Promise<any> {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/conflicts/${encodeURIComponent(fingerprint)}/acknowledge`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ policy_version: 'cross_project_v2_primary_only' }),
    });
    return handleResponse<any>(res);
  },

  async getTodaySummary(dateStr?: string): Promise<any> {
    const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : '';
    const res = await fetch(`/api/dashboard/today-summary${query}`);
    return handleResponse<any>(res);
  },

  async getOverdueDetails(dateStr?: string): Promise<any> {
    const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : '';
    const res = await fetch(`/api/today-summary/overdue-details${query}`);
    return handleResponse<any>(res);
  },
};
