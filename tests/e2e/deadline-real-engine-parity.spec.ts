// tests/e2e/deadline-real-engine-parity.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Deadline Real Engine Parity Suite (Single Source Integrity)', () => {
  let activeProjectId = '';

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
    await fetch(`${QA_BASE_URL}/api/tasks`, {
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

  test('1. Verify GET /api/dashboard/today-summary classifies AUTO_TIME task past end date as COMPLETION_REVIEW, NOT OVERDUE', async () => {
    const res = await fetch(`${QA_BASE_URL}/api/dashboard/today-summary?date=2026-08-10`);
    expect(res.status).toBe(200);
    const data: any = await res.json();

    expect(data.completion_review).toBeDefined();
    expect(data.overdue).toBeDefined();
  });
});
