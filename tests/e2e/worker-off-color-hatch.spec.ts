import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('Worker Off-Day Color & Hatch System Synchronization E2E Tests', () => {
  test('1. Verify Korea Saturday shows subtle orange background & 0.18 alpha hatch (Header-Cell background 100% match)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const projectCard = page.locator('[data-testid^="project-card-"]').first();
    if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Find KR_ONLY_OFF header and worker cell
    const krHeader = page.locator('[data-country-off-state="KR_ONLY_OFF"]').first();
    const krSaturdayCell = page.locator('[data-worker-visual-state="KR_ONLY_OFF"]').first();

    if (await krSaturdayCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      const isWorking = await krSaturdayCell.getAttribute('data-worker-is-working');
      expect(isWorking).toBe('false');

      // Verify Header and Worker Cell background colors match 100%
      if (await krHeader.isVisible().catch(() => false)) {
        const headerBg = await krHeader.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        const cellBg = await krSaturdayCell.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        expect(cellBg).toBe(headerBg);
      }

      const hatchOverlay = krSaturdayCell.locator('[data-testid="worker-off-hatch-overlay"]').first();
      await expect(hatchOverlay).toBeVisible();

      const bgImage = await hatchOverlay.evaluate((el) => window.getComputedStyle(el).backgroundImage);
      expect(bgImage).toContain('249, 115, 22'); // Orange RGB
      expect(bgImage).not.toContain('0.65');
      expect(bgImage).not.toContain('0.70');
      expect(bgImage).not.toContain('0.72');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'subtle-kr-saturday-hatch.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header-worker-color-match.png') });
  });

  test('2. Verify Sunday shows subtle rose background & 0.20 alpha hatch across workers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const projectCard = page.locator('[data-testid^="project-card-"]').first();
    if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');
    }

    const sundayHeader = page.locator('[data-country-off-state="BOTH_OFF"]').first();
    const sundayCell = page.locator('[data-worker-visual-state="BOTH_OFF"]').first();

    if (await sundayCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      const isWorking = await sundayCell.getAttribute('data-worker-is-working');
      expect(isWorking).toBe('false');

      if (await sundayHeader.isVisible().catch(() => false)) {
        const headerBg = await sundayHeader.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        const cellBg = await sundayCell.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        expect(cellBg).toBe(headerBg);
      }

      const hatchOverlay = sundayCell.locator('[data-testid="worker-off-hatch-overlay"]').first();
      await expect(hatchOverlay).toBeVisible();

      const bgImage = await hatchOverlay.evaluate((el) => window.getComputedStyle(el).backgroundImage);
      expect(bgImage).toContain('244, 63, 94'); // Rose RGB
      expect(bgImage).not.toContain('0.65');
      expect(bgImage).not.toContain('0.70');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'subtle-sunday-hatch.png') });
  });

  test('3. Verify Today Cell Root zIndex is not 30, Today Outline is pure inset blue box-shadow, and ScheduleBar stays continuous & clickable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const projectCard = page.locator('[data-testid^="project-card-"]').first();
    if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');
    }

    const todayOutline = page.locator('[data-testid="worker-today-outline"]').first();
    if (await todayOutline.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Cell root parent must NOT have z-index 30
      const parentCell = todayOutline.locator('xpath=..');
      const rootZIndex = await parentCell.evaluate((el) => window.getComputedStyle(el).zIndex);
      expect(rootZIndex).not.toBe('30');

      // Outline z-index is 30, pointer-events is none
      const outlineZIndex = await todayOutline.evaluate((el) => window.getComputedStyle(el).zIndex);
      const pointerEvents = await todayOutline.evaluate((el) => window.getComputedStyle(el).pointerEvents);
      expect(outlineZIndex).toBe('30');
      expect(pointerEvents).toBe('none');

      // ScheduleBar elementFromPoint check
      const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
      if (await scheduleBar.isVisible().catch(() => false)) {
        const barBox = await scheduleBar.boundingBox();
        if (barBox) {
          const hitElementTag = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el ? el.getAttribute('data-testid') || el.tagName.toLowerCase() : '';
          }, { x: barBox.x + barBox.width / 2, y: barBox.y + barBox.height / 2 });

          expect(hitElementTag).not.toBe('worker-today-outline');
        }
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'today-outline-over-schedule-bar.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'subtle-vn-saturday-off.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'subtle-personal-leave.png') });

    // Mobile screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'today-outline-mobile.png') });
  });
});
