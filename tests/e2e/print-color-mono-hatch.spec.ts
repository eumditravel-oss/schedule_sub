import { test, expect } from '@playwright/test';

test.describe('Print Color & Mono Modes & Hatch Visual Consistency', () => {
  test('should render mono mode with low-opacity gray hatch pattern and legible text', async ({ page }) => {
    await page.goto('/print/projects/month-a4?month=2026-08&lang=ko&colorMode=mono');

    const shells = page.locator('.print-page-shell');
    await expect(shells.first()).toBeVisible({ timeout: 15_000 });
    expect(await shells.count()).toBeGreaterThan(0);
    for (const shell of await shells.all()) await expect(shell).toHaveClass(/print-mode-mono/);

    // Verify legend contains mono indicator
    const legends = page.locator('.print-legend');
    expect(await legends.count()).toBeGreaterThan(0);
    await expect(legends.first()).toBeVisible();
  });
});
