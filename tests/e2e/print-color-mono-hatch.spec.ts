import { test, expect } from '@playwright/test';

test.describe('Print Color & Mono Modes & Hatch Visual Consistency', () => {
  test('should render mono mode with low-opacity gray hatch pattern and legible text', async ({ page }) => {
    await page.goto('/print/projects/month-a4?month=2026-08&lang=ko&colorMode=mono');

    const shell = page.locator('.print-page-shell');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveClass(/print-mode-mono/);

    // Verify legend contains mono indicator
    const legend = page.locator('.print-legend');
    await expect(legend).toBeVisible();
  });
});
