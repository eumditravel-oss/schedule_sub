// src/utils/progressDisplay.ts

/**
 * Helper to safely clamp progress value between 0 and 100
 */
export function clampProgress(val: number): number {
  if (isNaN(val)) return 0;
  return Math.min(100, Math.max(0, Math.round(val)));
}

/**
 * Returns the actual progress percentage of a project or task entity.
 * Contract: Prioritizes actual_progress, fallback to progress, default to 0.
 */
export function getActualProgress(entity?: {
  actual_progress?: number | null;
  progress?: number | null;
} | null): number {
  if (!entity) return 0;
  const val = entity.actual_progress ?? entity.progress ?? 0;
  return clampProgress(val);
}

/**
 * Returns the planned progress percentage of a project or task entity.
 * Contract: Prioritizes planned_progress, fallback to progress, default to 0.
 */
export function getPlannedProgress(entity?: {
  planned_progress?: number | null;
  progress?: number | null;
} | null): number {
  if (!entity) return 0;
  const val = entity.planned_progress ?? entity.progress ?? 0;
  return clampProgress(val);
}
