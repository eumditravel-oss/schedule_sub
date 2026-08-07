import { test, expect } from '@playwright/test';

test.describe('P0 Open API Entry Button Production Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Verify Open API button DOM presence, visibility, bounding box, and modal opening', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');

    // 1. Verify open-integration-api-btn DOM presence and visibility
    const openApiBtn = page.locator('[data-testid="open-integration-api-btn"]');
    await expect(openApiBtn).toBeVisible({ timeout: 10000 });

    // 2. Verify bounding box width > 0, height > 0
    const box = await openApiBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // 3. Verify CSS styling & non-hidden
    const isHidden = await openApiBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    });
    expect(isHidden).toBe(false);

    // 4. Click Open API button to launch IntegrationManagerModal
    await openApiBtn.click();

    const modal = page.locator('[data-testid="integration-manager-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 5. Verify Close via ESC key
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });
});
