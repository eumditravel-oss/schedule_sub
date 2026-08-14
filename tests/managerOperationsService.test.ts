import { describe, expect, it } from 'vitest';
import { getManagerOperations, listManagerNotifications, markManagerNotificationRead } from '../worker/services/managerOperationsService';

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
});
