import { test, expect } from '@playwright/test';

test.describe('Print Template 4: A4 Annual Roadmap Report', () => {
  test('should render A4 12-month executive roadmap matrix', async ({ page }) => {
    await page.goto('/print/projects/year-a4?year=2026&lang=ko&colorMode=color');

    const shell = page.locator('.print-paper-a4');
    await expect(shell).toHaveCount(2);
    await expect(shell.first()).toHaveClass(/print-landscape/);
    await expect(page.locator('.print-header').first()).toContainText('경영 보고용 프로젝트 로드맵');
    await expect(page.getByTestId('annual-roadmap-table')).toBeVisible();
  });
});
