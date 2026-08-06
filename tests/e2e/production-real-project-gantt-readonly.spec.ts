// tests/e2e/production-real-project-gantt-readonly.spec.ts
import { test, expect } from '@playwright/test';

const PROD_BASE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev';
const ES_PROJECT_ID = 'prj_1785983399825_tytr';
const HUB_PROJECT_ID = 'prj_1785983453697_gc6p';

async function dismissWorkerPromptModal(page: any) {
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const yjwBtn = modal.locator('button:has-text("유종욱")').or(modal.locator('button')).first();
    if (await yjwBtn.isVisible().catch(() => false)) {
      await yjwBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Production Real Project Read-Only Audit & Geometry Alignment Suite', () => {

  test('1. Verify ES Production Real Project (14 Scheduled Bars + 1 Unscheduled Badge)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate to ES Project Detail Page
    await page.goto(`${PROD_BASE_URL}/projects/${ES_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Verify 1 Unscheduled Badge
    const unschBadge = page.locator('[data-testid="unscheduled-task-badge"]');
    await expect(unschBadge).toBeVisible();
    expect(await unschBadge.count()).toBe(1);

    // Month view check: May 2026 (8 visible bars)
    const monthSelect = page.locator('select').filter({ hasText: /2026/ }).first();
    if (await monthSelect.isVisible().catch(() => false)) {
      await monthSelect.selectOption({ label: '2026년 5월' }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const mayTracks = page.locator('[data-testid^="gantt-schedule-bar-track-"]');
    const mayCount = await mayTracks.count();
    expect(mayCount).toBe(8);

    // Month view check: June 2026 (7 visible bars)
    if (await monthSelect.isVisible().catch(() => false)) {
      await monthSelect.selectOption({ label: '2026년 6월' }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const juneTracks = page.locator('[data-testid^="gantt-schedule-bar-track-"]');
    const juneCount = await juneTracks.count();
    expect(juneCount).toBe(7);

    // Total unique scheduled bars in ES = 14
    expect(mayCount + juneCount - 1).toBe(14); // 1 task spans across May and June
  });

  test('2. Verify CONCOST-HUB Production Real Project (21 Scheduled Bars)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate to HUB Project Detail Page
    await page.goto(`${PROD_BASE_URL}/projects/${HUB_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Month view check: July 2026 (20 visible bars)
    const monthSelect = page.locator('select').filter({ hasText: /2026/ }).first();
    if (await monthSelect.isVisible().catch(() => false)) {
      await monthSelect.selectOption({ label: '2026년 7월' }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const julyTracks = page.locator('[data-testid^="gantt-schedule-bar-track-"]');
    const julyCount = await julyTracks.count();
    expect(julyCount).toBe(20);

    // Month view check: August 2026 (1 visible bar)
    if (await monthSelect.isVisible().catch(() => false)) {
      await monthSelect.selectOption({ label: '2026년 8월' }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const augTracks = page.locator('[data-testid^="gantt-schedule-bar-track-"]');
    const augCount = await augTracks.count();
    expect(augCount).toBe(1);

    expect(julyCount + augCount).toBe(21);
  });

  test('3. Verify ScheduleBar Visibility over Hatch Layer & elementFromPoint Integrity', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${PROD_BASE_URL}/projects/${ES_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const tracks = page.locator('[data-testid^="gantt-schedule-bar-track-"]');
    const count = await tracks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const track = tracks.nth(i);
      await expect(track).toBeVisible();

      const box = await track.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);

      // Verify elementFromPoint hits ScheduleBar or child, NOT opaque hatch background
      const hitTag = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.tagName.toLowerCase() : '';
      }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });

      expect(hitTag).not.toBe('worker-off-hatch');
    }
  });

  test('4. Verify Responsive Viewports & Header-Body Column Geometry Alignment', async ({ page }) => {
    const viewports = [
      { width: 1024, height: 768 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto(`${PROD_BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');

      const headers = page.locator('[data-testid^="gantt-date-header-"]');
      const cells = page.locator(`[data-testid^="gantt-task-cell-overview-${HUB_PROJECT_ID}-"]`);

      const hCount = await headers.count();
      const cCount = await cells.count();
      expect(hCount).toBeGreaterThan(0);
      expect(cCount).toBeGreaterThan(0);

      const h0Box = await headers.first().boundingBox();
      const c0Box = await cells.first().boundingBox();

      expect(h0Box).not.toBeNull();
      expect(c0Box).not.toBeNull();
      expect(Math.abs(h0Box!.x - c0Box!.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(h0Box!.width - c0Box!.width)).toBeLessThanOrEqual(0.5);
    }
  });
});
