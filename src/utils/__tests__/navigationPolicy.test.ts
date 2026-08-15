import { describe, expect, it } from 'vitest';
import { isProjectBoardRoute, isSchedulerRoute, primaryNavigationForWorker } from '../navigationPolicy';

describe('project board and scheduler navigation policy', () => {
  it('keeps Scheduler directly after Worklog for editable employees', () => {
    expect(primaryNavigationForWorker({ access_role: 'EDITOR', name: 'Employee' })).toEqual(['dashboard', 'project-board', 'worklog', 'scheduler', 'reports']);
  });

  it('adds operations only to manager navigation', () => {
    expect(primaryNavigationForWorker({ access_role: 'EDITOR', can_manage_schedule_engine: 1 })).toEqual(['dashboard', 'project-board', 'worklog', 'scheduler', 'reports', 'operations']);
  });

  it('keeps executive landing read-only without personal Dashboard or Worklog', () => {
    expect(primaryNavigationForWorker({ access_role: 'VIEWER', name: 'CEO' })).toEqual(['project-board', 'scheduler', 'reports']);
  });

  it('does not treat /projects as the Project Board route', () => {
    expect(isProjectBoardRoute('/project-board')).toBe(true);
    expect(isProjectBoardRoute('/project-board/prj_1')).toBe(true);
    expect(isProjectBoardRoute('/projects')).toBe(false);
    expect(isSchedulerRoute('/projects')).toBe(true);
    expect(isSchedulerRoute('/projects/prj_1/schedule-control')).toBe(true);
  });
});
