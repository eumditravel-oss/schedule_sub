// tests/e2e/cross-project-primary-conflict-regression.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Cross-Project PRIMARY Conflict Regression Suite', () => {
  let projectAId = '';
  let projectBId = '';
  let completedProjectId = '';

  test.beforeAll(async () => {
    const runId = Date.now();

    // Create Active Project A
    const prjARes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-CONFLICT-A-${runId}] 충돌 검증 프로젝트 A`,
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjARes.status).toBe(201);
    const prjAJson: any = await prjARes.json();
    projectAId = prjAJson.id || prjAJson.data?.id;
    expect(projectAId).toBeTruthy();

    // Create Active Project B
    const prjBRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-CONFLICT-B-${runId}] 충돌 검증 프로젝트 B`,
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjBRes.status).toBe(201);
    const prjBJson: any = await prjBRes.json();
    projectBId = prjBJson.id || prjBJson.data?.id;
    expect(projectBId).toBeTruthy();

    // Create Completed Project C
    const prjCRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-CONFLICT-C-${runId}] 완료 검증 프로젝트 C`,
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjCRes.status).toBe(201);
    const prjCJson: any = await prjCRes.json();
    completedProjectId = prjCJson.id || prjCJson.data?.id;
    expect(completedProjectId).toBeTruthy();

    // Complete Project C
    await fetch(`${QA_BASE_URL}/api/projects/${completedProjectId}/complete`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({ mode: 'COMPLETE_ALL', completed_date: '2026-09-30' }),
    });
  });

  test.afterAll(async () => {
    const ids = [projectAId, projectBId, completedProjectId].filter(Boolean);
    for (const pId of ids) {
      await fetch(`${QA_BASE_URL}/api/projects/${pId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
      }).catch(() => {});
    }
  });

  test('1. Verify GET /api/projects/:id/conflicts returns V2 policy version cross_project_v2_primary_only', async () => {
    const res = await fetch(`${QA_BASE_URL}/api/projects/${projectAId}/conflicts`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    const data = json.data || json;

    expect(data.total_conflict_count).toBeDefined();
    expect(data.groups).toBeDefined();

    if (data.groups.length > 0) {
      expect(data.groups[0].policy_version).toBe('cross_project_v2_primary_only');
    }
  });

  test('2. Verify PRIMARY <-> PRIMARY overlap creates conflict >= 1', async () => {
    // Task A on Project A with PRIMARY wrk_01
    await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: projectAId,
        task_name: 'Task Primary A',
        primary_worker_id: 'wrk_01',
        worker_name: '박용진 수석',
        start_date: '2026-09-07',
        end_date: '2026-09-11',
        progress_mode: 'AUTO_TIME',
        schedule_status: 'SCHEDULED',
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });

    // Task B on Project B with PRIMARY wrk_01
    await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: projectBId,
        task_name: 'Task Primary B',
        primary_worker_id: 'wrk_01',
        worker_name: '박용진 수석',
        start_date: '2026-09-07',
        end_date: '2026-09-11',
        progress_mode: 'AUTO_TIME',
        schedule_status: 'SCHEDULED',
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });

    const res = await fetch(`${QA_BASE_URL}/api/projects/${projectAId}/conflicts`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    const data = json.data || json;

    expect(data.total_conflict_count).toBeGreaterThanOrEqual(1);
  });
});
