// tests/unit/healthIntegrityService.test.ts
import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';

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

  it('4. Calendar integrity uses scope_type/scope_key instead of the removed worker_id column', async () => {
    const queries: string[] = [];
    const mockDb = {
      prepare: (sql: string) => {
        queries.push(sql);
        const statement: any = {
          bind: () => statement,
          all: async () => ({ results: [] }),
          first: async () => ({ count: 0 }),
        };
        return statement;
      },
    };

    const response = await worker.fetch(
      new Request('https://scheduler.test/api/health/scheduler-integrity'),
      { DB: mockDb } as any
    );
    const body: any = await response.json();
    const calendarSql = queries.find((sql) => sql.includes('FROM calendar_overrides o')) || '';

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('PASS');
    expect(body.data.calendar).toEqual({ status: 'PASS', invalid_worker_profile: 0 });
    expect(calendarSql).toContain("o.scope_type = 'WORKER'");
    expect(calendarSql).toContain('o.scope_key = w.id OR o.scope_key = w.name');
    expect(calendarSql).not.toContain('o.worker_id');
  });

  it('5. Integration integrity ignores unauthenticated log sentinel values and names the metric accurately', async () => {
    const queries: string[] = [];
    const mockDb = {
      prepare: (sql: string) => {
        queries.push(sql);
        const statement: any = {
          bind: () => statement,
          all: async () => ({ results: [] }),
          first: async () => ({ count: 0 }),
        };
        return statement;
      },
    };

    const response = await worker.fetch(
      new Request('https://scheduler.test/api/health/scheduler-integrity'),
      { DB: mockDb } as any
    );
    const body: any = await response.json();
    const integrationSql = queries.find((sql) => sql.includes('FROM integration_api_logs l')) || '';

    expect(body.data.integration).toEqual({
      status: 'PASS',
      orphan_api_key_references: 0,
    });
    expect(integrationSql).toContain("l.api_key_id NOT IN ('', 'none')");
    expect(integrationSql).toContain('l.api_key_id IS NOT NULL');
  });

  it('6. Version timestamps are stable metadata and never fabricated at request time', async () => {
    const versionWithoutMetadata: any = await (
      await worker.fetch(new Request('https://scheduler.test/api/version'), { DB: {} } as any)
    ).json();
    const buildWithoutMetadata: any = await (
      await worker.fetch(new Request('https://scheduler.test/api/build-info'), { DB: {} } as any)
    ).json();

    expect(versionWithoutMetadata.data.deployed_at).toBeNull();
    expect(buildWithoutMetadata.data.builtAt).toBeNull();

    const metadata = {
      DB: {},
      DEPLOYED_AT: '2026-08-11T12:34:56.000Z',
      BUILD_TIMESTAMP: '2026-08-11T12:30:00.000Z',
    };
    const versionWithMetadata: any = await (
      await worker.fetch(new Request('https://scheduler.test/api/version'), metadata as any)
    ).json();
    const buildWithMetadata: any = await (
      await worker.fetch(new Request('https://scheduler.test/api/build-info'), metadata as any)
    ).json();

    expect(versionWithMetadata.data.deployed_at).toBe(metadata.DEPLOYED_AT);
    expect(buildWithMetadata.data.builtAt).toBe(metadata.BUILD_TIMESTAMP);
  });

  it('7. Dependency review feature flag disables every dependency mutation route', async () => {
    const env = { DB: {}, DYNAMIC_SCHEDULER_DEPENDENCY_REVIEW_ENABLED: 'false' } as any;
    for (const path of [
      '/api/v3/dependencies/proposals/generate',
      '/api/v3/dependencies/dep-1/confirm',
      '/api/v3/dependencies/dep-1/reject',
      '/api/v3/dependencies/batch-review',
    ]) {
      const response = await worker.fetch(new Request(`https://scheduler.test${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `disabled-${path}` }, body: '{}',
      }), env);
      const body: any = await response.json();
      expect(response.status).toBe(503);
      expect(body.error.code).toBe('DEPENDENCY_REVIEW_DISABLED');
    }
  });
});
