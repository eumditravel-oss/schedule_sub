import { test, expect } from '@playwright/test';

test.describe('P1 Project Detail Month Boundary Separator Suite', () => {
  test('Project Detail timeline renders 2px month boundary separators in headers and body cells', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const crossMonthProjectId = await page.locator('[data-testid^="project-row-"]').evaluateAll((rows) => {
      const match = rows.find((row) => {
        const start = row.getAttribute('data-project-start') || '';
        const end = row.getAttribute('data-project-end') || '';
        return start.slice(0, 7) !== end.slice(0, 7);
      });
      return match?.getAttribute('data-testid')?.replace('project-row-', '') || null;
    });

    expect(crossMonthProjectId).toBeTruthy();
    await page.goto(`/projects/${crossMonthProjectId}`);
    await page.waitForLoadState('networkidle');

    const firstBoundary = page.locator('[data-testid^="gantt-date-header-"][data-month-boundary="true"]').first();
    await expect(firstBoundary).toBeVisible();

    const borderLeftWidth = await firstBoundary.evaluate((el) => window.getComputedStyle(el).borderLeftWidth);
    expect(['2px', '1.99px', '2.01px']).toContain(borderLeftWidth);

    const dateStr = await firstBoundary.getAttribute('data-date');
    expect(dateStr).toBeTruthy();

    const continuousLine = page.locator(`[data-testid="gantt-month-boundary-line-detail-${dateStr}"]`);
    await expect(continuousLine).toBeVisible();
    const [headerBox, lineBox, gridBox] = await Promise.all([
      firstBoundary.boundingBox(),
      continuousLine.boundingBox(),
      page.locator('[data-testid="gantt-month-boundary-grid-detail"]').boundingBox(),
    ]);

    expect(Math.abs((headerBox?.x || 0) - (lineBox?.x || 0))).toBeLessThanOrEqual(0.5);
    expect(lineBox?.height || 0).toBeGreaterThan(0);
    expect(Math.abs((lineBox?.height || 0) - (gridBox?.height || 0))).toBeLessThanOrEqual(0.5);
  });
});
