import { test, expect } from '@playwright/test';

test.describe('Print Template 6: A3 Today 30-Day Rolling Schedule', () => {
  test('should render A3 today 30-day schedule table', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=today&lang=ko&colorMode=color');

    const shell = page.locator('.print-paper-a3');
    await expect(shell).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('30일 전체 프로젝트 일정표');
  });
});
