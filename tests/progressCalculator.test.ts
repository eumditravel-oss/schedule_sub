// tests/progressCalculator.test.ts
import { describe, it, expect } from 'vitest';

function calculateSimpleAverageProgress(taskProgresses: number[]): number {
  if (!taskProgresses || taskProgresses.length === 0) return 0;
  const sum = taskProgresses.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / taskProgresses.length) * 10) / 10;
}

describe('Simple Average Progress Calculation', () => {
  it('calculates average correctly for 100%, 50%, 0%', () => {
    const result = calculateSimpleAverageProgress([100, 50, 0]);
    expect(result).toBe(50);
  });

  it('returns 0 for empty task list', () => {
    const result = calculateSimpleAverageProgress([]);
    expect(result).toBe(0);
  });

  it('calculates average correctly for single task', () => {
    const result = calculateSimpleAverageProgress([75]);
    expect(result).toBe(75);
  });
});
