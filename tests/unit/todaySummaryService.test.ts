// tests/unit/todaySummaryService.test.ts
import { describe, it, expect } from 'vitest';
import { getTodayDashboardSummaryServer } from '../../worker/services/todaySummaryService';

describe('Today Summary Monthly Completion KPI Suite (todaySummaryService.ts)', () => {
  const mockDb = () => {
    const projects = [
      { id: 'p_active', status: 'ACTIVE', completed_at: null, end_date: '2026-08-31' },
      { id: 'p_july', status: 'COMPLETED', completed_at: '2026-07-31', end_date: '2026-08-10' },
      { id: 'p_aug1', status: 'COMPLETED', completed_at: '2026-08-01', end_date: '2026-07-01' },
      { id: 'p_aug15', status: 'COMPLETED', completed_at: '2026-08-15T12:34:56.000Z', end_date: '2026-09-01' },
      { id: 'p_sept1', status: 'COMPLETED', completed_at: '2026-09-01', end_date: '2026-08-20' },
      { id: 'p_null_completed', status: 'COMPLETED', completed_at: null, end_date: '2026-08-25' },
    ];

    const queries: string[] = [];

    const db = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          all: async () => {
            queries.push(sql);
            if (sql.includes("WHERE status = 'COMPLETED'")) {
              const monthStart = args[0];
              const nextMonthStart = args[1];
              const results = projects.filter(
                (p) =>
                  p.status === 'COMPLETED' &&
                  p.end_date !== null &&
                  p.end_date >= monthStart &&
                  p.end_date < nextMonthStart
              );
              return { results };
            }
            if (sql.includes("WHERE status = 'ACTIVE'") || sql.includes("WHERE status != 'COMPLETED'")) {
              return { results: projects.filter((p) => p.status === 'ACTIVE') };
            }
            return { results: [] };
          },
          first: async () => {
            return { count: 0 };
          },
        }),
        all: async () => {
          queries.push(sql);
          if (sql.includes("WHERE status = 'ACTIVE'")) {
            return { results: projects.filter((p) => p.status === 'ACTIVE') };
          }
          return { results: [] };
        },
      }),
    };

    return { db, queries };
  };

  it('1. Business month boundary filtering: counts completed projects whose end date is in current month', async () => {
    const { db } = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-08');

    expect(result.completed_this_month.count).toBe(3);
    expect(result.completed_this_month.project_ids).toEqual(['p_july', 'p_sept1', 'p_null_completed']);
  });

  it('2. Excludes projects whose scheduled end date is outside the business month', async () => {
    const { db } = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-08');

    expect(result.completed_this_month.project_ids).not.toContain('p_aug1');
    expect(result.completed_this_month.project_ids).not.toContain('p_aug15');
  });

  it('3. Korean Business Date boundary: 2026-08-01 00:00 KST belongs to August', async () => {
    const { db } = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-01');

    expect(result.completed_this_month.count).toBe(3);
  });

  it('4. Uses scheduled end_date rather than the operator completion timestamp', async () => {
    const { db, queries } = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-08');
    const monthlySql = queries.find((sql) => sql.includes("WHERE status = 'COMPLETED'")) || '';

    expect(result.completed_this_month.project_ids).toEqual(['p_july', 'p_sept1', 'p_null_completed']);
    expect(monthlySql).toContain('end_date IS NOT NULL');
    expect(monthlySql).not.toContain('substr(completed_at, 1, 10)');
  });

  it('5. Project-based KPI payloads expose project_ids rather than misleading task_ids', async () => {
    const { db } = mockDb();
    const result = await getTodayDashboardSummaryServer(db, '2026-08-08');

    expect(result.scheduled_today.project_ids).toEqual(['p_active']);
    expect(result.in_progress.project_ids).toEqual(['p_active']);
    expect(result.completed_today.project_ids).toEqual([]);
    expect(result.scheduled_today).not.toHaveProperty('task_ids');
    expect(result.in_progress).not.toHaveProperty('task_ids');
    expect(result.completed_today).not.toHaveProperty('task_ids');
  });
});
