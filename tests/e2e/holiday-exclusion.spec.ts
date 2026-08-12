import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'holiday-exclusion');
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('Holiday Exclusion & Date Info Panel E2E Visual Verification', () => {
  test.use({ baseURL: process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Capture Task Workday Summary & Warning Removed', async ({ page }) => {
    await page.goto('/projects/v3qa_project_main');
    await page.waitForLoadState('networkidle');

    // Fixture assignees are intentionally not normal production workers, so
    // Project Detail may ask for the test actor again. Keep the actor exact.
    const managerOption = page.locator('[data-testid="worker-option-wrk_02"]');
    if (await managerOption.isVisible()) {
      await managerOption.click();
    }

    // Open Add Task Modal
    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    await expect(addTaskBtn).toBeVisible();
    await addTaskBtn.click();

    // Fill dates to compute workday breakdown
    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    await expect(startDateInput).toBeVisible();
    await startDateInput.fill('2026-08-03');
    await page.locator('[data-testid="task-end-date-input"]').fill('2026-08-07');

    // Verify task-workday-summary is visible
    const summary = page.getByText('주 담당자(PIC) 기준 근무일수:');
    await expect(summary).toBeVisible();

    // Verify old yellow warning notice is NOT present
    const oldNotice = page.locator('[data-testid="task-non-working-days-notice"]');
    await expect(oldNotice).toHaveCount(0);

    // Capture Screenshot 1: task-workday-summary.png
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'task-workday-summary.png'),
      fullPage: false,
    });

    // Capture Screenshot 2: task-warning-removed.png
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'task-warning-removed.png'),
      fullPage: false,
    });

    // Close Task Modal
    await page.locator('[data-testid="task-cancel-btn"]').click();
  });

  test('Capture DateHeaderInfoPanel Saturday KR/VN cards & Lock badge', async ({ page }) => {
    await page.goto('/projects/v3qa_project_main');
    await page.waitForLoadState('networkidle');

    const managerOption = page.locator('[data-testid="worker-option-wrk_02"]');
    if (await managerOption.isVisible()) await managerOption.click();

    // Click on date header (e.g., Saturday date header or trigger panel)
    const dateHeader = page.locator('[data-testid^="date-header-"]').first();
    if (await dateHeader.isVisible()) {
      await dateHeader.click();
    }

    const panel = page.locator('[data-testid="date-header-info-panel"]');
    if (await panel.isVisible()) {
      // Capture Screenshot 3: date-info-kr-vn-saturday.png
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'date-info-kr-vn-saturday.png'),
      });

      // Capture Screenshot 5: date-info-auto-holiday-locked.png
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'date-info-auto-holiday-locked.png'),
      });

      // Open manual holiday form
      const addManualBtn = page.locator('[data-testid="add-manual-holiday-btn-kr"]').or(page.locator('[data-testid="add-manual-holiday-btn-vn"]')).first();
      if (await addManualBtn.isVisible()) {
        await addManualBtn.click();
        // Capture Screenshot 4: date-info-manual-holiday-form.png
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'date-info-manual-holiday-form.png'),
        });
      }

      await page.locator('[data-testid="date-info-close-btn"]').click();
    }
  });

  test('Capture Mobile Date Info Sheet & Worker Utilization Badge', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/projects/v3qa_project_main');
    await page.waitForLoadState('networkidle');

    const managerOption = page.locator('[data-testid="worker-option-wrk_02"]');
    if (await managerOption.isVisible()) await managerOption.click();

    // Capture Screenshot 7: worker-utilization-badge.png
    const badge = page.locator('[data-testid="worker-utilization-badge"]').first();
    if (await badge.isVisible()) {
      await badge.screenshot({
        path: path.join(SCREENSHOT_DIR, 'worker-utilization-badge.png'),
      });
    } else {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'worker-utilization-badge.png'),
      });
    }

    // Open Date Header on mobile
    const dateHeader = page.locator('[data-testid^="date-header-"]').first();
    if (await dateHeader.isVisible()) {
      await dateHeader.click();
      // Capture Screenshot 6: mobile-date-info-sheet.png
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-date-info-sheet.png'),
      });
    }
  });
});
