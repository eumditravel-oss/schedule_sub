import { describe, expect, it } from 'vitest';
import { selectProjectShadowView } from '../src/pages/ShadowSchedulePage';

describe('Shadow project context selection', () => {
  const shadow: any = {
    versions: [
      { shadow_version_id: 'sv-a', project_id: 'project-a', status: 'CURRENT' },
      { shadow_version_id: 'sv-b', project_id: 'project-b', status: 'STALE' },
    ],
    tasks: [
      { shadow_task_id: 'st-a', shadow_version_id: 'sv-a', project_id: 'project-a', task_id: 'task-a' },
      { shadow_task_id: 'st-b', shadow_version_id: 'sv-b', project_id: 'project-b', task_id: 'task-b' },
    ],
    allocations: [
      { shadow_version_id: 'sv-a', project_id: 'project-a', task_id: 'task-a' },
      { shadow_version_id: 'sv-b', project_id: 'project-b', task_id: 'task-b' },
    ],
    impacts: [
      { primary_project_id: 'project-a', task_advanced_count: 1 },
      { primary_project_id: 'project-b', task_advanced_count: 2 },
    ],
    diffs: [
      { shadow_version_id: 'sv-a', project_id: 'project-a', task_id: 'task-a' },
      { shadow_version_id: 'sv-b', project_id: 'project-b', task_id: 'task-b' },
    ],
  };

  it('keeps task, allocation, impact and diff data inside the selected project version', () => {
    const view = selectProjectShadowView(shadow, 'project-a');
    expect(view.projectVersion?.shadow_version_id).toBe('sv-a');
    expect(view.tasks.map((row) => row.task_id)).toEqual(['task-a']);
    expect(view.allocations.map((row: any) => row.task_id)).toEqual(['task-a']);
    expect(view.impacts.map((row: any) => row.primary_project_id)).toEqual(['project-a']);
    expect(view.diffs.map((row: any) => row.task_id)).toEqual(['task-a']);
  });

  it('returns an empty project view when the selected project has no version or tasks', () => {
    const view = selectProjectShadowView(shadow, 'project-missing');
    expect(view.projectVersion).toBeNull();
    expect(view.tasks).toEqual([]);
    expect(view.allocations).toEqual([]);
    expect(view.impacts).toEqual([]);
    expect(view.diffs).toEqual([]);
  });

  it('does not expose stale task bars as a current candidate', () => {
    const view = selectProjectShadowView(shadow, 'project-b');
    expect(view.projectVersion?.status).toBe('STALE');
    expect(view.tasks).toEqual([]);
    expect(view.allocations).toEqual([]);
    expect(view.diffs).toEqual([]);
    expect(view.impacts.map((row: any) => row.primary_project_id)).toEqual(['project-b']);
  });
});
