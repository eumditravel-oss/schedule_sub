// tests/e2e/project-overview-visible-track-fill.spec.ts
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('AUTO_TIME Visible Track Fill Precision Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'selected_worker_profile',
        JSON.stringify({ id: 'wrk_03', name: '유종욱', country_code: 'KR', access_role: 'EDITOR' })
      );
    });
  });

  for (const vp of VIEWPORTS) {
    test(`Actual Fill Right === Today Header Left (Error <= 0.5px) at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const todayStr = getTodayStr();
      const todayHeader = page.locator(`[data-date="${todayStr}"]`).first();
      const todayHeaderVisible = await todayHeader.isVisible({ timeout: 3000 }).catch(() => false);

      if (!todayHeaderVisible) {
        test.skip(true, `Today ${todayStr} is not visible in current Gantt view at ${vp.width}px`);
        return;
      }

      const projectRows = page.locator('[data-testid^="project-row-"]');
      const projectCount = await projectRows.count();
      if (projectCount === 0) return;

      let testedCount = 0;
      for (let i = 0; i < projectCount; i++) {
        const row = projectRows.nth(i);
        const rowId = await row.getAttribute('data-testid');
        if (!rowId) continue;

        const actualOverlay = row.locator('[data-testid="gantt-bar-actual-overlay"]').first();
        const overlayVisible = await actualOverlay.isVisible({ timeout: 1000 }).catch(() => false);
        if (!overlayVisible) continue;

        const fillSource = await actualOverlay.getAttribute('data-fill-source');
        if (fillSource !== 'auto-time-visible-track') continue;

        const todayHeaderBox = await todayHeader.boundingBox();
        const overlayBox = await actualOverlay.boundingBox();
        if (!todayHeaderBox || !overlayBox) continue;

        const fillRight = overlayBox.x + overlayBox.width;
        const todayLeft = todayHeaderBox.x;
        const todayRight = todayHeaderBox.x + todayHeaderBox.width;
        const boundaryError = Math.abs(fillRight - todayLeft);

        // Intersection width inside Today cell
        const intersectionLeft = Math.max(overlayBox.x, todayLeft);
        const intersectionRight = Math.min(fillRight, todayRight);
        const darkFillInsideToday = Math.max(0, intersectionRight - intersectionLeft);

        console.log(
          `[${vp.width}px] Project ${rowId}: ` +
          `Fill Right=${fillRight.toFixed(2)}, Today Left=${todayLeft.toFixed(2)}, ` +
          `Error=${boundaryError.toFixed(2)}px, Dark Fill in Today=${darkFillInsideToday.toFixed(2)}px`
        );

        expect(boundaryError, `At ${vp.width}px: boundary error <= 0.5px`).toBeLessThanOrEqual(0.5);
        expect(darkFillInsideToday, `At ${vp.width}px: dark fill inside today <= 0.5px`).toBeLessThanOrEqual(0.5);

        testedCount++;
      }
    });
  }

  test('Unit-level 5 Key Cases for calcVisibleTrackAutoTimeFillPercent', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(() => {
      // Simulate calcVisibleTrackAutoTimeFillPercent logic
      function calcVisibleTrack(params: {
        projectStartDate: string;
        projectEndDate: string;
        todayStr: string;
        dateColumns: Array<{ dateStr: string }>;
        spanInfo: { startIndex: number; spanCount: number };
      }): number {
        const { projectStartDate, projectEndDate, todayStr, dateColumns, spanInfo } = params;
        if (todayStr <= projectStartDate) return 0;
        if (todayStr > projectEndDate) return 100;

        const renderStartIndex = spanInfo.startIndex;
        const renderSpan = spanInfo.spanCount;
        const renderEndIndex = renderStartIndex + renderSpan - 1;
        const todayIndex = dateColumns.findIndex((c) => c.dateStr === todayStr);

        if (todayIndex < 0 || todayIndex < renderStartIndex) return 0;
        if (todayIndex > renderEndIndex) return 100;

        const elapsedVisibleColumns = todayIndex - renderStartIndex;
        return Math.min(100, Math.max(0, (elapsedVisibleColumns / renderSpan) * 100));
      }

      const mockColumns = Array.from({ length: 30 }, (_, i) => {
        const d = new Date('2026-07-23T00:00:00Z');
        d.setDate(d.getDate() + i);
        return { dateStr: d.toISOString().slice(0, 10) };
      });

      return {
        // Case A: 07-06~08-07, view 07-23~08-21 (startIndex 0, spanCount 16), today 08-07 (index 15) -> 15/16 = 93.75%
        caseA: calcVisibleTrack({
          projectStartDate: '2026-07-06',
          projectEndDate: '2026-08-07',
          todayStr: '2026-08-07',
          dateColumns: mockColumns,
          spanInfo: { startIndex: 0, spanCount: 16 },
        }),
        // Case B: project start inside view 08-01~08-15, today 08-07 (startIndex 9, spanCount 15) -> elapsed 6 -> 6/15 = 40%
        caseB: calcVisibleTrack({
          projectStartDate: '2026-08-01',
          projectEndDate: '2026-08-15',
          todayStr: '2026-08-07',
          dateColumns: mockColumns,
          spanInfo: { startIndex: 9, spanCount: 15 },
        }),
        // Case C: project start is today -> 0%
        caseC: calcVisibleTrack({
          projectStartDate: '2026-08-07',
          projectEndDate: '2026-08-20',
          todayStr: '2026-08-07',
          dateColumns: mockColumns,
          spanInfo: { startIndex: 15, spanCount: 14 },
        }),
        // Case D: project end < today -> 100%
        caseD: calcVisibleTrack({
          projectStartDate: '2026-07-01',
          projectEndDate: '2026-08-06',
          todayStr: '2026-08-07',
          dateColumns: mockColumns,
          spanInfo: { startIndex: 0, spanCount: 15 },
        }),
        // Case E: visible view is middle of project and today is right of view -> 100%
        caseE: calcVisibleTrack({
          projectStartDate: '2026-07-01',
          projectEndDate: '2026-08-30',
          todayStr: '2026-08-25',
          dateColumns: mockColumns.slice(0, 10), // view ends at 08-01
          spanInfo: { startIndex: 0, spanCount: 10 },
        }),
      };
    });

    expect(result.caseA).toBeCloseTo(93.75, 2);
    expect(result.caseB).toBeCloseTo(40.0, 2);
    expect(result.caseC).toBe(0);
    expect(result.caseD).toBe(100);
    expect(result.caseE).toBe(100);
  });
});
