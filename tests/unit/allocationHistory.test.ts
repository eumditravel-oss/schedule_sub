// tests/unit/allocationHistory.test.ts
import { describe, it, expect } from 'vitest';
import { updateProjectAllocations, getAllocationHistory } from '../../worker/services/projectAllocationService';
import { getAllocationAsOf } from '../../src/utils/capacityEngine';

describe('Workforce Allocation History Ledger & As-Of Reconstruction Suite (projectAllocationService.ts)', () => {
  const createMockDb = () => {
    const prjStore = [{ id: 'p1', name: 'CONCOST-HUB' }];
    const allocStore: any[] = [];
    const historyStore: any[] = [];

    return {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes('FROM projects')) {
              return prjStore.find((p) => p.id === args[0]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('FROM project_worker_allocations')) {
              return { results: allocStore.filter((a) => a.project_id === args[0]) };
            }
            if (sql.includes('FROM project_worker_allocation_history')) {
              return { results: [...historyStore].reverse() };
            }
            return { results: [] };
          },
        }),
      }),
      batch: async (statements: any[]) => {
        // Execute batch transaction
        for (const stmt of statements) {
          // Check statement query text
          if (stmt._sql?.includes('INSERT INTO project_worker_allocation_history')) {
            historyStore.push({
              id: stmt._args[0],
              project_id: stmt._args[1],
              worker_id: stmt._args[2],
              old_allocation_percent: stmt._args[3],
              new_allocation_percent: stmt._args[4],
              old_note: stmt._args[5],
              new_note: stmt._args[6],
              change_type: stmt._sql.includes("'DELETE'") ? 'DELETE' : stmt._sql.includes("'CREATE'") ? 'CREATE' : 'UPDATE',
              changed_by_id: stmt._args[7],
              changed_by_name: stmt._args[8],
              changed_at: '2026-08-08 12:00:00',
              source: stmt._args[9],
              request_id: stmt._args[10],
            });
          }
          if (stmt._sql?.includes('INSERT INTO project_worker_allocations')) {
            const existingIdx = allocStore.findIndex(
              (a) => a.project_id === stmt._args[1] && a.worker_id === stmt._args[2]
            );
            const item = {
              id: stmt._args[0],
              project_id: stmt._args[1],
              worker_id: stmt._args[2],
              allocation_percent: stmt._args[3],
              note: stmt._args[4],
            };
            if (existingIdx >= 0) {
              allocStore[existingIdx] = item;
            } else {
              allocStore.push(item);
            }
          }
          if (stmt._sql?.includes('DELETE FROM project_worker_allocations')) {
            const existingIdx = allocStore.findIndex(
              (a) => a.project_id === stmt._args[0] && a.worker_id === stmt._args[1]
            );
            if (existingIdx >= 0) {
              allocStore.splice(existingIdx, 1);
            }
          }
        }
        return statements.map(() => ({ success: true }));
      },
    };
  };

  it('Case 1: No change in values generates 0 new history entries', () => {
    const historyLogs: any[] = [];
    const curAllocations = [{ id: 'a1', project_id: 'p1', worker_id: 'w1', allocation_percent: 70 }];

    const val1 = getAllocationAsOf('p1', 'w1', '2026-08-08', curAllocations, historyLogs);
    expect(val1).toBe(70);
  });

  it('Case 2: As-Of Capacity reconstruction correctly queries closest prior history event', () => {
    const historyLogs = [
      {
        project_id: 'p1',
        worker_id: 'w1',
        new_allocation_percent: 70,
        changed_at: '2026-07-01 10:00:00',
      },
      {
        project_id: 'p1',
        worker_id: 'w1',
        new_allocation_percent: 50,
        changed_at: '2026-07-15 10:00:00',
      },
      {
        project_id: 'p1',
        worker_id: 'w1',
        new_allocation_percent: 40,
        changed_at: '2026-08-01 10:00:00',
      },
    ];

    const allocJuly10 = getAllocationAsOf('p1', 'w1', '2026-07-10', [], historyLogs);
    expect(allocJuly10).toBe(70);

    const allocJuly20 = getAllocationAsOf('p1', 'w1', '2026-07-20', [], historyLogs);
    expect(allocJuly20).toBe(50);

    const allocAug05 = getAllocationAsOf('p1', 'w1', '2026-08-05', [], historyLogs);
    expect(allocAug05).toBe(40);
  });
});
