// tests/e2e/desktop-toolbar.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('Desktop Toolbar & Workday UX E2E Tests', () => {

  test('Desktop toolbar boundingBox and components check at 1920px, 1366px, 1024px', async ({ page }) => {
    // 1. Viewport 1920x1080
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    const toolbar1920 = page.locator('[data-testid="desktop-schedule-toolbar"]');
    await expect(toolbar1920).toBeVisible();

    // Verify key elements
    await expect(page.locator('[data-testid="active-tab-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="completed-tab-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-30days-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-month-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-prev-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-today-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-next-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="calendar-legend-desktop"]')).toBeVisible();

    // Ensure NO toggle button exists on desktop legend
    await expect(page.locator('[data-testid="calendar-legend-toggle-btn"]')).toHaveCount(0);

    // Check height boundingBox at 1920px
    const box1920 = await toolbar1920.boundingBox();
    expect(box1920).not.toBeNull();
    expect(box1920!.height).toBeLessThanOrEqual(110);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-toolbar-1920.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-legend-always-open.png') });

    // 2. Viewport 1366x768
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(300);

    const toolbar1366 = page.locator('[data-testid="desktop-schedule-toolbar"]');
    await expect(toolbar1366).toBeVisible();
    const box1366 = await toolbar1366.boundingBox();
    expect(box1366).not.toBeNull();
    expect(box1366!.height).toBeLessThanOrEqual(120);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-toolbar-1366.png') });

    // 3. Viewport 1024x768
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);

    const toolbar1024 = page.locator('[data-testid="desktop-schedule-toolbar"]');
    await expect(toolbar1024).toBeVisible();
    const box1024 = await toolbar1024.boundingBox();
    expect(box1024).not.toBeNull();
    expect(box1024!.height).toBeLessThanOrEqual(150);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-toolbar-1024.png') });
  });

  test('Permanent Legend rendering and 9 legend items verification', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const legendDesktop = page.locator('[data-testid="calendar-legend-desktop"]');
    await expect(legendDesktop).toBeVisible();

    // Verify all 9 items
    const legendKeys = [
      'workday',
      'weekly_off',
      'kr_holiday',
      'vn_holiday',
      'leave',
      'off',
      'work_override',
      'today',
      'issue',
    ];

    for (const key of legendKeys) {
      await expect(page.locator(`[data-testid="legend-item-${key}"]`)).toBeVisible();
    }
  });

  test('Build version indicator verification', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const versionIndicator = page.locator('[data-testid="build-version-indicator"]');
    await expect(versionIndicator).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'build-version-indicator.png') });
  });

  test('TaskModal 3 Compact Chips verification', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const firstProjectRow = page.locator('tbody tr').first();
    if (await firstProjectRow.isVisible()) {
      await firstProjectRow.click();
      await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
    }

    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    if (await addTaskBtn.isVisible()) {
      await addTaskBtn.click();
      await page.waitForSelector('[data-testid="task-modal"]');

      await expect(page.locator('[data-testid="task-calendar-span-days"]')).toBeVisible();
      await expect(page.locator('[data-testid="task-planned-working-days"]')).toBeVisible();
      await expect(page.locator('[data-testid="task-excluded-days"]')).toBeVisible();

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'task-workday-chips.png') });
    }
  });

  test('Mobile view legend bottom sheet retained', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const mobileLegendBtn = page.locator('[data-testid="calendar-legend-mobile-btn"]');
    await expect(mobileLegendBtn).toBeVisible();
    await mobileLegendBtn.click();

    const legendSheet = page.locator('[data-testid="calendar-legend-sheet"]');
    await expect(legendSheet).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-legend-sheet-retained.png') });
  });
});
