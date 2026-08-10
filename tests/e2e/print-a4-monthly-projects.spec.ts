import { test, expect } from '@playwright/test';

test.describe('Print Template 2: A4 Monthly Projects Report', () => {
  test('should render A4 monthly overview with KPI cards and project progress table', async ({ page }) => {
    await page.goto('/print/projects/month-a4?month=2026-08&lang=ko&colorMode=color');

    const shell = page.locator('.print-page-shell');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveClass(/print-paper-a4/);

    await expect(page.locator('.print-header')).toContainText('월간 전체 프로젝트 보고서');
    await expect(page.locator('.print-footer')).toBeVisible();
  });
});
