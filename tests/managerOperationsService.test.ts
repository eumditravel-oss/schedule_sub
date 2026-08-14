import { describe, expect, it } from 'vitest';
import { getManagerOperations, listManagerNotifications, markManagerNotificationRead, syncManagerNotifications } from '../worker/services/managerOperationsService';

function workerRow(id: string, manager = true) {
  return { id, access_role: 'EDITOR', can_manage_schedule_engine: manager ? 1 : 0, country_code: 'VN', is_active: 1 };
}

describe('Checkpoint 5 manager operations', () => {
  it('rejects a non-manager actor', async () => {
    const db: any = { prepare: () => ({ bind: () => ({ first: async () => workerRow('wrk_03', false) }) }) };
    await expect(getManagerOperations(db, { actorEmployeeId: 'wrk_03' } as any)).rejects.toMatchObject({ code: 'MANAGER_PERMISSION_DENIED' });
  });

  it('filters notifications by the authenticated recipient', async () => {
    const db: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => workerRow(args[0] || 'wrk_01'),
          all: async () => ({ results: sql.includes('notification_events') ? [{ event_id: 'e1', recipient_employee_id: args[0] }] : [] }),
        }),
        all: async () => ({ results: [] }),
      }),
    };
    const result = await listManagerNotifications(db, { actorEmployeeId: 'wrk_01' } as any);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].recipient_employee_id).toBe('wrk_01');
  });

  it('marks only the current manager recipient', async () => {
    let args: any[] = [];
    const db: any = {
      prepare: () => ({
        bind: (...values: any[]) => {
          args = values;
          return { first: async () => workerRow('wrk_01'), run: async () => ({ meta: { changes: 1 } }) };
        },
        first: async () => workerRow('wrk_01'),
      }),
    };
    await markManagerNotificationRead(db, { actorEmployeeId: 'wrk_01' } as any, 'e1');
    expect(args).toEqual(['e1', 'wrk_01']);
  });

  it('treats a missing daily worklog as pending instead of crashing the dashboard', async () => {
    const db: any = {
      prepare: (sql: string) => {
        const result = sql.includes('COUNT(*)') ? { count: 0 } : workerRow('wrk_01');
        return {
          bind: () => ({
            first: async () => result,
            all: async () => ({ results: sql.includes('SELECT id,name,country_code') ? [workerRow('wrk_01')] : [] }),
          }),
          first: async () => result,
          all: async () => ({ results: sql.includes('SELECT id,name,country_code') ? [workerRow('wrk_01')] : [] }),
        };
      },
    };
    const snapshot = await getManagerOperations(db, { actorEmployeeId: 'wrk_01' } as any, '2026-08-14');
    expect(snapshot.employees).toHaveLength(1);
    expect(snapshot.employees[0].morning).toBe('PENDING');
    expect(snapshot.employees[0].eod).toBe('PENDING');
  });

  it('reuses the persisted event for duplicate notification sync recipients', async () => {
    const batches: Array<Array<{ sql: string; args: any[] }>> = [];
    const prepared: Array<{ sql: string; args: any[] }> = [];
    const summary = {
      impact_summary_id: 'impact_01',
      tasks_advanced_count: 0,
      tasks_delayed_count: 1,
      approval_required: 0,
      cross_project_impact: 0,
      run_id: 'run_01',
      source_worklog_id: 'wl_01',
      source_revision_id: 'rev_01',
      employee_id: 'wrk_02',
      primary_project_id: 'prj_01',
    };
    const db: any = {
      prepare: (sql: string) => {
        const statement = { sql, args: [] as any[] };
        prepared.push(statement);
        const all = async () => {
          if (sql.includes('FROM shadow_impact_summaries')) return { results: [summary] };
          if (sql.includes('JOIN notification_subscriptions')) return { results: [{ id: 'wrk_01' }] };
          return { results: [] };
        };
        return {
          bind: (...args: any[]) => {
            statement.args = args;
            return { all, first: async () => null, run: async () => ({ meta: { changes: 0 } }) };
          },
          all,
        };
      },
      batch: async (statements: Array<{ sql: string; args: any[] }>) => {
        batches.push(statements);
        // Simulate the dedupe-key conflict that formerly made child inserts
        // reference an unpersisted random event id.
        return statements.map((_, index) => ({ meta: { changes: index === 0 ? 0 : 1 } }));
      },
    };

    await expect(syncManagerNotifications(db, { localDate: '2026-08-14' })).resolves.toEqual({ created: 0, date: '2026-08-14' });
    expect(batches).toHaveLength(1);
    const recipient = prepared.find((statement) => statement.sql.includes('INSERT OR IGNORE INTO notification_recipients'));
    expect(recipient?.sql).toContain('SELECT event_id, ? FROM notification_events WHERE dedupe_key=?');
    expect(recipient?.args).toEqual(['wrk_01', 'SCHEDULE_DELAYED:wl_01:rev_01:run_01']);
  });
});
