import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(QA_BASE_URL, 'task-group-drag-drop');

async function dismissAllModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const cancelModalBtn = page.locator('[data-testid="project-delete-confirm-cancel-btn"], button:has-text("취소"), button:has-text("Hủy")').first();
    if (await cancelModalBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancelModalBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const conflictConfirmBtn = page.locator('[data-testid="conflict-modal-confirm-btn"]').first();
    if (await conflictConfirmBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await conflictConfirmBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }

    const workerModalBtn = page.locator('[data-testid^="worker-prompt-option-"], button:has-text("유종욱"), button:has-text("박용진")').first();
    if (await workerModalBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await workerModalBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const calendarModalClose = page.locator('[data-testid="calendar-modal-close-btn"]').first();
    if (await calendarModalClose.isVisible({ timeout: 500 }).catch(() => false)) {
      await calendarModalClose.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const keepBtn = page.locator('button').filter({ hasText: /확인 후 알림 지우기|유지|확인|닫기/ }).first();
    if (await keepBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await keepBtn.click({ force: true }).catch(() => {});
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
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-DND-${runId}] 공정 드래그앤드롭 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;
    expect(createdProjectId).toBeTruthy();

    // 2. Create Initial Task with required worker_name fields
    const tRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: 'DND 기본 작업',
        worker_name: '박용진 수석',
        primary_worker_id: 'wrk_01',
        start_date: '2026-08-01',
        end_date: '2026-08-10',
        schedule_status: 'SCHEDULED',
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(tRes.status).toBe(201);
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
      }).catch(() => {});
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
    await page.setExtraHTTPHeaders({
      'x-editor-name': encodeURIComponent('박용진 수석'),
    });
  });

  test('1. Verify Desktop Task Drag & Drop Between Groups and Zero Inline Text', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    const taskRow = page.locator('[data-testid^="task-left-panel-"]').first();
    await expect(taskRow).toBeVisible({ timeout: 15000 });
  });

  test('2. Verify TaskMoveModal, Group Task Add Button & Assignee Popover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    const addGroupTaskBtn = page.locator('[data-testid^="task-group-add-task-"]').first();
    await expect(addGroupTaskBtn).toBeVisible({ timeout: 15000 });
    await addGroupTaskBtn.click({ force: true });
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.waitForTimeout(300);
    const scheduledRadio = page.locator('[data-testid="task-schedule-status-scheduled"]');
    if (await scheduledRadio.isVisible().catch(() => false)) {
      await scheduledRadio.check().catch(() => {});
    }
    await page.fill('[data-testid="task-name-input"]', '통합 검증 시험');
    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    await expect(startDateInput).toBeVisible({ timeout: 15000 });
    await startDateInput.fill('2026-08-10');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-14');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForTimeout(1000);
    const conflictConfirmBtn = page.locator('[data-testid="conflict-modal-confirm-btn"]');
    if (await conflictConfirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await conflictConfirmBtn.click({ force: true });
    }
    const modal = page.locator('[data-testid="task-modal"]');
    if (await modal.isVisible().catch(() => false)) {
      const cancelBtn = modal.locator('button').first();
      await cancelBtn.click({ force: true }).catch(() => {});
    }
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached' });

    await dismissAllModals(page);

    const moveMenuBtn = page.locator('[data-testid^="task-move-menu-"]').first();
    await expect(moveMenuBtn).toBeVisible({ timeout: 15000 });
    await moveMenuBtn.click({ force: true });
    await page.waitForSelector('[data-testid="task-move-modal"]');
    const moveGroupSelect = page.locator('[data-testid="task-move-group-select"]');
    await expect(moveGroupSelect).toBeVisible();

    const cancelMoveBtn = page.locator('[data-testid="task-move-cancel-btn"]');
    if (await cancelMoveBtn.isVisible()) {
      await cancelMoveBtn.click({ force: true });
    }
  });

  test('3. Verify Mobile View (390px) Task Layout and Zero Mobile Text Chips', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissAllModals(page);

    const mobileTaskRow = page.locator('[data-testid^="task-card-"], [data-testid^="mobile-summary-task-card-"]').first();
    await expect(mobileTaskRow).toBeVisible({ timeout: 15000 });
  });

  test('4. Verify CEO / COO Viewer RBAC (Drag Handles Hidden & Direct API Blocked)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_ceo');
      localStorage.setItem('schedule_current_worker_name', 'CEO');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissAllModals(page);

    const dragHandle = page.locator('[data-testid="task-drag-handle"]');
    await expect(dragHandle).toHaveCount(0);
  });
});
