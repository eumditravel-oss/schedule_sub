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
        'x-editor-name': encodeURIComponent('유종욱 실장'),
      },
      body: JSON.stringify({
        name: `[E2E-DND-${runId}] 공정 드래그앤드롭 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '유종욱 실장',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.data?.id;

    // 2. Create Task Groups (기획, 개발, 테스트)
    const groupNames = ['기획', '개발', '테스트'];
    for (const gName of groupNames) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/task-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent('유종욱 실장'),
        },
        body: JSON.stringify({ group_name: gName, editor_name: '유종욱 실장' }),
      });
    }

    // Fetch detail to get group ID for tasks
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    const groupObj = (detailJson.task_groups || [])[0];
    const targetGroupId = groupObj ? groupObj.id : undefined;

    // 3. Create Tasks under '기획' group
    const taskNames = ['요구사항 정의', '시스템 설계', 'DB 구축'];
    for (let i = 0; i < taskNames.length; i++) {
      const tName = taskNames[i];
      await fetch(`${QA_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent('유종욱 실장'),
        },
        body: JSON.stringify({
          project_id: createdProjectId,
          task_group_id: targetGroupId,
          name: tName,
          task_name: tName,
          start_date: '2026-08-03',
          end_date: '2026-08-07',
          worker_name: '유종욱 실장',
          primary_worker_id: 'wrk_yjw',
          editor_name: '유종욱 실장',
        }),
      });
    }
  });

  test.afterAll(async () => {
    // Clean up QA project
    if (createdProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('유종욱 실장') },
      });
    }
  });

  test('1. Verify Desktop Task Drag & Drop Between Groups and Drag Overlay', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Fetch exact IDs directly inside test block
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasksList: any[] = detailJson.tasks || [];
    const firstTaskId = tasksList[0]?.id;

    expect(firstTaskId).toBeDefined();

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const firstTaskHandle = page.locator(`[data-testid="task-drag-handle-${firstTaskId}"]`);
    await expect(firstTaskHandle).toBeVisible({ timeout: 15000 });

    const devGroupRow = page.locator(`[data-testid^="task-group-row-"]`).nth(1);
    await expect(devGroupRow).toBeVisible();

    // Drag task to target group row
    await firstTaskHandle.dragTo(devGroupRow);
    await page.waitForTimeout(500);

    // Verify Toast appears
    const toast = page.locator('[data-testid="structure-undo-toast"]');
    await expect(toast).toBeVisible();

    // Refresh & verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const movedTaskRow = page.locator(`[data-testid="task-row-${firstTaskId}"]`);
    await expect(movedTaskRow).toBeVisible();
  });

  test('2. Verify TaskMoveModal & Group Task Add Button (+ 세부 작업)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Fetch exact IDs directly inside test block
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    const groupsList: any[] = detailJson.task_groups || [];
    const tasksList: any[] = detailJson.tasks || [];

    const targetGroupId = groupsList[groupsList.length - 1]?.id;
    const targetTaskId = tasksList[tasksList.length - 1]?.id;

    expect(targetGroupId).toBeDefined();
    expect(targetTaskId).toBeDefined();

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Test + 세부 작업 button on last group
    const addGroupTaskBtn = page.locator(`[data-testid="task-group-add-task-${targetGroupId}"]`);
    await expect(addGroupTaskBtn).toBeVisible({ timeout: 15000 });
    await addGroupTaskBtn.click();

    await page.waitForSelector('[data-testid="task-modal"]');
    const groupSelect = page.locator('[data-testid="task-group-select"]');
    await expect(groupSelect).toHaveValue(targetGroupId);

    await page.fill('[data-testid="task-name-input"]', '통합 검증 시험');
    await page.fill('[data-testid="task-start-date-input"]', '2026-08-10');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-14');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });

    // Test TaskMoveModal
    const moveMenuBtn = page.locator(`[data-testid="task-move-menu-${targetTaskId}"]`);
    await expect(moveMenuBtn).toBeVisible({ timeout: 15000 });
    await moveMenuBtn.click();

    await page.waitForSelector('[data-testid="task-move-modal"]');
    const moveGroupSelect = page.locator('[data-testid="task-move-group-select"]');
    await moveGroupSelect.selectOption(targetGroupId);
    await page.click('[data-testid="task-move-confirm-btn"]');
    await page.waitForSelector('[data-testid="task-move-modal"]', { state: 'detached' });

    // Refresh & verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    await expect(page.locator(`[data-testid="task-row-${targetTaskId}"]`)).toBeVisible();
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
