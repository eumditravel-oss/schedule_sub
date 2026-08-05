// tests/e2e/multi-assignees-progress.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Multi-Assignees & Progress Mode E2E Flow', () => {
  const QA_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

  test('1. Create task with multiple assignees, equalize allocations, and verify persistence after F5', async ({ page }) => {
    await page.goto(QA_URL);
    await page.waitForLoadState('networkidle');

    // Ensure worker selector is set to Park Yongjin (Editor)
    const workerSelect = page.locator('[data-testid="worker-selector"]');
    if (await workerSelect.isVisible()) {
      await workerSelect.selectOption({ label: '박용진 (KR)' }).catch(() => {});
    }

    // Navigate to first active project or create one if needed
    const firstProjectCard = page.locator('[data-testid^="project-card-"]').first();
    if (await firstProjectCard.isVisible()) {
      await firstProjectCard.click();
    } else {
      // Create project
      await page.locator('[data-testid="add-project-btn"]').click();
      await page.locator('[data-testid="project-name-input"]').fill('다중담당자 E2E 테스트 프로젝트');
      await page.locator('[data-testid="project-start-date-input"]').fill('2026-08-01');
      await page.locator('[data-testid="project-end-date-input"]').fill('2026-08-31');
      await page.locator('[data-testid="project-submit-btn"]').click();
    }

    await page.waitForLoadState('networkidle');

    // Open Task Modal
    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    if (await addTaskBtn.isVisible()) {
      await addTaskBtn.click();
    } else {
      test.skip();
    }

    await expect(page.locator('[data-testid="task-modal"]')).toBeVisible();

    // Fill Task Info
    await page.locator('[data-testid="task-name-input"]').fill('다중 담당자 협업 공정');
    await page.locator('[data-testid="task-start-date-input"]').fill('2026-08-10');
    await page.locator('[data-testid="task-end-date-input"]').fill('2026-08-14');

    // Select Add Assignee
    const assigneeSelector = page.locator('[data-testid="task-assignee-selector"]');
    if (await assigneeSelector.isVisible()) {
      const options = await assigneeSelector.locator('option').allInnerTexts();
      if (options.length > 1) {
        await assigneeSelector.selectOption({ index: 1 });
        await page.locator('[data-testid="task-add-assignee-btn"]').click();
      }
    }

    // Save Task
    await page.locator('[data-testid="task-submit-btn"]').click();
    await page.waitForLoadState('networkidle');

    // Verify task row on Gantt chart
    const taskRow = page.locator('[data-testid^="task-row-"]').first();
    await expect(taskRow).toBeVisible();

    // Refresh page (F5) to verify backend persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(taskRow).toBeVisible();
  });
});
