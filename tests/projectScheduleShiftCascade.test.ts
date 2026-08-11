// tests/projectScheduleShiftCascade.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { differenceInPureCalendarDays, addPureCalendarDays } from '../src/utils/dateUtils';

const BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
const QA_PREFIX = `[QA-SHIFT-${Date.now()}]`;

describe('Project Schedule Cascade Shifting & Integrity Suite', { timeout: 30000 }, () => {
  let projectId = '';
  let taskAId = '';
  let taskBId = '';

  beforeAll(async () => {
    // 1. Create initial project (2026-08-06 ~ 2026-08-31)
    const prjRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${QA_PREFIX} 프로젝트 일정 자동 이동`,
        start_date: '2026-08-06',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    const prjJson: any = await prjRes.json();
    projectId = prjJson.data.id;

    // 2. Create Task A (2026-08-08 ~ 2026-08-12, progress 25)
    const taskARes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        worker_name: '박용진 수석',
        task_name: '작업 A',
        start_date: '2026-08-08',
        end_date: '2026-08-12',
        progress: 25,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    const taskAJson: any = await taskARes.json();
    taskAId = taskAJson.data.id;

    // 3. Create Task B (2026-08-15 ~ 2026-08-20, progress 50)
    const taskBRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        worker_name: 'Thanh Phuong(탄 프엉)',
        task_name: '작업 B',
        start_date: '2026-08-15',
        end_date: '2026-08-20',
        progress: 50,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    const taskBJson: any = await taskBRes.json();
    taskBId = taskBJson.data.id;

    // 4. Add future daily status to Task A
    await fetch(`${BASE_URL}/api/tasks/${taskAId}/daily-status/2026-08-10`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS', editor_name: '박용진 수석' }),
    });
  }, 30000);

  afterAll(async () => {
    if (projectId) {
      await fetch(`${BASE_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
    }
  }, 30000);

  // 1. Pure Calendar Date Calculation Unit Tests
  it('1. Pure calendar date calculations accurately handle positive/negative days, month/year boundaries & leap years', () => {
    expect(differenceInPureCalendarDays('2026-09-01', '2026-08-06')).toBe(26);
    expect(addPureCalendarDays('2026-08-06', 26)).toBe('2026-09-01');
    expect(addPureCalendarDays('2026-08-31', 26)).toBe('2026-09-26');
    expect(addPureCalendarDays('2026-08-08', 26)).toBe('2026-09-03');

    // Negative shift (-10 days)
    expect(differenceInPureCalendarDays('2026-08-22', '2026-09-01')).toBe(-10);
    expect(addPureCalendarDays('2026-09-01', -10)).toBe('2026-08-22');

    // Year boundary
    expect(addPureCalendarDays('2026-12-25', 10)).toBe('2027-01-04');

    // Leap year (2028 is leap year)
    expect(addPureCalendarDays('2028-02-28', 2)).toBe('2028-03-01');
    // Non-leap year (2027)
    expect(addPureCalendarDays('2027-02-28', 2)).toBe('2027-03-02');
  });

  // 2. Unconfirmed Project Start Date Shift Rejection (HTTP 409 Confirmation Required)
  it('2. Unconfirmed project start date change returns HTTP 409 PROJECT_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED', async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: '2026-09-01',
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('PROJECT_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED');
    expect(json.error?.details?.delta_days).toBe(26);
    expect(json.error?.details?.old_start_date).toBe('2026-08-06');
    expect(json.error?.details?.new_start_date).toBe('2026-09-01');
    expect(json.error?.details?.old_end_date).toBe('2026-08-31');
    expect(json.error?.details?.new_end_date).toBe('2026-09-26');
    expect(json.error?.details?.shifted_task_count).toBe(2);
  });

  // 3. Confirmed Project Start Date +26 Days Cascade Shift
  it('3. Confirmed project start date shift +26 days updates project end, tasks, and future statuses atomically', async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: '2026-09-01',
        confirm_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);

    const updatedPrj = json.data.project || json.data;
    expect(updatedPrj.start_date).toBe('2026-09-01');
    expect(updatedPrj.end_date).toBe('2026-09-26');

    // Fetch project detail to verify shifted child tasks
    const detailRes = await fetch(`${BASE_URL}/api/projects/${projectId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks: any[] = detailJson.data.tasks;

    const taskA = tasks.find((t) => t.id === taskAId);
    expect(taskA.start_date).toBe('2026-09-03');
    expect(taskA.end_date).toBe('2026-09-07');
    expect(taskA.progress).toBe(25); // Progress preserved
    if (taskA.daily_statuses && taskA.daily_statuses['2026-09-05']) {
      expect(taskA.daily_statuses['2026-09-05']).toBe('IN_PROGRESS');
    }

    const taskB = tasks.find((t) => t.id === taskBId);
    expect(taskB.start_date).toBe('2026-09-10');
    expect(taskB.end_date).toBe('2026-09-15');
    expect(taskB.progress).toBe(50); // Progress preserved
    expect(taskB.worker_name).toBe('Thanh Phuong(탄 프엉)'); // Worker preserved
  });

  // 4. Creating Task Outside Project Range Protection (HTTP 409)
  it('4. POST /api/tasks rejects task created outside project date range (HTTP 409 TASK_OUTSIDE_PROJECT_RANGE)', async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        worker_name: '박용진 수석',
        task_name: '범위 초과 작업',
        start_date: '2026-09-20',
        end_date: '2026-09-30', // Project ends on 2026-09-26!
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('TASK_OUTSIDE_PROJECT_RANGE');
  });

  // 5. Editing Task Outside Project Range Protection (HTTP 409)
  it('5. PATCH /api/tasks/:id rejects task edited outside project date range (HTTP 409 TASK_OUTSIDE_PROJECT_RANGE)', async () => {
    const res = await fetch(`${BASE_URL}/api/tasks/${taskAId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        end_date: '2026-09-28', // Project ends on 2026-09-26!
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('TASK_OUTSIDE_PROJECT_RANGE');
  });

  // 6. Reducing Project End Date with Exceeding Tasks Rejection (HTTP 409)
  it('6. Reducing project end date rejects when child tasks exceed new end date', async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        end_date: '2026-09-12', // Task B ends on 2026-09-15!
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('TASK_OUTSIDE_PROJECT_RANGE');
  });

  // 7. Executive CEO/COO Write Protection (HTTP 403 EXECUTIVE_READ_ONLY)
  it('7. Executive CEO/COO is blocked from shifting project dates (HTTP 403 EXECUTIVE_READ_ONLY)', async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: '2026-09-05',
        confirm_schedule_cascade: true,
        editor_name: 'CEO',
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('EXECUTIVE_READ_ONLY');
  });

  // 8. Completed Project Write Protection (HTTP 403 PROJECT_COMPLETED_READ_ONLY)
  it('8. Completed project date shifting is blocked with HTTP 403 PROJECT_COMPLETED_READ_ONLY', async () => {
    // Complete project first
    await fetch(`${BASE_URL}/api/projects/${projectId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editor_name: '박용진 수석' }),
    });

    const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: '2026-10-01',
        confirm_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('PROJECT_COMPLETED_READ_ONLY');

    // Reopen project for clean deletion in afterAll
    await fetch(`${BASE_URL}/api/projects/${projectId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editor_name: '박용진 수석' }),
    });
  });
});
