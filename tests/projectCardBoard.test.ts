import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveBoardColumn } from '../worker/services/projectCardBoardService';

describe('V3.1 Project Board server derivation', () => {
  const base = { referenceDate: '2026-08-15', scheduleState: 'UPCOMING', hasOfficialForecast: false, approvedActualMinutes: 0, hasConfirmedActual: false };
  it('derives pre-work without client-side lifecycle inference', () => expect(deriveBoardColumn(base)).toBe('PRE_WORK'));
  it('derives in-progress once confirmed actual exists', () => expect(deriveBoardColumn({ ...base, hasOfficialForecast: true, scheduleState: 'IN_PROGRESS', hasConfirmedActual: true })).toBe('IN_PROGRESS'));
  it('derives completed from official project status', () => expect(deriveBoardColumn({ ...base, status: 'COMPLETED', hasOfficialForecast: true })).toBe('COMPLETED'));
  it('keeps an active project revision in the revision lane', () => expect(deriveBoardColumn({ ...base, status: 'REVISION_REQUESTED', scheduleState: 'IN_PROGRESS', hasOfficialForecast: true, hasConfirmedActual: true })).toBe('REVISION'));
  it('uses active post-completion revision before completed status', () => expect(deriveBoardColumn({ ...base, status: 'COMPLETED', revisionCount: 1, revisionState: 'ACTIVE', hasOfficialForecast: true })).toBe('REVISION'));
  it('does not treat a delayed badge as a separate lane', () => expect(deriveBoardColumn({ ...base, status: 'ACTIVE', scheduleState: 'DELAYED', hasOfficialForecast: true, hasConfirmedActual: true })).toBe('IN_PROGRESS'));
});

describe('V3.1 Project Board visual contract', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/pages/ProjectCardBoardPage.tsx'), 'utf8');
  it('renders four lanes, compact cards, drawer and mobile lane tabs', () => {
    expect(page).toContain("PRE_WORK"); expect(page).toContain("IN_PROGRESS"); expect(page).toContain("COMPLETED"); expect(page).toContain("REVISION");
    expect(page).toContain('project-board-task-drawer'); expect(page).toContain('project-board-mobile-lane-content');
    expect(page).toContain('max-h-[calc(100vh-260px)]'); expect(page).toContain('md:grid-cols-2 xl:grid-cols-4');
  });
  it('keeps Scheduler and Worklog links scoped to the exact project and task', () => {
    expect(page).toContain('/worklog/today?projectId='); expect(page).toContain('/projects/${encodeURIComponent(task.project_id)}?taskId=');
  });
  it('reuses the existing ProjectModal creation flow and does not expose drag mutation', () => {
    expect(page).toContain('<ProjectModal'); expect(page).toContain('api.createProject(data)'); expect(page).not.toContain('draggable'); expect(page).not.toContain('onDrop');
  });
});
