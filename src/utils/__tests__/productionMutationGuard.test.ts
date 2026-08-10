// src/utils/__tests__/productionMutationGuard.test.ts
import { describe, it, expect } from 'vitest';
import { assertMutationSafety } from '../../../tests/e2e/productionMutationGuard';

describe('Production Mutation Guard Safety Test Suite', () => {
  it('CASE A: Allows localhost / 127.0.0.1 target URLs', () => {
    expect(() => assertMutationSafety('http://localhost:5173', 'task-create')).not.toThrow();
    expect(() => assertMutationSafety('http://127.0.0.1:4179', 'task-update')).not.toThrow();
  });

  it('CASE B: Allows QA environment target URLs', () => {
    expect(() => assertMutationSafety('https://concost-dev-scheduler-qa.eumditravel.workers.dev', 'holiday-save')).not.toThrow();
  });

  it('CASE C: Throws PRODUCTION_MUTATION_TEST_BLOCKED for base Production URL', () => {
    expect(() => assertMutationSafety('https://concost-dev-scheduler.eumditravel.workers.dev', 'task-delete'))
      .toThrow('PRODUCTION_MUTATION_TEST_BLOCKED');
  });

  it('CASE D: Throws PRODUCTION_MUTATION_TEST_BLOCKED for Production URL with path/query', () => {
    expect(() => assertMutationSafety('https://concost-dev-scheduler.eumditravel.workers.dev/api/projects?status=ACTIVE', 'project-complete'))
      .toThrow('PRODUCTION_MUTATION_TEST_BLOCKED');
  });
});
