// tests/unit/taskAllocationPercentFallback.test.ts
import { describe, it, expect } from 'vitest';

function resolveAllocationPercent(value: any): number {
  return value == null ? 100 : Number(value);
}

describe('Task Allocation Percent Fallback Unit Suite (Phase 2)', () => {
  it('1. null maps to 100 (legacy default fallback)', () => {
    expect(resolveAllocationPercent(null)).toBe(100);
  });

  it('2. undefined maps to 100 (legacy default fallback)', () => {
    expect(resolveAllocationPercent(undefined)).toBe(100);
  });

  it('3. 0 maps strictly to 0 (preserves explicit 0%)', () => {
    expect(resolveAllocationPercent(0)).toBe(0);
    expect(resolveAllocationPercent('0')).toBe(0);
  });

  it('4. 25 maps strictly to 25', () => {
    expect(resolveAllocationPercent(25)).toBe(25);
  });

  it('5. 100 maps strictly to 100', () => {
    expect(resolveAllocationPercent(100)).toBe(100);
  });
});
