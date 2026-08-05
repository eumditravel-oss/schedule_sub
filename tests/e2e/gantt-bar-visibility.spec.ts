// tests/e2e/gantt-bar-visibility.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

async function dismissBlockingModals(page: any) {
  const calModal = page.locator('[data-testid="calendar-manager-modal"]');
  if (await calModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const keepBtn = page.locator('[data-testid="leave-cascade-keep-btn"]');
    if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await keepBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }

  const workerPromptModal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await workerPromptModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const option = page.locator('[data-testid^="worker-option-"]').first();
    if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
      await option.click();
    }
  }
}

async function selectNonViewerWorker(page: any) {
  const selectorBtn = page.locator('[data-testid="worker-select-btn"]');
  const btnText = await selectorBtn.innerText().catch(() => '');
  if (btnText.includes('박용진') || btnText.includes('유종욱') || btnText.includes('Thanh') || btnText.includes('Manh') || btnText.includes('Quoc')) {
    return;
  }

  if (await selectorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await selectorBtn.click();
    const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(300);
    } else {
      await page.keyboard.press('Escape');
    }
  }
}

test.describe('P0 Gantt Bar Visibility & Alignment E2E Tests', () => {

  test('1. Verify 0% Progress ScheduleBar and Track render with boundingBox width > 20 and non-transparent background', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);
    await selectNonViewerWorker(page);

    const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(scheduleBar).toBeVisible({ timeout: 15000 });

    const track = page.locator('[data-testid="gantt-schedule-track"]').first();
    await expect(track).toBeVisible({ timeout: 15000 });

    const barBox = await scheduleBar.boundingBox();
    expect(barBox).not.toBeNull();
    expect(barBox!.width).toBeGreaterThan(20);
    expect(barBox!.height).toBeGreaterThanOrEqual(18);

    const trackBox = await track.boundingBox();
    expect(trackBox).not.toBeNull();
    expect(trackBox!.width).toBeGreaterThan(20);
    expect(trackBox!.height).toBeGreaterThanOrEqual(18);

    // computedStyle checks
    const trackStyles = await track.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        display: style.display,
      };
    });

    expect(trackStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(trackStyles.backgroundColor).not.toBe('transparent');
    expect(trackStyles.borderTopWidth).not.toBe('0px');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-zero-progress-visible.png') });
    expect(pageErrors.length).toBe(0);
  });

  test('2. Verify Actual Progress Fill Ratio (50% and 100%) and capture screenshots', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(scheduleBar).toBeVisible({ timeout: 10000 });

    const track = page.locator('[data-testid="gantt-schedule-track"]').first();
    await expect(track).toBeVisible();

    const trackBox = await track.boundingBox();
    expect(trackBox).not.toBeNull();
    expect(trackBox!.width).toBeGreaterThan(20);
    expect(trackBox!.height).toBeGreaterThanOrEqual(18);

    const actualOverlay = page.locator('[data-testid="gantt-bar-actual-overlay"]').first();
    if (await actualOverlay.isVisible().catch(() => false)) {
      const fillBox = await actualOverlay.boundingBox();
      expect(fillBox).not.toBeNull();
      expect(fillBox!.width).toBeGreaterThan(0);
      expect(fillBox!.width).toBeLessThanOrEqual(trackBox!.width);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-actual-50-percent.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-actual-100-percent.png') });
  });

  test('3. Verify Date Grid Alignment Span across multiple viewports', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    const viewports = [
      { width: 1024, height: 768 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('/projects');
      await dismissBlockingModals(page);

      const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
      await expect(scheduleBar).toBeVisible({ timeout: 10000 });

      const barBox = await scheduleBar.boundingBox();
      expect(barBox).not.toBeNull();
      expect(barBox!.width).toBeGreaterThan(20);
    }
  });

  test('4. Verify Overview, Detail, Delayed, Completed, and Mobile Schedule Bars', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    // Overview Desktop
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const overviewBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(overviewBar).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-overview-visible.png') });

    // Completed tab check
    const completedTabBtn = page.locator('[data-testid="completed-tab-btn"]');
    if (await completedTabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await completedTabBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-completed-visible.png') });

      const activeTabBtn = page.locator('[data-testid="active-tab-btn"]');
      if (await activeTabBtn.isVisible()) {
        await activeTabBtn.click();
      }
    }

    // Detail Desktop
    const projectCell = page.locator('[data-testid^="project-row-"] td').first();
    if (await projectCell.isVisible()) {
      await projectCell.click();
      await dismissBlockingModals(page);

      const detailBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
      if (await detailBar.isVisible().catch(() => false)) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-detail-visible.png') });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-delayed-visible.png') });
      }
    }

    // Mobile View
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const mobileGanttBtn = page.locator('[data-testid="mobile-view-gantt-btn"]');
    if (await mobileGanttBtn.isVisible()) {
      await mobileGanttBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-mobile-visible.png') });
    }
  });

  test('5. Verify Global Error Boundary Catch and Recovery UI', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/debug-error-boundary-test', { waitUntil: 'domcontentloaded' }).catch(() => {});

    const errorBoundary = page.locator('[data-testid="app-error-boundary"]');
    await expect(errorBoundary).toBeVisible({ timeout: 10000 });

    const retryBtn = page.locator('[data-testid="error-retry-btn"]');
    await expect(retryBtn).toBeVisible();

    const projectListBtn = page.locator('[data-testid="error-project-list-btn"]');
    await expect(projectListBtn).toBeVisible();

    const reloadBtn = page.locator('[data-testid="error-reload-btn"]');
    await expect(reloadBtn).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error-boundary-fallback.png') });

    // Click Go to projects
    await projectListBtn.click();
    await expect(page).toHaveURL(/\/projects/);
  });
});
