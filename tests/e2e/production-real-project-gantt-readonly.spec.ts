// tests/e2e/production-real-project-gantt-readonly.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:5174').trim();
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
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
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
  await monthBtn.waitFor({ state: 'visible', timeout: 15000 });
  
  const cls = (await monthBtn.getAttribute('class')) || '';
  const ariaPressed = await monthBtn.getAttribute('aria-pressed');
  const dataState = await monthBtn.getAttribute('data-state');
  const isAlreadyActive = ariaPressed === 'true' || dataState === 'active' || cls.includes('bg-white');
  if (!isAlreadyActive) {
    await monthBtn.click();
    await page.waitForTimeout(300);
  }
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
  monthStr?: string;
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

  const firstRow = page.locator('[data-testid^="project-row-"], [data-testid^="task-row-"]').first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });

  const rawResult = await page.evaluate(() => {
    const dateHeaders = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gantt-date-header-"]'));
    const rawMatched = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-row-"], [data-testid^="project-row-"]'));
    const matchedIds = rawMatched.map((r) => r.getAttribute('data-testid') || '');
    const rows = rawMatched.filter((r) => {
      const tid = r.getAttribute('data-testid') || '';
      return !tid.includes('group') && !tid.includes('drag-handle');
    });

    if (dateHeaders.length === 0 || rows.length === 0) {
      throw new Error('NO_GEOMETRY_MEASUREMENTS');
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

    if (errors.length === 0) {
      throw new Error('NO_GEOMETRY_CELL_EVALUATIONS');
    }

    const barErrors: { trackId: string; startDiff: number; endDiff: number; widthDiff: number }[] = [];
    const taskDetails: any[] = [];
    const barTracks = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gantt-schedule-bar-track-"]'));
    
    barTracks.forEach((track) => {
      const trackId = track.getAttribute('data-testid') || '';
      const taskId = trackId.replace('gantt-schedule-bar-track-', '');
      const tRect = track.getBoundingClientRect();
      const row = rows.find((r) => (r.getAttribute('data-testid') || '').includes(taskId));

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

      let startCellLeft = 0;
      let endCellRight = 0;
      let expectedWidthFromCells = 0;
      if (matchedStartHeader && matchedEndHeader) {
        const sRect = (matchedStartHeader as HTMLElement).getBoundingClientRect();
        const eRect = (matchedEndHeader as HTMLElement).getBoundingClientRect();
        startCellLeft = sRect.left;
        endCellRight = eRect.right;
        expectedWidthFromCells = eRect.right - sRect.left;

        const startDiff = Math.abs(tRect.left - sRect.left);
        const endDiff = Math.abs(tRect.right - eRect.right);
        const widthDiff = Math.abs(tRect.width - expectedWidthFromCells);

        barErrors.push({
          trackId,
          startDiff,
          endDiff,
          widthDiff,
        });
      }

      const visualBar = track.querySelector<HTMLElement>('[data-testid="gantt-schedule-bar"]');
      let leftInset = 0;
      let rightInset = 0;
      let overflowsTrack = false;
      if (visualBar) {
        const vRect = visualBar.getBoundingClientRect();
        leftInset = vRect.left - tRect.left;
        rightInset = tRect.right - vRect.right;
        overflowsTrack = vRect.left < tRect.left - 0.5 || vRect.right > tRect.right + 0.5;
      }

      taskDetails.push({
        taskId,
        taskName: row ? (row.querySelector('.truncate')?.textContent || '').trim() : '',
        startDate: matchedStartHeader ? (matchedStartHeader.getAttribute('data-date') || '') : '',
        endDate: matchedEndHeader ? (matchedEndHeader.getAttribute('data-date') || '') : '',
        timeline: {
          headerWidth: dateHeaders.reduce((acc, h) => acc + h.getBoundingClientRect().width, 0),
          bodyWidth: row ? Array.from(row.querySelectorAll('[data-testid*="gantt-task-cell"]')).reduce((acc, c) => acc + c.getBoundingClientRect().width, 0) : 0,
          barLayerWidth: track.parentElement ? track.parentElement.getBoundingClientRect().width : 0,
        },
        start: {
          bodyCellLeft: startCellLeft,
          barTrackLeft: tRect.left,
          error: Math.abs(tRect.left - startCellLeft),
        },
        end: {
          bodyCellRight: endCellRight,
          barTrackRight: tRect.right,
          error: Math.abs(tRect.right - endCellRight),
        },
        width: {
          expectedFromCells: expectedWidthFromCells,
          barTrackWidth: tRect.width,
          error: Math.abs(tRect.width - expectedWidthFromCells),
        },
        visualBar: {
          leftInset,
          rightInset,
          overflowsTrack,
        },
      });
    });

    const maxLeftError = Math.max(...errors.map((e) => e.leftDiff));
    const maxRightError = Math.max(...errors.map((e) => e.rightDiff));
    const maxWidthError = Math.max(...errors.map((e) => e.widthDiff));
    const maxBarStartError = barErrors.length > 0 ? Math.max(...barErrors.map((b) => b.startDiff)) : 0;
    const maxBarEndError = barErrors.length > 0 ? Math.max(...barErrors.map((b) => b.endDiff)) : 0;

    let firstMismatch: any = null;
    let worstMismatch: any = null;
    let worstVal = -1;

    errors.forEach((e) => {
      const maxErr = Math.max(e.leftDiff, e.rightDiff, e.widthDiff);
      if (maxErr > 0.5 && !firstMismatch) {
        firstMismatch = e;
      }
      if (maxErr > worstVal) {
        worstVal = maxErr;
        worstMismatch = e;
      }
    });

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
      firstMismatch,
      worstMismatch,
      taskDetails,
      matchedIds,
      sampleErrors: errors.slice(0, 5),
    };
  });

  // Strict Rejection of False Positives: zero counts must throw immediate failure
  if (rawResult.rowCount !== expectations.expectedRowCount) {
    console.log(`DEBUG MATCHED IDS for ${testLabel} (expected ${expectations.expectedRowCount}, got ${rawResult.rowCount}):`, rawResult.matchedIds);
  }
  expect(rawResult.headerCount).toBe(expectations.expectedHeaderCount);
  expect(rawResult.rowCount).toBe(expectations.expectedRowCount);
  expect(rawResult.evaluatedCellCount).toBe(expectations.expectedCellCount);
  if (expectations.expectedBarCount !== undefined) {
    expect(rawResult.evaluatedBarCount).toBe(expectations.expectedBarCount);
  }

  // Strict Geometry assertions: max error <= 0.5px
  expect(rawResult.maxLeftError).toBeLessThanOrEqual(0.5);
  expect(rawResult.maxRightError).toBeLessThanOrEqual(0.5);
  expect(rawResult.maxWidthError).toBeLessThanOrEqual(0.5);
  expect(rawResult.maxBarStartError).toBeLessThanOrEqual(0.5);
  expect(rawResult.maxBarEndError).toBeLessThanOrEqual(0.5);

  const proofPayload = {
    label: testLabel,
    viewport,
    viewMode: 'MONTH',
    month: expectations.monthStr || '2026-07',
    headerCount: rawResult.headerCount,
    expectedRowCount: expectations.expectedRowCount,
    rowCount: rawResult.rowCount,
    expectedCellCount: expectations.expectedCellCount,
    evaluatedCellCount: rawResult.evaluatedCellCount,
    expectedVisibleBarCount: expectations.expectedBarCount ?? 0,
    evaluatedBarCount: rawResult.evaluatedBarCount,
    maxLeftError: rawResult.maxLeftError,
    maxRightError: rawResult.maxRightError,
    maxWidthError: rawResult.maxWidthError,
    maxBarStartError: rawResult.maxBarStartError,
    maxBarEndError: rawResult.maxBarEndError,
    firstMismatch: rawResult.firstMismatch,
    worstMismatch: rawResult.worstMismatch,
    taskDetails: rawResult.taskDetails,
  };

  // Write proof JSON
  const jsonPath = path.join(QA_GEO_DIR, `${testLabel}_${viewport.width}x${viewport.height}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(proofPayload, null, 2));

  // Take visual screenshot
  const screenshotPath = path.join(QA_SCREENSHOT_DIR, `${testLabel}_${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  return proofPayload;
}

async function resolveProjectIds(page: any) {
  await page.goto(`${LOCAL_BASE_URL}/projects`);
  await page.waitForLoadState('networkidle');
  return await page.evaluate(() => {
    const defaultEs = 'prj_1785986689248_qhuq';
    const defaultHub = 'prj_1785986741604_ppqz';
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="project-row-"]'));
    let esId = defaultEs;
    let hubId = defaultHub;

    rows.forEach((r) => {
      const tid = r.getAttribute('data-testid') || '';
      const pid = tid.replace('project-row-', '');
      const text = r.textContent || '';
      if (text.includes('ES') && !esId.includes('1785986')) {
        esId = pid;
      }
      if ((text.includes('HUB') || text.includes('CONCOST')) && !hubId.includes('1785986')) {
        hubId = pid;
      }
      if (text.includes('ES') && pid.includes('1785986')) esId = pid;
      if ((text.includes('HUB') || text.includes('CONCOST')) && pid.includes('1785986')) hubId = pid;
    });

    return { esId, hubId };
  });
}

test.describe('P0 Desktop Single CSS Grid Canvas Strict Geometry Verification', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      console.log('Dialog opened and dismissed:', dialog.message());
      await dialog.dismiss().catch(() => {});
    });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
        window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      } catch {}
    });
  });

  test('1. Project Overview - Responsive 5 Viewports Geometry (<=0.5px)', async ({ page }) => {
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await ensureMonthView(page);

      const prjCount = await page.locator('[data-testid^="project-row-"]').count();

      // May 2026 for ES
      await navigateToTargetMonth(page, '2026-05');
      await verifyCanvasGeometryAlignment(page, 'overview_may', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: prjCount,
        expectedCellCount: prjCount * 31,
        monthStr: '2026-05',
      });

      // July 2026 for HUB
      await navigateToTargetMonth(page, '2026-07');
      await verifyCanvasGeometryAlignment(page, 'overview_july', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: prjCount,
        expectedCellCount: prjCount * 31,
        monthStr: '2026-07',
      });
    }
  });

  test('2. ES Project Detail - All 15 Tasks, 31 Days, 465 Cells & Geometry (<=0.5px)', async ({ page }) => {
    const { esId } = await resolveProjectIds(page);
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${esId}`);
      await page.waitForLoadState('networkidle');
      await dismissWorkerPromptModal(page);
      await ensureMonthView(page);
      await navigateToTargetMonth(page, '2026-05');
      await expandAllTaskGroups(page);

      // Check unscheduled task badge (ES 5.2)
      const unschBadge = page.locator('[data-testid="unscheduled-task-badge"]');
      const isUnschVisible = await unschBadge.isVisible({ timeout: 2000 }).catch(() => false);
      console.log('ES unscheduled badge visible:', isUnschVisible);

      // Check Geometry for May 2026 (31 days, 15 rows = 465 cells, 8 visible bars)
      await verifyCanvasGeometryAlignment(page, 'es_detail_may', vp, {
        expectedHeaderCount: 31,
        expectedRowCount: 15,
        expectedCellCount: 465,
        expectedBarCount: 8,
        monthStr: '2026-05',
      });
    }
  });

  test('3. CONCOST-HUB Project Detail - All 21 Tasks, 31 Days, 651 Cells & Geometry (<=0.5px)', async ({ page }) => {
    const { hubId } = await resolveProjectIds(page);
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
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
        monthStr: '2026-07',
      });
    }
  });

  test('4. Gantt Canvas Horizontal Scroll & Resize Alignment Audit', async ({ page }) => {
    const { hubId } = await resolveProjectIds(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
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
        monthStr: '2026-07',
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
        monthStr: '2026-07',
      });
    }
  });
});
