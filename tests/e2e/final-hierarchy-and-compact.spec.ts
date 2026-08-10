import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(QA_BASE_URL, 'final-hierarchy-and-compact');

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
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('response', async (resp) => {
      if (resp.url().includes('/api/tasks') || resp.url().includes('/api/projects')) {
        console.log('API RESP:', resp.request().method(), resp.status(), resp.url());
      }
    });

    page.on('dialog', async (dialog) => {
      console.log('Browser Dialog Opened:', dialog.message());
      await dialog.dismiss().catch(() => {});
    });

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '유종욱 실장');
    });

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');

    // If worker prompt modal opens, select worker
    const workerModal = page.locator('[data-testid="worker-prompt-modal"]');
    if (await workerModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const pBtn = page.locator('button:has-text("유종욱")').first();
      if (await pBtn.isVisible()) {
        await pBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Wait for worker profile button in header to ensure workers state is loaded
    await page.locator('button:has-text("유종욱")').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    // 1. Add Task Group (공정 대분류 추가)
    const addGroupBtn = page.locator('[data-testid="add-task-group-btn"]');
    await expect(addGroupBtn).toBeVisible({ timeout: 15000 });
    await addGroupBtn.click();

    await page.waitForSelector('[data-testid="task-group-modal"]');
    await page.fill('[data-testid="task-group-name-input"]', '기획 및 설계');
    await page.click('[data-testid="task-group-save-btn"]');
    await page.waitForSelector('[data-testid="task-group-modal"]', { state: 'detached' });

    // Verify task group row rendered
    const groupRows = page.locator('[data-testid^="task-group-row-"]');
    await expect(groupRows.first()).toBeVisible();

    // 2. Add Detail Task (세부 작업 추가)
    const groupAddBtn = page.locator('[data-testid^="group-add-task-btn-"]').last();
    if (await groupAddBtn.isVisible().catch(() => false)) {
      await groupAddBtn.click();
    } else {
      await page.click('[data-testid="add-task-btn"]');
    }
    await page.waitForSelector('[data-testid="task-modal"]');

    const workerSelect = page.locator('[data-testid="task-primary-worker-select"]');
    await page.waitForFunction(() => {
      const sel = document.querySelector('[data-testid="task-primary-worker-select"]') as HTMLSelectElement;
      return sel && sel.options && sel.options.length > 2;
    }, { timeout: 10000 }).catch(() => {});

    if (await workerSelect.isVisible().catch(() => false)) {
      const options = await workerSelect.locator('option[value]:not([value=""])').all();
      if (options.length > 2) {
        const val = await options[2].getAttribute('value').catch(() => '');
        if (val) await workerSelect.selectOption(val);
      } else if (options.length > 1) {
        const val = await options[1].getAttribute('value').catch(() => '');
        if (val) await workerSelect.selectOption(val);
      } else if (options.length > 0) {
        const val = await options[0].getAttribute('value').catch(() => '');
        if (val) await workerSelect.selectOption(val);
      }
    }

    await page.fill('[data-testid="task-name-input"]', '요구사항 정의');
    await page.fill('[data-testid="task-start-date-input"]', '2026-08-03');
    await page.fill('[data-testid="task-end-date-input"]', '2026-08-07');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForTimeout(1000);
    const saveErr = page.locator('[data-testid="task-save-error"]');
    if (await saveErr.isVisible().catch(() => false)) {
      console.log('Task Save Error Text:', await saveErr.innerText());
    }
    const conflictModal = page.locator('[data-testid="worker-conflict-summary-modal"]');
    try {
      await conflictModal.waitFor({ state: 'visible', timeout: 5000 });
      console.log('Conflict modal IS VISIBLE, clicking confirmBtn!');
      const confirmBtn = page.locator('[data-testid="conflict-modal-confirm-btn"]');
      await confirmBtn.click();
      await page.waitForTimeout(1000);
    } catch {
      console.log('Conflict modal IS NOT VISIBLE!');
    }
    await page.waitForSelector('[data-testid="task-modal"]', { state: 'detached', timeout: 5000 }).catch(() => {});

    // 3. Verify Task Row & Compact Height (<= 46px)
    await page.waitForTimeout(2000);
    const count = await page.locator('[data-testid^="task-row-"]').count();
    console.log('Task Row Count in DOM:', count);
    if (count === 0) {
      const tableText = await page.locator('main').innerText().catch(() => 'N/A');
      console.log('Main Content Text:', tableText);
    }
    const taskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(taskRow).toBeVisible({ timeout: 15000 });

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
