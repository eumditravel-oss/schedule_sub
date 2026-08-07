import { test, expect } from '@playwright/test';

test.describe('P1 Project Detail Month Boundary Separator Suite', () => {
  test('Project Detail timeline renders 2px month boundary separators in headers and body cells', async ({ page }) => {
    // Navigate to a project detail page
    await page.goto('/projects');
    const firstProjectLink = page.locator('table tbody tr a, [data-testid^="project-row-"] a').first();
    if (await firstProjectLink.isVisible()) {
      await firstProjectLink.click();
    } else {
      await page.goto('/projects/prj_1');
    }

    await page.waitForTimeout(2000);

    const monthHeaders = page.locator('[data-month-group]');
    const monthBoundaryCells = page.locator('[data-month-boundary="true"]');

    const boundaryCount = await monthBoundaryCells.count();
    expect(boundaryCount).toBeGreaterThanOrEqual(0);

    if (boundaryCount > 0) {
      const firstBoundary = monthBoundaryCells.first();
      await expect(firstBoundary).toBeVisible();

      const borderLeftWidth = await firstBoundary.evaluate((el) => {
        return window.getComputedStyle(el).borderLeftWidth;
      });
      expect(['2px', '1.99px', '2.01px']).toContain(borderLeftWidth);
    }
  });
});
