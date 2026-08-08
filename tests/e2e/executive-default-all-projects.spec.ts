// tests/e2e/executive-default-all-projects.spec.ts
import { test, expect } from '@playwright/test';

const QA_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('P1 Executive Default View & Worker Switch Tab Policy E2E Suite', () => {
  test('CEO and COO default to ALL tab; Editor defaults to ACTIVE; Worker switch updates tab', async ({ page }) => {
    // 1. Load QA page with Park Yongjin (Editor)
    await page.goto(`${QA_URL}/projects`);
    await page.evaluate(() => {
      localStorage.setItem('concost_worker_id', 'wrk_park');
    });
    await page.reload();

    const workerSelect = page.locator('header select').first();
    if (await workerSelect.isVisible()) {
      await workerSelect.selectOption({ label: 'Park Yongjin (박용진)' });
    }

    // Verify ACTIVE tab is selected by default for Editor
    const activeTabBtn = page.locator('button:has-text("진행"), button:has-text("Đang thực hiện")').first();
    await expect(activeTabBtn).toHaveClass(/bg-blue-600|text-white/);

    // 2. Switch Worker to CEO
    await workerSelect.selectOption({ label: 'CEO' });

    // Verify ALL tab is selected for CEO
    const allTabBtn = page.locator('button:has-text("전체"), button:has-text("Tất cả")').first();
    await expect(allTabBtn).toHaveClass(/bg-blue-600|text-white/);

    // 3. Switch Worker back to Editor (Park Yongjin)
    await workerSelect.selectOption({ label: 'Park Yongjin (박용진)' });

    // Verify ACTIVE tab is restored for Editor
    await expect(activeTabBtn).toHaveClass(/bg-blue-600|text-white/);

    // 4. Reload page directly with COO profile saved in localStorage
    await page.evaluate(() => {
      localStorage.setItem('concost_worker_id', 'wrk_coo');
    });
    await page.reload();

    // Verify ALL tab is selected by default for COO on load
    await expect(allTabBtn).toHaveClass(/bg-blue-600|text-white/);
  });
});
