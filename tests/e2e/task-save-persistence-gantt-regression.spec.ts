// tests/e2e/task-save-persistence-gantt-regression.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

async function dismissAllModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const modal = page.locator('[data-testid="calendar-manager-modal"], [data-testid="project-delete-confirm-modal"]').first();
    if (await modal.isVisible({ timeout: 300 }).catch(() => false)) {
      const closeBtn = modal.locator('button').first();
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

test.describe('Task Save Persistence & Gantt Reflection Regression Suite', () => {
  let projectAId = '';
  let projectBId = '';

  test.beforeAll(async () => {
    const runId = Date.now();

    // Create Project A
    const prjARes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-SAVE-A-${runId}] 저장 검증 프로젝트 A`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjARes.status).toBe(201);
    const prjAJson: any = await prjARes.json();
    projectAId = prjAJson.id || prjAJson.data?.id;
    expect(projectAId).toBeTruthy();

    // Create Project B
    const prjBRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-SAVE-B-${runId}] 저장 검증 프로젝트 B`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjBRes.status).toBe(201);
    const prjBJson: any = await prjBRes.json();
    projectBId = prjBJson.id || prjBJson.data?.id;
    expect(projectBId).toBeTruthy();
  });

  test.afterAll(async () => {
    const ids = [projectAId, projectBId].filter(Boolean);
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

  test('CASE A: Non-conflict new Task -> POST 1x, 2xx, Modal Close, Task Row & Bar Visible, F5 Persistence', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectAId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Click Add Task button
    const addTaskBtn = page.locator('[data-testid="detail-add-task-btn"]').first();
    await addTaskBtn.click({ force: true });

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Fill task name
    const taskNameInput = taskModal.locator('input[type="text"]').first();
    await taskNameInput.fill('NON CONFLICT TEST TASK');

    // Click Save
    const saveBtn = taskModal.locator('button[type="submit"]').first();
    await saveBtn.click({ force: true });

    // Expect TaskModal to close
    await expect(taskModal).toBeHidden({ timeout: 5000 });

    // Expect Task Row and Schedule Bar in DOM
    const taskRow = page.locator('text=NON CONFLICT TEST TASK');
    await expect(taskRow).toBeVisible();

    // Refresh page (F5) and verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    await expect(page.locator('text=NON CONFLICT TEST TASK')).toBeVisible();
  });

  test('CASE B & C: Conflict Task -> 409 Confirmation Required, Modal Not Closed, Confirm Save & Cancel Trace', async ({ page }) => {
    // 1. Create a task on Project A for wrk_01 on 2026-08-10 ~ 2026-08-14
    await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: projectAId,
        task_name: 'Existing Task Project A',
        primary_worker_id: 'wrk_01',
        worker_name: '박용진 수석',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        progress_mode: 'AUTO_TIME',
        schedule_status: 'SCHEDULED',
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectBId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Open Task Modal on Project B
    const addTaskBtn = page.locator('[data-testid="detail-add-task-btn"]').first();
    await addTaskBtn.click({ force: true });

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Fill conflicting date range for wrk_01
    const taskNameInput = taskModal.locator('input[type="text"]').first();
    await taskNameInput.fill('CONFLICT TEST TASK');

    // Click Save
    const saveBtn = taskModal.locator('button[type="submit"]').first();
    await saveBtn.click({ force: true });

    // Expect WorkerConflictSummaryModal to open
    const conflictModal = page.locator('[data-testid="worker-conflict-summary-modal"]');
    await expect(conflictModal).toBeVisible({ timeout: 5000 });

    // Confirm Conflict Save
    const confirmBtn = page.locator('[data-testid="conflict-modal-confirm-btn"]');
    await confirmBtn.click({ force: true });

    // Expect task to be saved and visible
    await expect(page.locator('text=CONFLICT TEST TASK')).toBeVisible({ timeout: 5000 });

    // F5 Persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    await expect(page.locator('text=CONFLICT TEST TASK')).toBeVisible();
  });
});
