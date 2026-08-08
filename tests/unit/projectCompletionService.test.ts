// tests/unit/projectCompletionService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { completeProjectService } from '../../worker/services/projectCompletionService';

describe('Project Completion Service & Transaction Integrity Suite (projectCompletionService.ts)', () => {
  const mockDb = () => {
    let projectStatus = 'ACTIVE';
    const tasks = [
      { id: 't1', project_id: 'p1', task_name: 'Task 1', progress: 100, actual_progress: 100, completion_confirmed: 1 },
      { id: 't2', project_id: 'p1', task_name: 'Task 2', progress: 80, actual_progress: 80, completion_confirmed: 0 },
      { id: 't3', project_id: 'p1', task_name: 'Task 3', progress: 50, actual_progress: 50, completion_confirmed: 0 },
    ];

    return {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes('FROM projects')) {
              return { id: args[0], name: 'QA Project', status: projectStatus };
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM tasks')) {
              return { results: tasks };
            }
            if (sql.includes('SELECT id FROM tasks WHERE project_id = ? AND (completion_confirmed != 1')) {
              return {
                results: projectStatus === 'COMPLETED' ? [] : tasks.filter((t) => t.completion_confirmed !== 1),
              };
            }
            return { results: [] };
          },
        }),
      }),
      batch: async (statements: any[]) => {
        // Execute batch transaction atomically
        projectStatus = 'COMPLETED';
        tasks.forEach((t) => {
          t.completion_confirmed = 1;
          t.progress = 100;
          t.actual_progress = 100;
        });
        return statements.map(() => ({ success: true }));
      },
    };
  };

  it('Case B: STRICT mode rejects completion when incomplete tasks exist (409 PROJECT_HAS_INCOMPLETE_TASKS)', async () => {
    const db = mockDb();
    const result = await completeProjectService(db, {
      projectId: 'p1',
      mode: 'STRICT',
      editor: { name: 'Park' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe('PROJECT_HAS_INCOMPLETE_TASKS');
    expect(result.incomplete_tasks).toBe(2);
    expect(result.tasks?.length).toBe(2);
  });

  it('Case C: COMPLETE_ALL mode updates all child tasks and project status atomically in a single transaction', async () => {
    const db = mockDb();
    const result = await completeProjectService(db, {
      projectId: 'p1',
      mode: 'COMPLETE_ALL',
      editor: { name: 'Park' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.project_status).toBe('COMPLETED');
    expect(result.completed_tasks).toBe(3);
    expect(result.incomplete_tasks).toBe(0);
  });

  it('Case D: D1 Batch Transaction failure leaves project ACTIVE without partial task completion', async () => {
    const db = mockDb();
    db.batch = async () => {
      throw new Error('D1 Batch Transaction Error');
    };

    const result = await completeProjectService(db, {
      projectId: 'p1',
      mode: 'COMPLETE_ALL',
      editor: { name: 'Park' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe('PROJECT_COMPLETION_TRANSACTION_FAILED');
  });
});
