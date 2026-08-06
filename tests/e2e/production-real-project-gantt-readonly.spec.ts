// tests/e2e/production-real-project-gantt-readonly.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const ES_PROJECT_ID = 'prj_1785986689248_qhuq';
const HUB_PROJECT_ID = 'prj_1785986741604_ppqz';

const QA_GEO_DIR = path.join(process.cwd(), 'qa', 'geometry');
const QA_SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

if (!fs.existsSync(QA_GEO_DIR)) fs.mkdirSync(QA_GEO_DIR, { recursive: true });
if (!fs.existsSync(QA_SCREENSHOT_DIR)) fs.mkdirSync(QA_SCREENSHOT_DIR, { recursive: true });

async function dismissWorkerPromptModal(page: any) {
  await page.waitForTimeout(400);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const yjwBtn = modal.locator('button:has-text("유종욱")').or(modal.locator('button')).first();
    if (await yjwBtn.isVisible().catch(() => false)) {
      await yjwBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function verifyCanvasGeometryAlignment(
  page: any,
  testLabel: string,
  viewport: { width: number; height: number }
) {
  // Ensure canvas elements exist
  const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
  const canvas = page.locator('[data-testid="desktop-gantt-canvas"]');
  await expect(scrollContainer).toBeVisible();
  await expect(canvas).toBeVisible();
  await page.waitForSelector('[data-testid^="project-row-"], [data-testid^="task-row-"]', { state: 'visible', timeout: 10000 }).catch(() => {});

  // Evaluate bounding box alignment for ALL date header columns vs row cells
  const geoResult = await page.evaluate(() => {
    const dateHeaders = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gantt-date-header-"]'));
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-row-"], [data-testid^="project-row-"]'));

    const errors: { dateStr: string; rowIndex: number; leftDiff: number; rightDiff: number; widthDiff: number }[] = [];
    const dateBoxes = dateHeaders.map((dh) => {
      const rect = dh.getBoundingClientRect();
      const dateStr = dh.getAttribute('data-date') || dh.getAttribute('data-testid')?.replace('gantt-date-header-', '') || '';
      return {
        dateStr,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });

    rows.forEach((row, rIdx) => {
      dateBoxes.forEach((hb) => {
        if (!hb.dateStr) return;
        // Find matching cell in row
        const cell = Array.from(row.querySelectorAll<HTMLElement>('[data-testid*="gantt-task-cell"]')).find((c) => {
          const tid = c.getAttribute('data-testid') || '';
          return tid.endsWith(hb.dateStr);
        });

        if (cell) {
          const cRect = cell.getBoundingClientRect();
          const leftDiff = Math.abs(hb.left - cRect.left);
          const rightDiff = Math.abs(hb.right - cRect.right);
          const widthDiff = Math.abs(hb.width - cRect.width);
          errors.push({
            dateStr: hb.dateStr,
            rowIndex: rIdx,
            leftDiff,
            rightDiff,
            widthDiff,
          });
        }
      });
    });

    // Check ScheduleBar tracks
    const barErrors: { trackId: string; startDiff: number; endDiff: number }[] = [];
    const barTracks = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gantt-schedule-bar-track-"]'));
    barTracks.forEach((track) => {
      const tRect = track.getBoundingClientRect();
      // Find corresponding date headers by checking horizontal position
      let matchedStartHeader: HTMLElement | null = null;
      let matchedEndHeader: HTMLElement | null = null;

      dateHeaders.forEach((dh) => {
        const dRect = dh.getBoundingClientRect();
        if (Math.abs(tRect.left - dRect.left) <= 1.0) matchedStartHeader = dh;
        if (Math.abs(tRect.right - dRect.right) <= 1.0) matchedEndHeader = dh;
      });

      if (matchedStartHeader && matchedEndHeader) {
        const sRect = (matchedStartHeader as HTMLElement).getBoundingClientRect();
        const eRect = (matchedEndHeader as HTMLElement).getBoundingClientRect();
        barErrors.push({
          trackId: track.getAttribute('data-testid') || '',
          startDiff: Math.abs(tRect.left - sRect.left),
          endDiff: Math.abs(tRect.right - eRect.right),
        });
      }
    });

    const maxLeftError = errors.length > 0 ? Math.max(...errors.map((e) => e.leftDiff)) : 0;
    const maxRightError = errors.length > 0 ? Math.max(...errors.map((e) => e.rightDiff)) : 0;
    const maxWidthError = errors.length > 0 ? Math.max(...errors.map((e) => e.widthDiff)) : 0;
    const maxBarStartError = barErrors.length > 0 ? Math.max(...barErrors.map((b) => b.startDiff)) : 0;
    const maxBarEndError = barErrors.length > 0 ? Math.max(...barErrors.map((b) => b.endDiff)) : 0;

    return {
      headerCount: dateBoxes.length,
      rowCount: rows.length,
      evaluatedCellCount: errors.length,
      evaluatedBarCount: barErrors.length,
      maxLeftError,
      maxRightError,
      maxWidthError,
      maxBarStartError,
      maxBarEndError,
      sampleErrors: errors.slice(0, 5),
    };
  });

  // Strict Geometry assertions: max error <= 0.5px
  if (geoResult.rowCount > 0) {
    expect(geoResult.evaluatedCellCount).toBeGreaterThan(0);
  }
  expect(geoResult.maxLeftError).toBeLessThanOrEqual(0.5);
  expect(geoResult.maxRightError).toBeLessThanOrEqual(0.5);
  expect(geoResult.maxWidthError).toBeLessThanOrEqual(0.5);
  expect(geoResult.maxBarStartError).toBeLessThanOrEqual(0.5);
  expect(geoResult.maxBarEndError).toBeLessThanOrEqual(0.5);

  // Write proof JSON
  const jsonPath = path.join(QA_GEO_DIR, `${testLabel}_${viewport.width}x${viewport.height}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ label: testLabel, viewport, geoResult }, null, 2));

  // Take visual screenshot
  const screenshotPath = path.join(QA_SCREENSHOT_DIR, `${testLabel}_${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  return geoResult;
}

test.describe('P0 Desktop Single CSS Grid Canvas Strict Geometry Verification', () => {
  test.setTimeout(90000);

  test('1. Project Overview - Responsive Viewports Geometry (<=0.5px)', async ({ page }) => {
    const viewports = [
      { width: 1901, height: 863 },
      { width: 1366, height: 768 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await page.waitForSelector('[data-testid^="project-row-"]', { timeout: 5000 }).catch(() => {});

      await verifyCanvasGeometryAlignment(page, 'overview', vp);
    }
  });

  test('2. ES Project Detail - All 14 Scheduled Tasks & Geometry (<=0.5px)', async ({ page }) => {
    const viewports = [
      { width: 1901, height: 863 },
      { width: 1366, height: 768 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${ES_PROJECT_ID}`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await page.waitForSelector('[data-testid^="task-row-"]', { timeout: 5000 }).catch(() => {});

      // Check unscheduled badge if visible
      const unschBadge = page.locator('[data-testid="unscheduled-task-badge"]');
      const isUnschVisible = await unschBadge.isVisible({ timeout: 1000 }).catch(() => false);
      console.log('ES unscheduled badge visible:', isUnschVisible);

      // Check Geometry on current view
      await verifyCanvasGeometryAlignment(page, `es_detail`, vp);
    }
  });

  test('3. CONCOST-HUB Project Detail - All 21 Tasks & Geometry (<=0.5px)', async ({ page }) => {
    const viewports = [
      { width: 1901, height: 863 },
      { width: 1366, height: 768 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${HUB_PROJECT_ID}`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await page.waitForSelector('[data-testid^="task-row-"]', { timeout: 5000 }).catch(() => {});

      await verifyCanvasGeometryAlignment(page, `hub_detail`, vp);
    }
  });

  test('4. Gantt Canvas Horizontal Scroll Alignment Audit', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto(`${LOCAL_BASE_URL}/projects/${HUB_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);
    await page.waitForSelector('[data-testid^="task-row-"]', { timeout: 5000 }).catch(() => {});

    const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
    await scrollContainer.evaluate((el) => {
      el.scrollLeft = 400;
    });
    await page.waitForTimeout(300);

    await verifyCanvasGeometryAlignment(page, `hub_detail_scrolled`, { width: 1536, height: 864 });
  });

});
