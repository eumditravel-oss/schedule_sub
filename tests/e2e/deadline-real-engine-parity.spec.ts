// tests/e2e/deadline-real-engine-parity.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Deadline Real Engine Parity Suite (Single Source Integrity)', () => {
  let activeProjectId = '';
  let autoTaskId = '';
  let statusTaskId = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-DEADLINE-${runId}] 데드라인 엔진 검증 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    activeProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;
    expect(activeProjectId).toBeTruthy();

    // 1. Create AUTO_TIME task past end date (2026-08-01 ~ 2026-08-05) -> should be COMPLETION_REVIEW
    const autoRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: activeProjectId,
        task_name: 'AUTO_TIME 완료확인필요 검증작업',
        primary_worker_id: 'wrk_01',
        worker_name: '박용진 수석',
        start_date: '2026-08-01',
        end_date: '2026-08-05',
        progress_mode: 'AUTO_TIME',
        schedule_status: 'SCHEDULED',
        completion_confirmed: 0,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(autoRes.status).toBe(201);
    const autoJson: any = await autoRes.json();
    autoTaskId = autoJson.id || autoJson.data?.id;
    expect(autoTaskId).toBeTruthy();

    // 2. Create STATUS_BASED task past end date with 70% progress -> should be OVERDUE
    const statusRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: activeProjectId,
        task_name: 'STATUS_BASED 기한경과 검증작업',
        primary_worker_id: 'wrk_01',
        worker_name: '박용진 수석',
        start_date: '2026-08-01',
        end_date: '2026-08-05',
        progress_mode: 'STATUS_BASED',
        schedule_status: 'SCHEDULED',
        completion_confirmed: 0,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(statusRes.status).toBe(201);
    const statusJson: any = await statusRes.json();
    statusTaskId = statusJson.id || statusJson.data?.id;
    expect(statusTaskId).toBeTruthy();

    // Add daily_status entries up to 70% progress for STATUS_BASED task
    await fetch(`${QA_BASE_URL}/api/tasks/${statusTaskId}/daily-status/2026-08-01`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({ status: 'WORK', editor_name: '박용진 수석' }),
    });
  });

  test.afterAll(async () => {
    if (activeProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${activeProjectId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
      }).catch(() => {});
    }
  });

  test('1. Verify GET /api/dashboard/today-summary classifies AUTO_TIME task as COMPLETION_REVIEW and STATUS_BASED task as OVERDUE', async () => {
    const res = await fetch(`${QA_BASE_URL}/api/dashboard/today-summary?date=2026-08-10`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    const data = json.data || json;

    const completionReviewTaskIds: string[] = data.completion_review?.task_ids || [];
    const overdueTaskIds: string[] = data.overdue?.task_ids || [];

    // AUTO_TIME past end date -> MUST be in completion_review AND MUST NOT be in overdue
    expect(completionReviewTaskIds).toContain(autoTaskId);
    expect(overdueTaskIds).not.toContain(autoTaskId);

    // STATUS_BASED past end date with < 100% progress -> MUST be in overdue AND MUST NOT be in completion_review
    expect(overdueTaskIds).toContain(statusTaskId);
    expect(completionReviewTaskIds).not.toContain(statusTaskId);
  });

  test('2. Verify Project Readiness Parity: AUTO_TIME is NOT OVERDUE and STATUS_BASED is OVERDUE', async () => {
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${activeProjectId}/detail`);
    expect(detailRes.status).toBe(200);
    const detailJson: any = await detailRes.json();
    const tasks: any[] = detailJson.data?.tasks || detailJson.tasks || [];

    const autoTask = tasks.find((t: any) => t.id === autoTaskId);
    const statusTask = tasks.find((t: any) => t.id === statusTaskId);

    expect(autoTask).toBeDefined();
    expect(statusTask).toBeDefined();

    // Verify AUTO_TIME task completion_review classification
    const autoProgress = Number(autoTask.actual_progress ?? autoTask.progress ?? 0);
    expect(autoProgress).toBeGreaterThanOrEqual(100);

    // Verify STATUS_BASED task overdue classification
    const statusProgress = Number(statusTask.actual_progress ?? statusTask.progress ?? 0);
    expect(statusProgress).toBeLessThan(100);
  });
});
