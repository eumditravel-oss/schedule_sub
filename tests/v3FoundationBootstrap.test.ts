import { describe, expect, it } from 'vitest';
import { classifyLegacyBootstrapTask } from '../worker/services/v3FoundationService';

const base = {
  cutoverDate: '2026-08-11',
  proposedEffortMinutes: 2400,
  progressMode: 'AUTO_TIME',
  completionConfirmed: 0,
  projectStatus: 'ACTIVE',
};

describe('V3 Legacy Bootstrap deterministic rules', () => {
  it('Rule A converts a past legacy AUTO_TIME result into labeled migration completion', () => {
    const result = classifyLegacyBootstrapTask({
      ...base,
      baselineStartDate: '2026-08-03',
      baselineEndDate: '2026-08-07',
      storedProgress: 0,
    });

    expect(result.bootstrapRule).toBe('RULE_A');
    expect(result.legacyProgressSource).toBe('AUTO_TIME');
    expect(result.bootstrapProgress).toBe(100);
    expect(result.remainingEffortMinutes).toBe(0);
    expect(result.sourceDetail).toBe('LEGACY_ASSUMED_COMPLETE');
    expect(result.createsCompletionEvent).toBe(true);
  });

  it('Rule B preserves explicit partial legacy progress and flags manager review', () => {
    const result = classifyLegacyBootstrapTask({
      ...base,
      baselineStartDate: '2026-08-03',
      baselineEndDate: '2026-08-07',
      storedProgress: 70,
    });

    expect(result.bootstrapRule).toBe('RULE_B');
    expect(result.legacyProgressSource).toBe('UNKNOWN');
    expect(result.bootstrapProgress).toBe(70);
    expect(result.remainingEffortMinutes).toBe(720);
    expect(result.exceptionCode).toBe('OVERDUE_ADMIN_REVIEW');
    expect(result.createsCompletionEvent).toBe(false);
  });

  it('Rule C preserves a spanning Task actual and proposes remaining effort', () => {
    const result = classifyLegacyBootstrapTask({
      ...base,
      baselineStartDate: '2026-08-05',
      baselineEndDate: '2026-08-20',
      storedProgress: 30,
    });

    expect(result.bootstrapRule).toBe('RULE_C');
    expect(result.bootstrapProgress).toBe(30);
    expect(result.remainingEffortMinutes).toBe(1680);
    expect(result.assumedActualEndDate).toBeNull();
  });

  it('Rule D initializes a future Task with zero actual and baseline forecast', () => {
    const result = classifyLegacyBootstrapTask({
      ...base,
      baselineStartDate: '2026-09-01',
      baselineEndDate: '2026-09-05',
      storedProgress: 80,
    });

    expect(result.bootstrapRule).toBe('RULE_D');
    expect(result.legacyProgressSource).toBe('SYSTEM');
    expect(result.bootstrapProgress).toBe(0);
    expect(result.remainingEffortMinutes).toBe(2400);
  });

  it('preserves an explicit legacy completion without relying on date passage', () => {
    const result = classifyLegacyBootstrapTask({
      ...base,
      baselineStartDate: '2026-08-03',
      baselineEndDate: '2026-08-07',
      storedProgress: 100,
      completionConfirmed: 1,
      explicitCompletionDate: '2026-08-06',
    });

    expect(result.bootstrapProgress).toBe(100);
    expect(result.assumedActualEndDate).toBe('2026-08-06');
    expect(result.legacyProgressSource).toBe('SYSTEM');
  });
});
