import { test, expect } from '@playwright/test';

test.describe('Print Template 3: A4 Half-Year Projects Report', () => {
  test('should render A4 6-month projects summary table with 6 monthly columns', async ({ page }) => {
    await page.goto('/print/projects/half-year-a4?start=2026-07&lang=ko&colorMode=color');

    const shell = page.locator('.print-paper-a4');
    await expect(shell).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('반기 전체 프로젝트 요약 보고서');
  });
});
