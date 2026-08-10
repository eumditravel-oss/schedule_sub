import { test, expect } from '@playwright/test';

test.describe('Print Template 4: A4 Annual Roadmap Report', () => {
  test('should render A4 12-month executive roadmap matrix', async ({ page }) => {
    await page.goto('/print/projects/year-a4?year=2026&lang=ko&colorMode=color');

    const shell = page.locator('.print-paper-a4');
    await expect(shell).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('연간 경영 보고용 연간 로드맵');
  });
});
