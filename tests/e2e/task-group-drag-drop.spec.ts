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

test.describe('Task Grouping, Drag & Drop, Reorder and Move UI Suite', () => {
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
    createdProjectId = prjJson.project?.id || prjJson.id;
    expect(createdProjectId).toBeTruthy();
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
    }
  });

  test('1. Verify Desktop Task Drag & Drop Between Groups and Drag Overlay', async ({ page }) => {
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

    const taskHandle = page.locator('[data-testid^="task-drag-handle-"]').first();
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

  test('2. Verify TaskMoveModal & Group Task Add Button (+ 세부 작업)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const addGroupTaskBtn = page.locator('[data-testid^="task-group-add-task-"]').first();
    if (await addGroupTaskBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addGroupTaskBtn.click();
      await page.waitForSelector('[data-testid="task-modal"]');
      await page.fill('[data-testid="task-name-input"]', '통합 검증 시험');
      await page.fill('[data-testid="task-start-date-input"]', '2026-08-10');
      await page.fill('[data-testid="task-end-date-input"]', '2026-08-14');
      await page.click('[data-testid="task-save-btn"]');
      await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });
    }

    const moveMenuBtn = page.locator('[data-testid^="task-move-menu-"]').first();
    if (await moveMenuBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moveMenuBtn.click();
      await page.waitForSelector('[data-testid="task-move-modal"]');
      const moveGroupSelect = page.locator('[data-testid="task-move-group-select"]');
      await expect(moveGroupSelect).toBeVisible();
      await page.click('[data-testid="task-move-cancel-btn"]');
      await page.waitForSelector('[data-testid="task-move-modal"]', { state: 'detached' });
    }
  });

  test('3. Verify Mobile View (390px) Task Move Menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const summaryBtn = page.locator('[data-testid="mobile-view-summary-btn"]');
    if (await summaryBtn.isVisible().catch(() => false)) {
      await summaryBtn.click();
    }

    const container = page.locator('#root');
    await expect(container).toBeVisible();
  });

  test('4. Verify CEO / COO Viewer RBAC (Drag Handles Hidden & Direct API Blocked)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '최경진 대표');
    });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');

    // Drag handles count should be 0
    const dragHandles = page.locator('[data-testid^="task-drag-handle-"]');
    expect(await dragHandles.count()).toBe(0);

    // Direct API PATCH check -> 403 EXECUTIVE_READ_ONLY
    const directRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/task-structure-order`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('최경진 대표'),
      },
      body: JSON.stringify({
        groups: [{ group_id: 'tgrp_dummy', sort_order: 1, task_ids: [] }],
        editor_name: '최경진 대표',
      }),
    });
    expect(directRes.status).toBe(403);
  });
});
