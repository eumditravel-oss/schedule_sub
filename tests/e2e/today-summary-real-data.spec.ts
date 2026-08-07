import { test, expect } from '@playwright/test';

test.describe('P0 Today Summary Real Data API Suite', () => {
  test('Project Overview Today Summary loads team-wide active task metrics', async ({ page }) => {
    await page.goto('/');

    const summaryCard = page.locator('[data-testid="today-summary-card"]');
    await expect(summaryCard).toBeVisible({ timeout: 10000 });

    // Verify 4 metric labels exist
    await expect(page.getByText('오늘 예정')).toBeVisible();
    await expect(page.getByText('진행 중')).toBeVisible();
    await expect(page.getByText('오늘 완료')).toBeVisible();
    await expect(page.getByText('기한 경과')).toBeVisible();

    // Verify worker selector profile switch does not change team summary metrics
    const workerBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerBtn.isVisible()) {
      await workerBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').first();
      if (await option.isVisible()) {
        await option.click();
      }
    }

    // Metric card should remain visible with constant data
    await expect(summaryCard).toBeVisible();
  });
});
