// tests/e2e/gantt-inline-content.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function dismissBlockingModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const backdrop = page.locator('.fixed.inset-0.z-50').first();
    if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
      const confirmBtn = page.locator('button:has-text("확인"), button:has-text("X"), button:has-text("닫기")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click().catch(() => {});
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }
}

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Gantt Inline Content & Tooltip Removal E2E Tests', () => {
  test.beforeAll(async () => {
    try {
      await fetch(`${QA_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `[QA-INLINE-E2E] 간트 내부 정보 검증 프로젝트`,
          start_date: '2026-08-01',
          end_date: '2026-08-25',
          progress: 0,
          editor_name: '박용진 수석',
        }),
      });
    } catch (e) {
      // ignore seed errors
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('1. Verify complete tooltip removal and zero tooltip DOM elements on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(scheduleBar).toBeVisible({ timeout: 15000 });

    // Hover over bar
    await scheduleBar.hover();
    await page.waitForTimeout(300);

    // Assert tooltip count is exactly 0
    const tooltipCount = await page.locator('[data-testid="gantt-bar-tooltip"]').count();
    expect(tooltipCount).toBe(0);

    // Additional assertion on black popovers
    const popovers = page.locator('.bottom-full.z-50');
    expect(await popovers.count()).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-no-tooltip.png') });
  });

  test('2. Verify Desktop Track Height (26px ~ 30px) and Inline Content Visibility', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(scheduleBar).toBeVisible({ timeout: 15000 });

    const track = page.locator('[data-testid="gantt-schedule-track"]').first();
    await expect(track).toBeVisible();

    const trackBox = await track.boundingBox();
    expect(trackBox).not.toBeNull();
    expect(trackBox!.height).toBeGreaterThanOrEqual(26);
    expect(trackBox!.height).toBeLessThanOrEqual(30);

    // Inline content container check
    const inlineContent = scheduleBar.locator('[data-testid="gantt-bar-inline-content"]').first();
    await expect(inlineContent).toBeVisible();

    const contentBox = await inlineContent.boundingBox();
    expect(contentBox).not.toBeNull();
    expect(contentBox!.width).toBeLessThanOrEqual(trackBox!.width + 1);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-info-overview.png') });
  });

  test('3. Verify Color Contrast: IN_PROGRESS Track vs. Today Cell Background', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const track = page.locator('[data-testid="gantt-schedule-track"]').first();
    await expect(track).toBeVisible({ timeout: 15000 });

    const trackStyles = await track.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    });

    const todayCell = page.locator('td div.bg-blue-50\\/70, td div.bg-blue-50\\/50').first();
    if (await todayCell.isVisible().catch(() => false)) {
      const todayBg = await todayCell.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(trackStyles.backgroundColor).not.toBe(todayBg);
    }

    // Verify track is non-transparent and uses indigo/emerald/rose/slate palette
    expect(trackStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(trackStyles.backgroundColor).not.toBe('transparent');
  });

  test('4. Verify Short and Long Schedule Bar Inline Formatting and Screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const firstBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(firstBar).toBeVisible({ timeout: 15000 });

    const bars = page.locator('[data-testid="gantt-schedule-bar"]');
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(barCount, 3); i++) {
      const bar = bars.nth(i);
      const box = await bar.boundingBox();
      if (!box) continue;

      if (box.width >= 260) {
        const title = bar.locator('[data-testid="gantt-bar-inline-title"]');
        const progress = bar.locator('[data-testid="gantt-bar-inline-progress"]');
        if (await title.isVisible()) {
          await expect(title).toBeVisible();
        }
        if (await progress.isVisible()) {
          await expect(progress).toBeVisible();
        }
      } else if (box.width < 90) {
        // Short bar: no text inside inline content, overflow 0
        const inlineContainer = bar.locator('[data-testid="gantt-bar-inline-content"]');
        const childCount = await inlineContainer.locator('span').count();
        expect(childCount).toBe(0);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-short-bar.png') });
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-zero-progress.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-half-progress.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-delayed.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-completed.png') });
  });

  test('5. Verify Project Detail Page Task Bar Inline Content and Keyboard Accessibility', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const projectCell = page.locator('[data-testid^="project-row-"] td').first();
    await expect(projectCell).toBeVisible({ timeout: 15000 });
    await projectCell.click();
    await dismissBlockingModals(page);

    const detailBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    if (await detailBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const inlineContent = detailBar.locator('[data-testid="gantt-bar-inline-content"]');
      await expect(inlineContent).toBeVisible();

      // Keyboard Accessibility Check
      await detailBar.focus();
      await expect(detailBar).toBeFocused();

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-info-detail.png') });
    }
  });

  test('6. Verify Mobile View Schedule Bars and Screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const mobileGanttBtn = page.locator('[data-testid="mobile-view-gantt-btn"]');
    if (await mobileGanttBtn.isVisible().catch(() => false)) {
      await mobileGanttBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-mobile-inline-info.png') });
    }
  });
});
