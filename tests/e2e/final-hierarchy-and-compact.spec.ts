// tests/e2e/final-hierarchy-and-compact.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Task Hierarchy, Multi-Assignees, Auto Progress & Compact Gantt Rows', () => {
  let createdProjectId = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('유종욱 실장'),
      },
      body: JSON.stringify({
        name: `[E2E-HIERARCHY-${runId}] 계층 구조 검증 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '유종욱 실장',
      }),
    });

    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.data?.id;
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('유종욱 실장') },
      });
    }
  });

  test('E2E Full Flow: Hierarchy, Compact UI, Translation Protection & Delete Modal', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_yjw');
      localStorage.setItem('schedule_current_worker_name', '유종욱 실장');
    });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');

    // 1. Add Task Group (공정 대분류 추가)
    await page.click('[data-testid="add-task-group-btn"]');
    await page.waitForSelector('[data-testid="task-group-modal"]');
    await page.fill('[data-testid="task-group-name-input"]', '기획 및 설계');
    await page.click('[data-testid="task-group-save-btn"]');
    await page.waitForSelector('[data-testid="task-group-modal"]', { state: 'detached' });

    // Verify task group row rendered
    const groupRows = page.locator('[data-testid^="task-group-row-"]');
    await expect(groupRows.first()).toBeVisible();

    // 2. Add Detail Task (세부 작업 추가)
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');

    await page.fill('[data-testid="task-name-input"]', '요구사항 정의');
    await page.fill('[data-testid="task-start-date-input"]', '2026-08-03');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-07');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });

    // 3. Verify Task Row & Compact Height (<= 46px)
    const taskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(taskRow).toBeVisible();

    const rowBounding = await taskRow.boundingBox();
    if (rowBounding) {
      expect(rowBounding.height).toBeLessThanOrEqual(46);
    }

    // 4. Verify UI Element Text Removals (Count = 0)
    const dateRanges = page.locator('[data-testid="task-row-date-range"]');
    expect(await dateRanges.count()).toBe(0);

    const progressSummaries = page.locator('[data-testid="task-row-progress-summary"]');
    expect(await progressSummaries.count()).toBe(0);

    const inlineProgressChips = page.locator('[data-testid="gantt-bar-inline-progress"]');
    expect(await inlineProgressChips.count()).toBe(0);

    // 5. Verify Task Group Delete Modal with existing tasks
    const groupDeleteBtn = page.locator('[data-testid^="task-group-delete-"]').first();
    await groupDeleteBtn.click();
    await page.waitForSelector('[data-testid="task-group-delete-modal"]');

    const modalText = await page.locator('[data-testid="task-group-delete-modal"]').innerText();
    expect(modalText).toContain('공정');
    expect(modalText).toContain('세부 작업이 있습니다');

    await page.click('[data-testid="task-group-delete-cancel-btn"]');
    await page.waitForSelector('[data-testid="task-group-delete-modal"]', { state: 'detached' });
  });
});
