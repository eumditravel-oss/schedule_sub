import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrintProjectSummaryA4 } from '../PrintProjectSummaryA4';
import type { Project, Task, TaskGroup, Worker } from '../../../types';

describe('PrintProjectSummaryA4 task semantics', () => {
  it('renders PIC and Support separately and uses task planned/actual progress and status styling', () => {
    const project: Project = {
      id: 'project-print',
      name: 'Print regression project',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      progress: 7,
    };
    const task: Task = {
      id: 'task-print',
      project_id: project.id,
      task_group_id: 'group-print',
      task_name: 'Print regression task',
      worker_name: 'Minh',
      primary_worker_id: 'worker-pic',
      start_date: '2026-08-03',
      end_date: '2026-08-07',
      schedule_status: 'SCHEDULED',
      schedule_state: 'COMPLETION_REVIEW',
      progress: 7,
      planned_progress: 64,
      actual_progress: 82,
      assignees: [
        { worker_id: 'worker-pic', name: 'Minh', assignment_role: 'PRIMARY', allocation_percent: 100 },
        { worker_id: 'worker-support', name: 'An', assignment_role: 'CO_ASSIGNEE', allocation_percent: 100 },
      ],
    };
    const groups: TaskGroup[] = [{
      id: 'group-print',
      project_id: project.id,
      group_name: 'Phase 1',
      color_key: 'BLUE',
      sort_order: 1,
    }];
    const workers: Worker[] = [
      { id: 'worker-pic', name: 'Minh', is_active: 1, sort_order: 1 },
      { id: 'worker-support', name: 'An', is_active: 1, sort_order: 2 },
    ];

    const html = renderToStaticMarkup(
      <PrintProjectSummaryA4
        project={project}
        tasks={[task]}
        taskGroups={groups}
        workers={workers}
        referenceDate="2026-08-11"
      />
    );

    expect(html).toContain('data-testid="print-project-pic"');
    expect(html).toContain('data-testid="print-project-pic" class="text-slate-900">Minh</strong>');
    expect(html).toContain('data-testid="print-project-support" class="font-medium text-slate-800">An</span>');
    expect(html).not.toContain('Minh + Support 1');
    expect(html).toContain('data-testid="print-task-planned-task-print"');
    expect(html).toMatch(/data-testid="print-task-planned-task-print"[^>]*>64%<\/td>/);
    expect(html).toMatch(/data-testid="print-task-actual-task-print"[^>]*>82%<\/td>/);
    expect(html).toMatch(/data-testid="print-task-status-task-print"[^>]*style="[^"]*border-color:#FDE68A[^"]*"[^>]*>완료 확인 필요<\/span>/);
  });
});
