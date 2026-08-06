// tests/e2e/task-group-drag-drop.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

async function dismissWorkerPromptModal(page: any) {
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const yjwBtn = modal.locator('button:has-text("유종욱")').or(modal.locator('button')).first();
    if (await yjwBtn.isVisible().catch(() => false)) {
      await yjwBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Task Grouping, Drag & Drop, Reorder, Hatch & Multi-Assignee UI Suite', () => {
  let createdProjectId = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    // 1. Create QA Project
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        name: `[E2E-DND-${runId}] 공정 드래그앤드롭 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;
    if (!createdProjectId) {
      console.error('Failed to get project ID from response:', prjJson);
    }
    expect(createdProjectId).toBeTruthy();
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      const delRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
      expect(delRes.status).toBe(200);
    }
  });

  test('1. Verify Desktop Task Drag & Drop Between Groups and Zero Inline Text', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '유종욱 실장');
    });

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Create 2 Groups & 1 Task via UI
    const addGroupBtn = page.locator('[data-testid="add-task-group-btn"]');
    await expect(addGroupBtn).toBeVisible({ timeout: 15000 });
    await addGroupBtn.click();
    await page.fill('[data-testid="task-group-name-input"]', '기획');
    await page.click('[data-testid="task-group-save-btn"]');
    await page.waitForSelector('[data-testid="task-group-modal"]', { state: 'detached' });

    await addGroupBtn.click();
    await page.fill('[data-testid="task-group-name-input"]', '개발');
    await page.click('[data-testid="task-group-save-btn"]');
    await page.waitForSelector('[data-testid="task-group-modal"]', { state: 'detached' });

    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
    await addTaskBtn.click();
    await page.fill('[data-testid="task-name-input"]', '요구사항 분석');
    await page.fill('[data-testid="task-start-date-input"]', '2026-08-03');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-07');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });

    // Assert zero inline title / progress text chips inside ScheduleBars
    const inlineTitles = page.locator('[data-testid="gantt-bar-inline-title"]');
    await expect(inlineTitles).toHaveCount(0);

    const inlineProgresses = page.locator('[data-testid="gantt-bar-inline-progress"]');
    await expect(inlineProgresses).toHaveCount(0);

    // Assert aria-label on schedule bar
    const bar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(bar).toBeVisible();
    const ariaLabel = await bar.getAttribute('aria-label');
    expect(ariaLabel).toContain('요구사항 분석');

    const taskHandle = page.locator('[data-testid^="task-row-drag-handle-"]').first();
    await expect(taskHandle).toBeVisible({ timeout: 15000 });

    const groupRows = page.locator('[data-testid^="task-group-row-"]');
    const targetGroupRow = groupRows.nth(1);
    await expect(targetGroupRow).toBeVisible();

    // Drag task to target group row
    await taskHandle.dragTo(targetGroupRow);
    await page.waitForTimeout(500);

    // Verify Undo Toast
    const toast = page.locator('[data-testid="structure-undo-toast"]');
    await expect(toast).toBeVisible();

    // Refresh & verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const taskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(taskRow).toBeVisible();
  });

  test('2. Verify TaskMoveModal, Group Task Add Button & Assignee Popover', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '유종욱 실장');
    });

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const addGroupTaskBtn = page.locator('[data-testid^="task-group-add-task-"]').first();
    await expect(addGroupTaskBtn).toBeVisible({ timeout: 15000 });
    await addGroupTaskBtn.click();
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.fill('[data-testid="task-name-input"]', '통합 검증 시험');
    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    await expect(startDateInput).toBeVisible({ timeout: 10000 });
    await startDateInput.fill('2026-08-10');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-14');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });

    const moveMenuBtn = page.locator('[data-testid^="task-move-menu-"]').first();
    await expect(moveMenuBtn).toBeVisible({ timeout: 15000 });
    await moveMenuBtn.click();
    await page.waitForSelector('[data-testid="task-move-modal"]');
    const moveGroupSelect = page.locator('[data-testid="task-move-group-select"]');
    await expect(moveGroupSelect).toBeVisible();
    await page.click('[data-testid="task-move-cancel-btn"]');
    await page.waitForSelector('[data-testid="task-move-modal"]', { state: 'detached' });

    // Verify Assignee summary click -> Assignee Popover portal
    const assigneeSummary = page.locator('[data-testid^="task-assignee-summary-"]').first();
    await expect(assigneeSummary).toBeVisible();
    await assigneeSummary.click();

    const popover = page.locator('[data-testid^="task-assignee-popover-"]');
    await expect(popover).toBeVisible();

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
  });

  test('3. Verify Mobile View (390px) Task Layout and Zero Mobile Text Chips', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '유종욱 실장');
    });

    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Verify mobile zero text chips
    const mobileTextChips = page.locator('[data-testid="mobile-gantt-inline-content"]');
    await expect(mobileTextChips).toHaveCount(0);

    const container = page.locator('#root');
    await expect(container).toBeVisible();
  });

  test('4. Verify CEO / COO Viewer RBAC (Drag Handles Hidden & Direct API Blocked)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_name', 'CEO');
    });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');

    // Drag handles count should be 0 for Executive Viewer
    const dragHandles = page.locator('[data-testid^="task-row-drag-handle-"], [data-testid^="task-group-drag-handle-"]');
    await expect(dragHandles).toHaveCount(0, { timeout: 10000 });

    // Direct API PATCH check -> 403 EXECUTIVE_READ_ONLY
    const directRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/task-structure-order`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('CEO'),
      },
      body: JSON.stringify({
        groups: [{ group_id: 'tgrp_dummy', sort_order: 1, task_ids: [] }],
        editor_name: 'CEO',
      }),
    });
    expect(directRes.status).toBe(403);
  });
});
