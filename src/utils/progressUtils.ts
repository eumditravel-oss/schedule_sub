// src/utils/progressUtils.ts

export function calculateAverageProgress(taskProgresses: number[]): number {
  if (!taskProgresses || taskProgresses.length === 0) return 0;
  const sum = taskProgresses.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / taskProgresses.length) * 10) / 10;
}
