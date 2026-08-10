import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'task-group-add-create-regression');

test.describe('Task Group Add & Create P0 Regression Suite', () => {
  let createdTaskId: string | null = null;
  let testProjectId: string = '';

  test.beforeEach(async ({ page }) => {
    // Preset current worker in localStorage and set extra HTTP headers to bypass WorkerSelectionModal
    await page.addInitScript(() => {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
    await page.setExtraHTTPHeaders({
      'x-editor-name': 'Park Yongjin',
    });

    // Fetch an active project from QA API
    const response = await page.request.get('/api/projects', {
      headers: { 'x-editor-name': 'Park Yongjin' },
    });
    const projectsJson = await response.json();
    const projects = Array.isArray(projectsJson) ? projectsJson : (projectsJson.data || []);
    const activeProject = projects.find((p: any) => p.status === 'ACTIVE') || projects[0];
    testProjectId = activeProject?.id || 'prj_demo_1';
  });

  test.afterEach(async ({ page }) => {
    // Teardown: Delete ONLY the test-created task on QA
    if (createdTaskId) {
      await page.request.delete(`/api/tasks/${createdTaskId}`, {
        headers: { 'x-editor-name': 'Park Yongjin' },
      }).catch(() => {});
      createdTaskId = null;
    }
  });

  test('1. Clicking group Add Task opens CREATE mode modal, sends POST /api/tasks once, 0 undefined updates', async ({ page }) => {
    let postRequestCount = 0;
    let invalidUpdateRequestCount = 0;

    page.on('request', (request) => {
      const url = request.url();
      const method = request.method();
      if (url.includes('/api/tasks') && method === 'POST') {
        postRequestCount++;
      }
      if ((url.includes('/api/tasks/undefined') || url.includes('/api/tasks/null')) && (method === 'PUT' || method === 'PATCH')) {
        invalidUpdateRequestCount++;
      }
    });

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // Dismiss worker modal if present
    const workerModal = page.locator('[data-testid="worker-prompt-modal"]');
    if (await workerModal.isVisible()) {
      await page.locator('button:has-text("Park Yongjin"), button:has-text("박용진")').first().click().catch(() => {});
    }

    // Find first task group add task button
    const groupAddBtn = page.locator('[data-testid^="task-group-add-task-"]').first();
    await expect(groupAddBtn).toBeVisible();

    // Get groupId from attribute
    const testid = await groupAddBtn.getAttribute('data-testid');
    const groupId = testid?.replace('task-group-add-task-', '');

    // Click [+ 세부 작업]
    await groupAddBtn.click();

    // Verify TaskModal is visible in CREATE mode
    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Verify task group select has clicked groupId preselected
    const groupSelect = taskModal.locator('select').first();
    await expect(groupSelect).toHaveValue(groupId || '');

    // Fill task name
    const uniqueTaskName = `P0 Create Regression Test Task ${Date.now()}`;
    const nameInput = taskModal.locator('input[type="text"]').first();
    await nameInput.fill(uniqueTaskName);

    // Track response to get created taskId
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/tasks') && res.request().method() === 'POST' && res.status() < 400),
      taskModal.locator('button:has-text("저장"), button:has-text("Lưu")').click(),
    ]);

    const resData = await response.json();
    createdTaskId = resData.id;
    expect(createdTaskId).toBeTruthy();

    // Verify modal closes on success
    await expect(taskModal).toBeHidden();

    // Network contract assertions
    expect(postRequestCount).toBe(1);
    expect(invalidUpdateRequestCount).toBe(0);

    // Verify task is visible on UI
    await expect(page.locator(`text="${uniqueTaskName}"`).first()).toBeVisible();

    // Refresh page (F5) and verify task persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${uniqueTaskName}"`).first()).toBeVisible();
  });
});
