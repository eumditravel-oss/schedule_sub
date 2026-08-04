// src/services/api.ts
import { ApiResponse, Project, Task, DailyStatusType } from '../types';

async function handleResponse<T>(res: Response): Promise<T> {
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    const errorMsg = json.error?.message || '요청 처리 중 오류가 발생했습니다.';
    throw new Error(errorMsg);
  }
  return json.data as T;
}

export const api = {
  // 1. Projects
  async getProjects(): Promise<Project[]> {
    const res = await fetch('/api/projects');
    return handleResponse<Project[]>(res);
  },

  async getProjectDetail(id: string): Promise<{ project: Project; tasks: Task[] }> {
    const res = await fetch(`/api/projects/${id}/detail`);
    return handleResponse<{ project: Project; tasks: Task[] }>(res);
  },

  async createProject(data: Partial<Project>): Promise<{ id: string }> {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ id: string }>(res);
  },

  async updateProject(id: string, data: Partial<Project>): Promise<{ id: string }> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ id: string }>(res);
  },

  async deleteProject(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ id: string }>(res);
  },

  // 2. Tasks
  async createTask(data: Partial<Task>): Promise<{ id: string; project_progress: number }> {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ id: string; project_progress: number }>(res);
  },

  async updateTask(id: string, data: Partial<Task>): Promise<{ id: string; project_progress: number }> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ id: string; project_progress: number }>(res);
  },

  async deleteTask(id: string): Promise<{ id: string }> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ id: string }>(res);
  },

  // 3. Daily Status
  async updateDailyStatus(taskId: string, date: string, status: DailyStatusType): Promise<{ id: string }> {
    const res = await fetch(`/api/tasks/${taskId}/daily-status/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<{ id: string }>(res);
  },
};
