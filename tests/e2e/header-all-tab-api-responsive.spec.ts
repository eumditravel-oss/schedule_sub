import { test, expect } from '@playwright/test';

const desktopViewports = [
  { width: 1024, height: 768 },
  { width: 1100, height: 720 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

test.describe('P1 Desktop Header 1-Line Responsive Suite (1024px ~ 1920px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  for (const vp of desktopViewports) {
    test(`Desktop Header maintains 1 line with 0px overflow at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/projects');

      const header = page.locator('[data-testid="desktop-app-header"]');
      await expect(header).toBeVisible({ timeout: 10000 });

      // 1. Verify required buttons visible
      await expect(page.locator('[data-testid="open-integration-api-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="all-tab-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="active-tab-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="completed-tab-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="desktop-manage-calendar-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="add-project-btn"]')).toBeVisible();

      // 2. Verify Header height <= 64px (1-line)
      const headerBox = await header.boundingBox();
      expect(headerBox).not.toBeNull();
      expect(headerBox!.height).toBeLessThanOrEqual(64);

      // 3. Verify zero page level horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  }
});
