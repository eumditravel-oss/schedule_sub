import { describe, expect, it } from 'vitest';
import { getAdaptiveColumnPercent, getRemainingColumnPercent } from '../printLayout';

describe('print layout column sizing', () => {
  it('expands a content column within the configured bounds', () => {
    expect(getAdaptiveColumnPercent(['짧은 이름'], 22, 29)).toBe(22);
    expect(getAdaptiveColumnPercent(['매우 긴 프로젝트 이름으로 자동 너비 조정이 필요한 경우'], 22, 29)).toBeGreaterThan(22);
    expect(getAdaptiveColumnPercent(['x'.repeat(200)], 22, 29)).toBe(29);
  });

  it('keeps the fixed table total at 100 percent', () => {
    expect(getRemainingColumnPercent(73.5)).toBe(26.5);
  });
});
