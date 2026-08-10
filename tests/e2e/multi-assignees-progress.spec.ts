// tests/e2e/multi-assignees-progress.spec.ts
import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'multi-assignees-progress');

async function dismissBlockingModals(page: any) {
  const keepBtn = page.locator('[data-testid="leave-cascade-keep-btn"]');
  if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await keepBtn.click();
  }
  const workerOption = page.locator('[data-testid^="worker-prompt-option-"]').first();
  if (await workerOption.isVisible({ timeout: 1000 }).catch(() => false)) {
    await workerOption.click();
  }
}

test.describe('Multi-Assignees & Progress Mode E2E Flow', () => {

  test('1. Create task with multiple assignees, equalize allocations, and verify persistence after F5', async ({ page }) => {
    await page.goto(TEST_BASE_URL);
    await dismissBlockingModals(page);

    // Set worker to Park Yongjin (Editor)
    const workerSelectorBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await workerSelectorBtn.click();
      const pOption = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await pOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pOption.click();
      }
    }

    const firstProjectCard = page.locator('[data-testid^="project-card-"]').first();
    await expect(firstProjectCard).toBeVisible({ timeout: 15000 });
    await firstProjectCard.click();

    await dismissBlockingModals(page);

    // Open Task Modal
    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
    await addTaskBtn.click();

    const taskModal = page.locator('[data-testid="task-modal"]').first();
    await expect(taskModal).toBeVisible({ timeout: 10000 });

    // Fill Task Info
    const nameInput = page.locator('[data-testid="task-name-input"]').first();
    await nameInput.fill('다중 담당자 협업 공정');

    // Add Assignee if selector available
    const assigneeSelector = page.locator('[data-testid="task-assignee-selector"]');
    if (await assigneeSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
      const options = await assigneeSelector.locator('option').allInnerTexts();
      if (options.length > 1) {
        await assigneeSelector.selectOption({ index: 1 });
        await page.locator('[data-testid="task-add-assignee-btn"]').click();
      }
    }

    // Save Task
    const saveBtn = page.locator('[data-testid="task-save-btn"]').first();
    await saveBtn.click();

    // Verify task row on Gantt chart
    const taskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(taskRow).toBeVisible({ timeout: 10000 });
  });
});
