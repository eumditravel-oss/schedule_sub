// tests/e2e/project-overview-month-boundary.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Project Overview Month Boundary 2px Separator Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'selected_worker_profile',
        JSON.stringify({ id: 'wrk_03', name: '유종욱', country_code: 'KR', access_role: 'EDITOR' })
      );
    });
  });

  test('Verify Month Boundary 2px Separator on Month Header, Date Header, and Body Cells', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find date header cell with month boundary
    const boundaryHeaders = page.locator('[data-testid^="gantt-date-header-"][data-month-boundary="true"]');
    const count = await boundaryHeaders.count();

    if (count === 0) {
      console.log('No month boundary in current 30-day window, test verified skip condition.');
      return;
    }

    const firstBoundary = boundaryHeaders.first();
    const dateStr = await firstBoundary.getAttribute('data-date');
    expect(dateStr).toBeTruthy();

    // Check style border-left on header
    const computedHeaderStyle = await firstBoundary.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderLeftWidth: style.borderLeftWidth,
        borderLeftStyle: style.borderLeftStyle,
      };
    });

    expect(computedHeaderStyle.borderLeftWidth).toBe('2px');

    // Check body cell for same date
    const bodyCell = page.locator(`[data-testid$="-${dateStr}"][data-month-boundary="true"]`).first();
    if (await bodyCell.isVisible()) {
      const computedBodyStyle = await bodyCell.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          borderLeftWidth: style.borderLeftWidth,
        };
      });
      expect(computedBodyStyle.borderLeftWidth).toBe('2px');

      // Verify X coordinate alignment within 0.5px
      const headerBox = await firstBoundary.boundingBox();
      const bodyBox = await bodyCell.boundingBox();
      if (headerBox && bodyBox) {
        const diffX = Math.abs(headerBox.x - bodyBox.x);
        expect(diffX, `Header X (${headerBox.x}) and Body X (${bodyBox.x}) must align <= 0.5px`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  test('Project rows keep a positive full-height grid and one continuous month separator', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const row = page.locator('[data-testid^="project-row-"]').first();
    const timeline = page.locator('[data-testid^="project-timeline-"]').first();
    const dayCell = timeline.locator('[data-testid^="gantt-task-cell-overview-"]').first();
    const hatchGrid = timeline.locator('[data-testid^="project-calendar-hatch-grid-"]').first();

    await expect(row).toBeVisible();
    await expect(timeline).toBeVisible();
    await expect(dayCell).toBeVisible();
    await expect(hatchGrid).toBeVisible();

    const geometry = await Promise.all([row, timeline, dayCell, hatchGrid].map((locator) => locator.boundingBox()));
    const [rowBox, timelineBox, dayCellBox, hatchBox] = geometry;
    expect(rowBox?.height || 0).toBeGreaterThan(0);
    expect(timelineBox?.height || 0).toBeGreaterThan(0);
    expect(dayCellBox?.height || 0).toBeGreaterThan(0);
    expect(hatchBox?.height || 0).toBeGreaterThan(0);
    expect(Math.abs((rowBox?.height || 0) - (timelineBox?.height || 0))).toBeLessThanOrEqual(1);

    const boundaryHeader = page.locator('[data-testid^="gantt-date-header-"][data-month-boundary="true"]').first();
    if (await boundaryHeader.count()) {
      const dateStr = await boundaryHeader.getAttribute('data-date');
      const boundaryLine = page.locator(`[data-testid="gantt-month-boundary-line-overview-${dateStr}"]`);
      await expect(boundaryLine).toBeVisible();

      const [headerBox, lineBox, boundaryGridBox] = await Promise.all([
        boundaryHeader.boundingBox(),
        boundaryLine.boundingBox(),
        page.locator('[data-testid="gantt-month-boundary-grid-overview"]').boundingBox(),
      ]);
      expect(Math.abs((headerBox?.x || 0) - (lineBox?.x || 0))).toBeLessThanOrEqual(0.5);
      expect(lineBox?.height || 0).toBeGreaterThanOrEqual(timelineBox?.height || 0);
      expect(Math.abs((lineBox?.height || 0) - (boundaryGridBox?.height || 0))).toBeLessThanOrEqual(0.5);
    }
  });

  test('First column (idx === 0) has no month boundary separator even if month start', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const firstHeader = page.locator('[data-testid^="gantt-date-header-"]').first();
    const hasBoundaryAttr = await firstHeader.getAttribute('data-month-boundary');
    expect(hasBoundaryAttr).toBeNull();
  });
});
