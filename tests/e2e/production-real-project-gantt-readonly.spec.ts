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

const ALL_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1901, height: 863 },
  { width: 1920, height: 1080 },
];

async function dismissWorkerPromptModal(page: any) {
  await page.waitForTimeout(300);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function ensureMonthView(page: any) {
  const monthBtn = page.locator('[data-testid="view-month-btn"]');
  await expect(monthBtn).toBeVisible({ timeout: 5000 });
  
  const isAlreadyActive = (await monthBtn.getAttribute('data-state')) === 'active' || (await monthBtn.getAttribute('aria-pressed')) === 'true';
  if (!isAlreadyActive) {
    await monthBtn.click();
    await page.waitForTimeout(300);
  }
  await expect(monthBtn).toHaveAttribute('data-state', 'active');
}

async function navigateToTargetMonth(page: any, targetYearMonthStr: string) {
  const prevBtn = page.locator('[data-testid="nav-prev-btn"]');
  const nextBtn = page.locator('[data-testid="nav-next-btn"]');
  const rangeToolbar = page.locator('section[data-testid="desktop-schedule-toolbar"]');

  await expect(rangeToolbar).toBeVisible();

  for (let i = 0; i < 15; i++) {
    const text = await rangeToolbar.textContent();
    if (text?.includes(targetYearMonthStr)) {
      break;
    }
    const match = text?.match(/(\d{4})년\s*(\d{1,2})월/);
    if (match) {
      const curY = parseInt(match[1], 10);
      const curM = parseInt(match[2], 10);
      const [tY, tM] = targetYearMonthStr.split('-').map((n) => parseInt(n, 10));

      const curVal = curY * 12 + curM;
      const targetVal = tY * 12 + tM;

      if (curVal > targetVal) {
        await expect(prevBtn).toBeVisible();
        await prevBtn.click();
        await page.waitForTimeout(300);
      } else if (curVal < targetVal) {
        await expect(nextBtn).toBeVisible();
        await nextBtn.click();
        await page.waitForTimeout(300);
      } else {
        break;
      }
    } else {
      await expect(prevBtn).toBeVisible();
      await prevBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function expandAllTaskGroups(page: any) {
  const toggleBtns = page.locator('[data-testid^="task-group-toggle-"]');
  const count = await toggleBtns.count();
  for (let i = 0; i < count; i++) {
    const btn = toggleBtns.nth(i);
    const html = await btn.innerHTML();
    if (html.includes('chevron-right') || html.includes('d="m9 18 6-6-6-6"')) {
      await btn.click();
      await page.waitForTimeout(100);
    }
  }
}

interface GeometryExpectations {
  expectedHeaderCount: number;
  expectedRowCount: number;
  expectedCellCount: number;
  expectedBarCount?: number;
}

async function verifyCanvasGeometryAlignment(
  page: any,
  testLabel: string,
  viewport: { width: number; height: number },
  expectations: GeometryExpectations
) {
  const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
  const canvas = page.locator('[data-testid="desktop-gantt-canvas"]');
  await expect(scrollContainer).toBeVisible();
  await expect(canvas).toBeVisible();

  const geoResult = await page.evaluate(() => {
    const dateHeaders = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gantt-date-header-"]'));
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-row-"], [data-testid^="project-row-"]'));

    if (dateHeaders.length === 0 || rows.length === 0) {
      return {
        error: 'NO_GEOMETRY_MEASUREMENTS',
        headerCount: dateHeaders.length,
        rowCount: rows.length,
        evaluatedCellCount: 0,
        evaluatedBarCount: 0,
        maxLeftError: 999,
        maxRightError: 999,
        maxWidthError: 999,
        maxBarStartError: 999,
        maxBarEndError: 999,
      };
    }

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

    const barErrors: { trackId: string; startDiff: number; endDiff: number }[] = [];
    const barTracks = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gantt-schedule-bar-track-"]'));
    barTracks.forEach((track) => {
      const tRect = track.getBoundingClientRect();
      let matchedStartHeader: HTMLElement | null = null;
      let matchedEndHeader: HTMLElement | null = null;

      dateHeaders.forEach((dh) => {
        const dRect = dh.getBoundingClientRect();
        if (Math.abs(tRect.left - dRect.left) <= 1.0 || (dRect.left <= tRect.left && tRect.left < dRect.right)) {
          if (!matchedStartHeader || Math.abs(tRect.left - dRect.left) < Math.abs(tRect.left - matchedStartHeader.getBoundingClientRect().left)) {
            matchedStartHeader = dh;
          }
        }
        if (Math.abs(tRect.right - dRect.right) <= 1.0 || (dRect.left < tRect.right && tRect.right <= dRect.right)) {
          if (!matchedEndHeader || Math.abs(tRect.right - dRect.right) < Math.abs(tRect.right - matchedEndHeader.getBoundingClientRect().right)) {
            matchedEndHeader = dh;
          }
        }
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

    if (errors.length === 0) {
      return {
        error: 'NO_GEOMETRY_CELL_EVALUATIONS',
        headerCount: dateBoxes.length,
        rowCount: rows.length,
        evaluatedCellCount: 0,
        evaluatedBarCount: barTracks.length,
        maxLeftError: 999,
        maxRightError: 999,
        maxWidthError: 999,
        maxBarStartError: 999,
        maxBarEndError: 999,
      };
    }

    const maxLeftError = Math.max(...errors.map((e) => e.leftDiff));
    const maxRightError = Math.max(...errors.map((e) => e.rightDiff));
    const maxWidthError = Math.max(...errors.map((e) => e.widthDiff));
    const maxBarStartError = barErrors.length > 0 ? Math.max(...barErrors.map((b) => b.startDiff)) : 0;
    const maxBarEndError = barErrors.length > 0 ? Math.max(...barErrors.map((b) => b.endDiff)) : 0;

    return {
      headerCount: dateBoxes.length,
      rowCount: rows.length,
      evaluatedCellCount: errors.length,
      evaluatedBarCount: barTracks.length,
      maxLeftError,
      maxRightError,
      maxWidthError,
      maxBarStartError,
      maxBarEndError,
      sampleErrors: errors.slice(0, 5),
    };
  });

  // Strict Rejection of False Positives: zero counts must throw immediate failure
  expect(geoResult.headerCount).toBe(expectations.expectedHeaderCount);
  expect(geoResult.rowCount).toBe(expectations.expectedRowCount);
  expect(geoResult.evaluatedCellCount).toBe(expectations.expectedCellCount);
  if (expectations.expectedBarCount !== undefined) {
    expect(geoResult.evaluatedBarCount).toBe(expectations.expectedBarCount);
  }

  // Strict Geometry assertions: max error <= 0.5px
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
  test.setTimeout(120000);

  test('1. Project Overview - Responsive 5 Viewports Geometry (<=0.5px)', async ({ page }) => {
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await ensureMonthView(page);

      // May 2026 for ES
      await navigateToTargetMonth(page, '2026-05');
      await verifyCanvasGeometryAlignment(page, 'overview_may', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: 2,
        expectedCellCount: 62,
        expectedBarCount: 1,
      });

      // July 2026 for HUB
      await navigateToTargetMonth(page, '2026-07');
      await verifyCanvasGeometryAlignment(page, 'overview_july', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: 2,
        expectedCellCount: 62,
        expectedBarCount: 1,
      });
    }
  });

  test('2. ES Project Detail - All 15 Tasks, 31 Days, 465 Cells & Geometry (<=0.5px)', async ({ page }) => {
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${ES_PROJECT_ID}`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await ensureMonthView(page);
      await navigateToTargetMonth(page, '2026-05');
      await expandAllTaskGroups(page);

      // Ensure unscheduled task badge exists (ES 5.2)
      const unschBadge = page.locator('[data-testid="unscheduled-task-badge"]');
      await expect(unschBadge).toBeVisible();

      // Check Geometry for May 2026 (31 days, 15 rows = 465 cells, 8 visible bars)
      await verifyCanvasGeometryAlignment(page, 'es_detail_may', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: 15,
        expectedCellCount: 465,
        expectedBarCount: 8,
      });
    }
  });

  test('3. CONCOST-HUB Project Detail - All 21 Tasks, 31 Days, 651 Cells & Geometry (<=0.5px)', async ({ page }) => {
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${HUB_PROJECT_ID}`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await ensureMonthView(page);
      await navigateToTargetMonth(page, '2026-07');
      await expandAllTaskGroups(page);

      // Check Geometry for July 2026 (31 days, 21 rows = 651 cells, 20 visible bars)
      await verifyCanvasGeometryAlignment(page, 'hub_detail_july', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: 21,
        expectedCellCount: 651,
        expectedBarCount: 20,
      });
    }
  });

  test('4. Gantt Canvas Horizontal Scroll & Resize Alignment Audit', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${LOCAL_BASE_URL}/projects/${HUB_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);
    await ensureMonthView(page);
    await navigateToTargetMonth(page, '2026-07');
    await expandAllTaskGroups(page);

    const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
    await expect(scrollContainer).toBeVisible();

    // Scroll positions 0%, 25%, 50%, 75%, 100%
    const scrollMax = await scrollContainer.evaluate((el: HTMLElement) => el.scrollWidth - el.clientWidth);
    for (const pct of [0, 0.25, 0.5, 0.75, 1.0]) {
      const targetScroll = Math.round(scrollMax * pct);
      await scrollContainer.evaluate((el: HTMLElement, s: number) => { el.scrollLeft = s; }, targetScroll);
      await page.waitForTimeout(100);

      await verifyCanvasGeometryAlignment(page, `hub_scroll_${Math.round(pct * 100)}`, { width: 1024, height: 768 }, {
        expectedHeaderCount: 31,
        expectedRowCount: 21,
        expectedCellCount: 651,
        expectedBarCount: 20,
      });
    }

    // Resize flow: 1901 -> 1536 -> 1366 -> 1024 -> 1920 without F5
    const resizeFlow = [
      { width: 1901, height: 863 },
      { width: 1536, height: 864 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 1920, height: 1080 },
    ];

    for (const vp of resizeFlow) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      await verifyCanvasGeometryAlignment(page, `hub_resize_${vp.width}`, vp, {
        expectedHeaderCount: 31,
        expectedRowCount: 21,
        expectedCellCount: 651,
        expectedBarCount: 20,
      });
    }
  });
});
