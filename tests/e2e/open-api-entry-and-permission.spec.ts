import { test, expect } from '@playwright/test';

test.describe('P1 Open API Entry & Role Permission Suite', () => {
  test('Permission User (박용진 수석) sees Open API button and enabled Create Key button', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');

    const openApiBtn = page.locator('[data-testid="open-integration-api-btn"]');
    await expect(openApiBtn).toBeVisible({ timeout: 10000 });
    await expect(openApiBtn).toHaveText(/Open API/);

    await openApiBtn.click();

    const modal = page.locator('[data-testid="integration-manager-modal"]');
    await expect(modal).toBeVisible();

    // Verify Create API Key button is visible/enabled for permission user
    const createKeyBtn = page.locator('[data-testid="create-api-key-btn"]');
    await expect(createKeyBtn).toBeVisible();

    // Verify OpenAPI Docs tab is viewable
    const docsTab = page.locator('[data-testid="integration-tab-docs"]');
    await docsTab.click();
    await expect(page.getByText('OpenAPI 3.0 Spec Endpoint')).toBeVisible();

    await page.locator('[data-testid="integration-modal-close-btn"]').click();
  });

  test('Non-Permission User sees Open API button, DOCS tab, but Key Creation is disabled', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_04');
      localStorage.setItem('schedule_current_worker_name', 'Thanh Phuong(탄 프엉)');
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');

    const openApiBtn = page.locator('[data-testid="open-integration-api-btn"]');
    await expect(openApiBtn).toBeVisible();

    await openApiBtn.click();

    const modal = page.locator('[data-testid="integration-manager-modal"]');
    await expect(modal).toBeVisible();

    // Create Key button should be hidden / disabled for non-permission worker
    const createKeyBtn = page.locator('[data-testid="create-api-key-btn"]');
    await expect(createKeyBtn).not.toBeVisible();

    // Verify OpenAPI Docs tab is still accessible
    const docsTab = page.locator('[data-testid="integration-tab-docs"]');
    await docsTab.click();
    await expect(page.getByText('OpenAPI 3.0 Spec Endpoint')).toBeVisible();
  });
});
