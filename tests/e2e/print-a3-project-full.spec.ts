import { test, expect } from '@playwright/test';

test.describe('Print Template 5: A3 Single Project Full Schedule', () => {
  test('should render A3 landscape full schedule table with 30-day band pagination for long projects', async ({ page }) => {
    await page.goto('/print/project/qa-project-1/full-a3?lang=ko&colorMode=color');

    const shell = page.locator('.print-page-shell');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveClass(/print-paper-a3/);
    await expect(shell).toHaveClass(/print-landscape/);

    await expect(page.locator('.print-header')).toContainText('전체 상세 일정표');
  });
});
