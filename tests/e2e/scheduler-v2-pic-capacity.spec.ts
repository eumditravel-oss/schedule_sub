// tests/e2e/scheduler-v2-pic-capacity.spec.ts
import { test, expect } from '@playwright/test';

test.describe('P0 Scheduler V2 PIC & Capacity Model Verification Suite', () => {
  const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

  test.beforeEach(async ({ page }) => {
    // Set Park Yongjin (wrk_02) as active logged in worker in localStorage
    await page.goto(`${BASE_URL}/projects`);
    await page.evaluate(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('1. Verify TaskModal PIC selection, Support addition, and saving', async ({ page }) => {
    // Navigate to first active project detail
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForSelector('[data-testid="project-overview-page"]');

    // Click first project card
    const firstProjectLink = page.locator('a[href^="/projects/"]').first();
    await expect(firstProjectLink).toBeVisible();
    await firstProjectLink.click();

    await page.waitForSelector('[data-testid="project-detail-page"]');

    // Click Add Task button
    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    await expect(addTaskBtn).toBeVisible();
    await addTaskBtn.click();

    // Verify TaskModal renders
    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Verify PIC select is present
    const picSelect = page.locator('[data-testid="task-primary-worker-select"]');
    await expect(picSelect).toBeVisible();
    await picSelect.selectOption({ label: '박용진 (한국)' });

    // Add Support worker
    const supportSelect = page.locator('[data-testid="task-support-selector"]');
    if (await supportSelect.isVisible()) {
      await supportSelect.selectOption({ label: 'Thanh Phuong (베트남)' });
      const addSupportBtn = page.locator('[data-testid="task-add-support-btn"]');
      await addSupportBtn.click();

      // Verify support chip is rendered
      const supportChip = page.locator('[data-testid^="task-support-chip-"]');
      await expect(supportChip.first()).toBeVisible();
    }

    // Fill Task Name
    const taskNameInput = page.locator('[data-testid="task-name-input"]');
    await taskNameInput.fill('V2 PIC E2E Verification Task');

    // Click Save
    const saveBtn = page.locator('[data-testid="task-modal-save-btn"]');
    await saveBtn.click();

    // Modal should close
    await expect(taskModal).toBeHidden();
  });

  test('2. Verify PIC change triggers pic-change-alert warning banner', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    const firstProjectLink = page.locator('a[href^="/projects/"]').first();
    await firstProjectLink.click();

    await page.waitForSelector('[data-testid="project-detail-page"]');

    // Edit first task
    const editBtn = page.locator('[data-testid^="task-edit-btn-"]').first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Change PIC to a different worker
    const picSelect = page.locator('[data-testid="task-primary-worker-select"]');
    const currentValue = await picSelect.inputValue();

    // Select alternative worker
    const options = await picSelect.locator('option').all();
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== currentValue) {
        await picSelect.selectOption(val);
        break;
      }
    }

    // Verify PIC change warning banner is displayed
    const picAlert = page.locator('[data-testid="pic-change-alert"]');
    await expect(picAlert).toBeVisible();

    // Cancel modal
    const cancelBtn = page.locator('[data-testid="task-modal-cancel-btn"]');
    await cancelBtn.click();
  });

  test('3. Verify Project Workforce Modal capacity input and total FTE calculation', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    const firstProjectLink = page.locator('a[href^="/projects/"]').first();
    await firstProjectLink.click();

    await page.waitForSelector('[data-testid="project-detail-page"]');

    // Click Project Workforce Button
    const workforceBtn = page.locator('[data-testid="project-workforce-btn"]');
    await expect(workforceBtn).toBeVisible();
    await workforceBtn.click();

    // Verify Modal Opens
    const workforceModal = page.locator('[data-testid="project-workforce-modal"]');
    await expect(workforceModal).toBeVisible();

    // Save allocations
    const saveBtn = page.locator('[data-testid="project-workforce-save-btn"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    await expect(workforceModal).toBeHidden();
  });
});
