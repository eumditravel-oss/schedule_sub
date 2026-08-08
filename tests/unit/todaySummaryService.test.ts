// tests/unit/todaySummaryService.test.ts
import { describe, it, expect } from 'vitest';
import { getTodayDashboardSummaryServer } from '../../worker/services/todaySummaryService';

describe('Today Summary Monthly Completion KPI Suite (todaySummaryService.ts)', () => {
  const mockDb = () => {
    const projects = [
      { id: 'p_active', status: 'ACTIVE', completed_at: null },
      { id: 'p_july', status: 'COMPLETED', completed_at: '2026-07-31' },
      { id: 'p_aug1', status: 'COMPLETED', completed_at: '2026-08-01' },
      { id: 'p_aug15', status: 'COMPLETED', completed_at: '2026-08-15' },
      { id: 'p_sept1', status: 'COMPLETED', completed_at: '2026-09-01' },
      { id: 'p_null_completed', status: 'COMPLETED', completed_at: null },
    ];

    return {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          all: async () => {
            if (sql.includes("WHERE status = 'COMPLETED'")) {
              const monthStart = args[0];
              const nextMonthStart = args[1];
              const results = projects.filter(
                (p) =>
                  p.status === 'COMPLETED' &&
                  p.completed_at !== null &&
                  p.completed_at >= monthStart &&
                  p.completed_at < nextMonthStart
              );
              return { results };
            }
            if (sql.includes("WHERE status = 'ACTIVE'")) {
              return { results: projects.filter((p) => p.status === 'ACTIVE') };
            }
            return { results: [] };
          },
          first: async () => {
            return { count: 0 };
          },
        }),
        all: async () => {
          if (sql.includes("WHERE status = 'ACTIVE'")) {
            return { results: projects.filter((p) => p.status === 'ACTIVE') };
          }
          return { results: [] };
        },
      }),
    };
  };

  it('1. Business month boundary filtering: counts only projects completed in current month (2026-08)', async () => {
    const db = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-08');

    expect(result.completed_this_month.count).toBe(2);
    expect(result.completed_this_month.project_ids).toEqual(['p_aug1', 'p_aug15']);
  });

  it('2. Excludes projects with completed_at in previous/next month and completed_at = NULL', async () => {
    const db = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-08');

    expect(result.completed_this_month.project_ids).not.toContain('p_july');
    expect(result.completed_this_month.project_ids).not.toContain('p_sept1');
    expect(result.completed_this_month.project_ids).not.toContain('p_null_completed');
  });

  it('3. Korean Business Date boundary: 2026-08-01 00:00 KST belongs to August', async () => {
    const db = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-01');

    expect(result.completed_this_month.count).toBe(2);
  });
});
