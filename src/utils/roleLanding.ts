import type { Worker } from '../types';

export type LandingRoute = '/projects' | '/dashboard';

/** Resolve the first screen from the server-resolved worker row. */
export function resolveLandingRoute(worker?: Partial<Worker> | null): LandingRoute {
  if (!worker) return '/dashboard';
  if (worker.access_role === 'VIEWER' || worker.name === 'CEO' || worker.name === 'COO') return '/projects';
  return '/dashboard';
}

export function isManagerWorker(worker?: Partial<Worker> | null): boolean {
  return Boolean(worker && worker.access_role === 'EDITOR' && Number(worker.can_manage_schedule_engine) === 1);
}
