// src/services/api.ts
import { ApiResponse, Project, Task, Worker, DailyStatusType } from '../types';

const WORKER_STORAGE_KEY = 'schedule_current_worker_id';

export const ACTUAL_WORKERS = [
  'CEO',
  'COO',
  '유종욱 실장',
  '박용진 수석',
  'Thanh Phuong(탄 프엉)',
  'Manh Cuong(끄엉)',
  'Quoc Nhut(꾸옥 느엿)',
];

export function getCurrentWorkerName(): string {
  try {
    const saved = localStorage.getItem(WORKER_STORAGE_KEY) || '';
    if (saved && !ACTUAL_WORKERS.includes(saved)) {
      localStorage.removeItem(WORKER_STORAGE_KEY);
      return '';
    }
    return saved;
  } catch {
    return '';
  }
}

export function setCurrentWorkerName(name: string): void {
  try {
    if (name && !ACTUAL_WORKERS.includes(name)) {
      return;
    }
    localStorage.setItem(WORKER_STORAGE_KEY, name);
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

  // 1. Translation API
  async translate(text: string, sourceLanguage: 'ko' | 'vi', targetLanguage: 'ko' | 'vi'): Promise<{ translated_text: string }> {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_language: sourceLanguage, target_language: targetLanguage }),
    });
    return handleResponse<{ translated_text: string }>(res);
  },

  // 2. Projects
  async getCompletedYears(): Promise<string[]> {
    const res = await fetch('/api/projects/completed-years');
    return handleResponse<string[]>(res);
  },

  async getProjects(status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE', year?: string): Promise<Project[]> {
    let url = `/api/projects?status=${status}`;
    if (year) url += `&year=${year}`;
    const res = await fetch(url);
    return handleResponse<Project[]>(res);
  },

  async getProjectDetail(id: string): Promise<{ project: Project; tasks: Task[] }> {
    const res = await fetch(`/api/projects/${id}/detail`);
    return handleResponse<{ project: Project; tasks: Task[] }>(res);
  },

  async createProject(data: Partial<Project>): Promise<{ id: string }> {
    const editor = getCurrentWorkerName();
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ ...data, editor_name: editor }),
    });
    return handleResponse<{ id: string }>(res);
  },

  async updateProject(id: string, data: Partial<Project>): Promise<{ id: string }> {
    const editor = getCurrentWorkerName();
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify({ ...data, editor_name: editor }),
    });
    return handleResponse<{ id: string }>(res);
  },

  async deleteProject(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  async completeProject(id: string): Promise<{ id: string }> {
    const editor = getCurrentWorkerName();
    const res = await fetch(`/api/projects/${id}/complete`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ editor_name: editor }),
    });
    return handleResponse<{ id: string }>(res);
  },

  async reopenProject(id: string): Promise<{ id: string }> {
    const editor = getCurrentWorkerName();
    const res = await fetch(`/api/projects/${id}/reopen`, {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ editor_name: editor }),
    });
    return handleResponse<{ id: string }>(res);
  },

  // 3. Tasks
  async createTask(data: Partial<Task>): Promise<{ id: string; project_progress: number }> {
    const editor = getCurrentWorkerName();
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: getWriteHeaders(),
      body: JSON.stringify({ ...data, editor_name: editor }),
    });
    return handleResponse<{ id: string; project_progress: number }>(res);
  },

  async updateTask(id: string, data: Partial<Task>): Promise<{ id: string; project_progress: number }> {
    const editor = getCurrentWorkerName();
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify({ ...data, editor_name: editor }),
    });
    return handleResponse<{ id: string; project_progress: number }>(res);
  },

  async deleteTask(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getWriteHeaders(),
    });
    return handleResponse<{ id: string }>(res);
  },

  // 4. Daily Status
  async updateDailyStatus(taskId: string, date: string, status: DailyStatusType): Promise<{ id: string }> {
    const editor = getCurrentWorkerName();
    const res = await fetch(`/api/tasks/${taskId}/daily-status/${date}`, {
      method: 'PUT',
      headers: getWriteHeaders(),
      body: JSON.stringify({ status, editor_name: editor }),
    });
    return handleResponse<{ id: string }>(res);
  },
};
