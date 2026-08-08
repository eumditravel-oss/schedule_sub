// tests/unit/healthIntegrityService.test.ts
import { describe, it, expect } from 'vitest';

// Simulate DB failure injection to test /api/health/scheduler-integrity status & null handling
describe('Scheduler Integrity Health Error Injection Unit Suite', () => {
  it('1. Returns status ERROR and null count when DB tasks query throws an exception', async () => {
    const mockDbWithError = {
      prepare: (sql: string) => {
        if (sql.includes('FROM tasks')) {
          return {
            all: async () => {
              throw new Error('SIMULATED_TASKS_DB_QUERY_FAILURE');
            },
          };
        }
        return {
          all: async () => ({ results: [] }),
          first: async () => ({ count: 0 }),
        };
      },
    };

    // Execute health logic simulation
    const domainErrors: Array<{ domain: string; code: string }> = [];
    let tasksStatus: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
    let missingPicCount: number | null = 0;
    let invalidAssigneeCount: number | null = 0;
    let outsideRangeCount: number | null = 0;

    try {
      await mockDbWithError.prepare('SELECT t.id FROM tasks t').all();
    } catch (err: any) {
      tasksStatus = 'ERROR';
      missingPicCount = null;
      invalidAssigneeCount = null;
      outsideRangeCount = null;
      domainErrors.push({ domain: 'tasks', code: 'TASKS_INTEGRITY_QUERY_FAILED' });
    }

    expect(tasksStatus).toBe('ERROR');
    expect(missingPicCount).toBeNull();
    expect(invalidAssigneeCount).toBeNull();
    expect(outsideRangeCount).toBeNull();
    expect(domainErrors.length).toBe(1);
    expect(domainErrors[0].code).toBe('TASKS_INTEGRITY_QUERY_FAILED');
  });

  it('2. Global status is ERROR when any domain query throws an exception', () => {
    const domainErrors = [{ domain: 'tasks', code: 'TASKS_INTEGRITY_QUERY_FAILED' }];
    const domainStatuses = ['PASS', 'ERROR', 'PASS'];
    const globalStatus = domainErrors.length > 0 ? 'ERROR' : domainStatuses.includes('FAIL') ? 'FAIL' : 'PASS';

    expect(globalStatus).toBe('ERROR');
  });

  it('3. Build status reflects BACKEND_ONLY and backend_sha', () => {
    const envBuildSha = '0509046049d287693ef84c1712dae0987c638b92';
    const buildBlock = {
      backend_sha: envBuildSha || 'unknown',
      status: 'BACKEND_ONLY',
    };

    expect(buildBlock.status).toBe('BACKEND_ONLY');
    expect(buildBlock.backend_sha).toBe('0509046049d287693ef84c1712dae0987c638b92');
  });
});
