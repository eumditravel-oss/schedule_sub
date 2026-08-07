import { test, expect } from '@playwright/test';

test.describe('P1 Open API Entry Button & Integration Modal Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Open API button is visible in Legend Row and opens IntegrationManagerModal', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const openApiBtn = page.locator('[data-testid="open-integration-api-btn"]');
    await expect(openApiBtn).toBeVisible({ timeout: 10000 });
    await expect(openApiBtn).toHaveText(/Open API/);

    await openApiBtn.click();

    const modal = page.locator('[data-testid="integration-manager-modal"]');
    await expect(modal).toBeVisible();

    // Verify OpenAPI & CLI docs tab is clickable and viewable
    const docsTab = page.locator('[data-testid="integration-tab-docs"]');
    await expect(docsTab).toBeVisible();
    await docsTab.click();

    await expect(page.getByText('OpenAPI 3.0 Spec Endpoint')).toBeVisible();

    // Close modal
    const closeBtn = page.locator('[data-testid="integration-modal-close-btn"]');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
