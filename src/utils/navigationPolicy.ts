import type { Worker } from '../types';

export type PrimaryNavigationKey = 'dashboard' | 'project-board' | 'worklog' | 'scheduler' | 'reports' | 'operations';

export function primaryNavigationForWorker(worker?: Partial<Worker> | null): PrimaryNavigationKey[] {
  const viewer = worker?.access_role === 'VIEWER' || worker?.name === 'CEO' || worker?.name === 'COO';
  const manager = worker?.access_role === 'EDITOR' && Number(worker?.can_manage_schedule_engine) === 1;
  if (viewer) return ['project-board', 'scheduler', 'reports'];
  return [...(manager ? ['dashboard' as const] : ['dashboard' as const]), 'project-board', 'worklog', 'scheduler', 'reports', ...(manager ? ['operations' as const] : [])];
}

export function isProjectBoardRoute(pathname: string): boolean {
  return pathname === '/project-board' || pathname.startsWith('/project-board/');
}

export function isSchedulerRoute(pathname: string): boolean {
  return pathname === '/projects' || pathname.startsWith('/projects/');
}
