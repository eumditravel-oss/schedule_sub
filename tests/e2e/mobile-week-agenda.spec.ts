import { test, expect } from '@playwright/test';

test.describe('P1 Mobile 7-Day Week Agenda Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Verify Mobile 7-Day Agenda navigation, touch targets, and 0px page overflow', async ({ page }) => {
    await page.goto('/projects');

    // Switch to Week tab
    const weekTab = page.locator('[data-testid="mobile-view-week-btn"]');
    await expect(weekTab).toBeVisible({ timeout: 10000 });
    await weekTab.click();

    const weekView = page.locator('[data-testid="mobile-week-view"]');
    await expect(weekView).toBeVisible({ timeout: 10000 });

    // 1. Verify 7 Date Buttons
    const dateBtns = page.locator('[data-testid^="mobile-week-date-btn-"]');
    await page.waitForSelector('[data-testid^="mobile-week-date-btn-"]', { timeout: 10000 });
    await expect(dateBtns).toHaveCount(7);

    // Verify touch target min-height >= 44px
    const firstBtnBox = await dateBtns.first().boundingBox();
    expect(firstBtnBox?.height).toBeGreaterThanOrEqual(44);

    // 2. Test Today button
    const todayBtn = page.locator('[data-testid="mobile-week-today-btn"]');
    await expect(todayBtn).toBeVisible();
    await todayBtn.click();

    // 3. Test Prev / Next buttons
    const prevBtn = page.locator('[data-testid="mobile-week-prev-btn"]');
    const nextBtn = page.locator('[data-testid="mobile-week-next-btn"]');
    await prevBtn.click();
    await page.waitForTimeout(300);
    await nextBtn.click();

    // 4. Verify 0px page-level horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
