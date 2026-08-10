import { test, expect } from '@playwright/test';

test.describe('Print Template 7: A3 Custom Start 30-Day Schedule', () => {
  test('should render A3 custom date 30-day schedule with clear reference dates', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-08-01&lang=ko&colorMode=color');

    const shell = page.locator('.print-paper-a3');
    await expect(shell).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('사용자 지정 30일 일정표');
  });
});
