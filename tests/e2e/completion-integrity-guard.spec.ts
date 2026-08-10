// tests/e2e/completion-integrity-guard.spec.ts
import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(QA_BASE_URL, 'completion-integrity-guard');

const BASE_URL = process.env.QA_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
const EDITOR_NAME = '박용진 수석';

test.describe('Completion Integrity Guard & Health Check Suite', () => {
  test('1. Verify GET /api/health/completion-integrity returns 0 inconsistent projects and tasks', async () => {
    const res = await fetch(`${BASE_URL}/api/health/completion-integrity`);
    expect(res.status).toBe(200);

    const json = await res.json();
    const data = json.data || json;

    expect(data.inconsistent_projects).toBe(0);
    expect(data.inconsistent_tasks).toBe(0);
    expect(data.completed_projects).toBeGreaterThanOrEqual(0);
  });

  test('2. Verify STRICT completion mode blocks incomplete project completion (409) & COMPLETE_ALL resolves integrity 0', async () => {
    // A. Create ACTIVE test project
    const prjRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent(EDITOR_NAME),
      },
      body: JSON.stringify({
        name: '[E2E-GUARD] Completion Integrity Guard Test',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson = await prjRes.json();
    const projectId = prjJson.data?.id || prjJson.id;
    expect(projectId).toBeDefined();

    try {
      // B. Create 3 incomplete tasks (progress=30, completion_confirmed=0)
      for (let i = 1; i <= 3; i++) {
        const taskRes = await fetch(`${BASE_URL}/api/tasks`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'x-editor-name': encodeURIComponent(EDITOR_NAME),
          },
          body: JSON.stringify({
            project_id: projectId,
            worker_name: EDITOR_NAME,
            task_name: `Guard Task ${i}`,
            start_date: '2026-08-01',
            end_date: '2026-08-10',
            progress_mode: 'AUTO_TIME',
            progress: 30,
            completion_confirmed: 0,
            confirm_worker_schedule_conflict: true,
          }),
        });
        expect(taskRes.status).toBe(201);
      }

      // C. STRICT mode: complete project with incomplete tasks -> HTTP 409
      const strictRes = await fetch(`${BASE_URL}/api/projects/${projectId}/complete`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent(EDITOR_NAME),
        },
        body: JSON.stringify({ mode: 'STRICT' }),
      });
      expect(strictRes.status).toBe(409);
      const strictJson = await strictRes.json();
      const errCode = strictJson.error?.code || strictJson.code;
      expect(errCode).toBe('PROJECT_HAS_INCOMPLETE_TASKS');

      // Verify project status remains ACTIVE
      const activePrjRes = await fetch(`${BASE_URL}/api/projects/${projectId}/detail`, {
        headers: { 'Accept': 'application/json' },
      }).then((r) => r.json());
      const activeStatus = activePrjRes.data?.project?.status || activePrjRes.project?.status;
      expect(activeStatus).toBe('ACTIVE');

      // D. COMPLETE_ALL mode: atomic completion of project & 3 tasks -> HTTP 200
      const atomicRes = await fetch(`${BASE_URL}/api/projects/${projectId}/complete`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent(EDITOR_NAME),
        },
        body: JSON.stringify({ mode: 'COMPLETE_ALL' }),
      });
      expect(atomicRes.status).toBe(200);

      // Verify completed status and child task confirmation
      const completedDetailRes = await fetch(`${BASE_URL}/api/projects/${projectId}/detail`, {
        headers: { 'Accept': 'application/json' },
      }).then((r) => r.json());
      const completedStatus = completedDetailRes.data?.project?.status || completedDetailRes.project?.status;
      const tasks = completedDetailRes.data?.tasks || completedDetailRes.tasks || [];

      expect(completedStatus).toBe('COMPLETED');
      expect(tasks.length).toBe(3);
      tasks.forEach((t: any) => {
        expect(Number(t.completion_confirmed)).toBe(1);
        expect(Number(t.progress)).toBe(100);
      });

      // E. Health Check after atomic completion: inconsistent count === 0
      const postHealthRes = await fetch(`${BASE_URL}/api/health/completion-integrity`, {
        headers: { 'Accept': 'application/json' },
      });
      const postHealthJson = await postHealthRes.json();
      const postHealthData = postHealthJson.data || postHealthJson;
      expect(postHealthData.inconsistent_projects).toBe(0);
      expect(postHealthData.inconsistent_tasks).toBe(0);

    } finally {
      // Clean up test project
      await fetch(`${BASE_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent(EDITOR_NAME),
        },
      }).catch(() => {});
    }
  });
});
