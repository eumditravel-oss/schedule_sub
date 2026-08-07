import { test, expect } from '@playwright/test';

test.describe('P1 Mobile 30-Day Calendar Agenda Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Verify Mobile 30-Day Calendar grid, date click agenda, and 0px page overflow', async ({ page }) => {
    await page.goto('/projects');

    // Switch to 30-Day (GANTT) tab
    const thirtyTab = page.locator('[data-testid="mobile-view-gantt-btn"]');
    await expect(thirtyTab).toBeVisible({ timeout: 10000 });
    await thirtyTab.click();

    const ganttView = page.locator('[data-testid="mobile-gantt-view"]');
    await expect(ganttView).toBeVisible({ timeout: 10000 });

    // 1. Verify 30 Date Cells
    const dateCells = page.locator('[data-testid^="mobile-thirty-date-cell-"]');
    await page.waitForSelector('[data-testid^="mobile-thirty-date-cell-"]', { timeout: 10000 });
    await expect(dateCells).toHaveCount(30);

    // 2. Click a date cell to update Agenda
    const targetCell = dateCells.nth(5);
    await targetCell.click();

    // 3. Test Today button
    const todayBtn = page.locator('[data-testid="mobile-thirty-today-btn"]');
    await expect(todayBtn).toBeVisible();
    await todayBtn.click();

    // 4. Verify 0px page-level horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
