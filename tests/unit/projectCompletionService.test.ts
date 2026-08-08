// tests/unit/projectCompletionService.test.ts
import { describe, it, expect } from 'vitest';
import { completeProjectService } from '../../worker/services/projectCompletionService';

describe('Project Completion Service & Transaction Integrity Suite (projectCompletionService.ts)', () => {
  const mockDb = (initialStatus = 'ACTIVE') => {
    let projectStatus = initialStatus;
    let completedAt: string | null = initialStatus === 'COMPLETED' ? '2026-07-15' : null;
    const tasks = [
      { id: 't1', project_id: 'p1', task_name: 'Task 1', progress: 100, actual_progress: 100, completion_confirmed: 1 },
      { id: 't2', project_id: 'p1', task_name: 'Task 2', progress: 80, actual_progress: 80, completion_confirmed: 0 },
      { id: 't3', project_id: 'p1', task_name: 'Task 3', progress: 50, actual_progress: 50, completion_confirmed: 0 },
    ];

    return {
      getCompletedAt: () => completedAt,
      getProjectStatus: () => projectStatus,
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes('FROM projects')) {
              return { id: args[0], name: 'QA Project', status: projectStatus, completed_at: completedAt, start_date: '2026-07-01' };
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
        if (projectStatus === 'ACTIVE') {
          projectStatus = 'COMPLETED';
          completedAt = '2026-08-05';
        }
        tasks.forEach((t) => {
          t.completion_confirmed = 1;
          t.progress = 100;
          t.actual_progress = 100;
        });
        return statements.map(() => ({ success: true }));
      },
    };
  };

  it('1. STRICT mode rejects completion when incomplete tasks exist (409 PROJECT_HAS_INCOMPLETE_TASKS)', async () => {
    const db = mockDb('ACTIVE');
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

  it('2. COMPLETE_ALL mode updates child tasks and project status atomically with explicit completedDate', async () => {
    const db = mockDb('ACTIVE');
    const result = await completeProjectService(db, {
      projectId: 'p1',
      mode: 'COMPLETE_ALL',
      completedDate: '2026-08-05',
      editor: { name: 'Park' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.project_status).toBe('COMPLETED');
    expect(db.getCompletedAt()).toBe('2026-08-05');
  });

  it('3. REPAIR mode rejects ACTIVE project with HTTP 409 (PROJECT_REPAIR_REQUIRES_COMPLETED_STATUS)', async () => {
    const db = mockDb('ACTIVE');
    const result = await completeProjectService(db, {
      projectId: 'p1',
      mode: 'REPAIR',
      editor: { name: 'Park' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe('PROJECT_REPAIR_REQUIRES_COMPLETED_STATUS');
  });

  it('4. REPAIR mode on COMPLETED project repairs child tasks without altering completed_at date', async () => {
    const db = mockDb('COMPLETED');
    const result = await completeProjectService(db, {
      projectId: 'p1',
      mode: 'REPAIR',
      editor: { name: 'Park' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(db.getCompletedAt()).toBe('2026-07-15'); // Kept original completed_at!
  });
});
