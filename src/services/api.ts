// src/services/api.ts
import { ApiResponse, Project, Task, Worker, DailyStatusType, CountryHoliday, CalendarOverride } from '../types';

const WORKER_ID_KEY = 'schedule_current_worker_id';
const WORKER_NAME_KEY = 'schedule_current_worker_name';

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
    const id = localStorage.getItem(WORKER_ID_KEY) || '';
    if (id && (ACTUAL_WORKERS.includes(id) || id.startsWith('wrk_'))) return id;
    const legacyName = localStorage.getItem(WORKER_NAME_KEY) || '';
    if (legacyName && ACTUAL_WORKERS.includes(legacyName)) {
      return legacyName;
    }
    return '';
  } catch {
    return '';
  }
}

export function getCurrentWorkerName(): string {
  try {
    const name = localStorage.getItem(WORKER_NAME_KEY) || '';
    if (name && ACTUAL_WORKERS.includes(name)) return name;
    const id = localStorage.getItem(WORKER_ID_KEY) || '';
    if (id && ACTUAL_WORKERS.includes(id)) return id;
    return '';
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

function getWriteHeaders() {
  const currentWorker = getCurrentWorkerName();
  return {
    'Content-Type': 'application/json',
    'x-editor-name': encodeURIComponent(currentWorker),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    const errorMsg = json.error?.message || '요청 처리 중 오류가 발생했습니다.';
    const errorObj = new Error(errorMsg) as any;
    errorObj.code = json.error?.code;
    errorObj.details = json.error?.details;
    throw errorObj;
  }
  return json.data as T;
}

export const api = {
  // 0. Workers
  async getWorkers(): Promise<Worker[]> {
    const res = await fetch('/api/workers');
    return handleResponse<Worker[]>(res);
  },

  // 1. Projects
  async getProjects(status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE', year?: string): Promise<Project[]> {
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

  async getProjectDetail(id: string): Promise<{ project: Project; tasks: Task[] }> {
    const res = await fetch(`/api/projects/${id}/detail`);
    return handleResponse<{ project: Project; tasks: Task[] }>(res);
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

  async completeProject(id: string): Promise<Project> {
    const res = await fetch(`/api/projects/${id}/complete`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<Project>(res);
  },

  async reopenProject(id: string): Promise<Project> {
    const res = await fetch(`/api/projects/${id}/reopen`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<Project>(res);
  },

  // 2. Tasks
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
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`/api/calendar/overrides?${query}`);
    return handleResponse<CalendarOverride[]>(res);
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
};
