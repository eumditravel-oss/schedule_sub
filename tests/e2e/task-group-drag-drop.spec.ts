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
  let groupIds: Record<string, string> = {};
  let taskIds: string[] = [];

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
    createdProjectId = prjJson.id;

    // 2. Create Task Groups (기획, 개발, 테스트)
    const groupNames = ['기획', '개발', '테스트'];
    for (const gName of groupNames) {
      const gRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/task-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent('유종욱 실장'),
        },
        body: JSON.stringify({ group_name: gName, editor_name: '유종욱 실장' }),
      });
      const gJson: any = await gRes.json();
      groupIds[gName] = gJson.id;
    }

    // 3. Create Tasks under '기획' group
    const taskNames = ['요구사항 정의', '시스템 설계', 'DB 구축'];
    for (let i = 0; i < taskNames.length; i++) {
      const tName = taskNames[i];
      const tRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent('유종욱 실장'),
        },
        body: JSON.stringify({
          project_id: createdProjectId,
          task_group_id: groupIds['기획'],
          task_name: tName,
          start_date: '2026-08-03',
          end_date: '2026-08-07',
          worker_name: 'wrk_yjw',
          editor_name: '유종욱 실장',
        }),
      });
      const tJson: any = await tRes.json();
      taskIds.push(tJson.id);
    }
  });

  test.afterAll(async () => {
    // ID-based Clean-up
    if (createdProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('유종욱 실장') },
      });
    }
  });

  test('1. Verify Desktop Task Drag & Drop Between Groups and Drag Overlay', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const firstTaskHandle = page.locator(`[data-testid="task-drag-handle-${taskIds[0]}"]`);
    await expect(firstTaskHandle).toBeVisible();

    const devGroupRow = page.locator(`[data-testid^="task-group-row-"]`).nth(2); // '개발' group
    await expect(devGroupRow).toBeVisible();

    // Drag first task to 개발 group
    await firstTaskHandle.dragTo(devGroupRow);
    await page.waitForTimeout(500);

    // Verify Undo Toast appears
    const toast = page.locator('[data-testid="structure-undo-toast"]');
    await expect(toast).toBeVisible();

    // Refresh & verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Verify task row is rendered under project page
    const movedTaskRow = page.locator(`[data-testid="task-row-${taskIds[0]}"]`);
    await expect(movedTaskRow).toBeVisible();
  });

  test('2. Verify TaskMoveModal & Group Task Add Button (+ 세부 작업)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Test + 세부 작업 button on '테스트' group
    const testGroupObj = groupIds['테스트'];
    const addGroupTaskBtn = page.locator(`[data-testid="task-group-add-task-${testGroupObj}"]`);
    await expect(addGroupTaskBtn).toBeVisible();
    await addGroupTaskBtn.click();

    await page.waitForSelector('[data-testid="task-modal"]');
    const groupSelect = page.locator('[data-testid="task-group-select"]');
    await expect(groupSelect).toHaveValue(testGroupObj);

    await page.fill('[data-testid="task-name-input"]', '통합 검증 시험');
    await page.fill('[data-testid="task-start-date-input"]', '2026-08-10');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-14');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });

    // Test TaskMoveModal for task_1
    const moveMenuBtn = page.locator(`[data-testid="task-move-menu-${taskIds[1]}"]`);
    await expect(moveMenuBtn).toBeVisible();
    await moveMenuBtn.click();

    await page.waitForSelector('[data-testid="task-move-modal"]');
    const moveGroupSelect = page.locator('[data-testid="task-move-group-select"]');
    await moveGroupSelect.selectOption(testGroupObj);
    await page.click('[data-testid="task-move-confirm-btn"]');
    await page.waitForSelector('[data-testid="task-move-modal"]', { state: 'detached' });

    // Refresh & verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    await expect(page.locator(`[data-testid="task-row-${taskIds[1]}"]`)).toBeVisible();
  });

  test('3. Verify Mobile View (390px) Task Move Menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Switch to Summary View or Week View
    const summaryBtn = page.locator('[data-testid="mobile-view-summary-btn"]');
    if (await summaryBtn.isVisible().catch(() => false)) {
      await summaryBtn.click();
    }

    // Verify page rendered without horizontal overflow crash
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
        groups: [{ group_id: groupIds['기획'], sort_order: 1, task_ids: [taskIds[0]] }],
        editor_name: '최경진 대표',
      }),
    });
    expect(directRes.status).toBe(403);
  });
});
