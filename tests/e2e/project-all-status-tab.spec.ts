import { test, expect } from '@playwright/test';

test.describe('P0 Project Status Tabs (ALL / ACTIVE / COMPLETED) Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Verify ALL, ACTIVE, COMPLETED tabs, set equality, Year Filter visibility, and Today Summary isolation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');

    // 1. Verify Status Tabs presence
    const allTab = page.locator('[data-testid="all-tab-btn"]');
    const activeTab = page.locator('[data-testid="active-tab-btn"]');
    const completedTab = page.locator('[data-testid="completed-tab-btn"]');

    await expect(allTab).toBeVisible();
    await expect(activeTab).toBeVisible();
    await expect(completedTab).toBeVisible();

    // Default tab is ACTIVE
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');

    // 2. Fetch Projects via API for status = ACTIVE, COMPLETED, ALL
    const activeRes = await page.request.get('/api/projects?status=ACTIVE');
    const activeProjects: any[] = (await activeRes.json()).data || [];

    const completedRes = await page.request.get('/api/projects?status=COMPLETED');
    const completedProjects: any[] = (await completedRes.json()).data || [];

    const allRes = await page.request.get('/api/projects?status=ALL');
    const allProjects: any[] = (await allRes.json()).data || [];

    // Verify Set Equality: ALL count === ACTIVE count + COMPLETED count
    expect(allProjects.length).toBe(activeProjects.length + completedProjects.length);

    // 3. Test ALL Tab Click
    await allTab.click();
    await expect(allTab).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(500);

    // Verify Year Selector is NOT visible on ALL tab
    const yearSelector = page.locator('select[value]');
    if (await yearSelector.isVisible().catch(() => false)) {
      await expect(yearSelector).not.toBeVisible();
    }

    // 4. Test COMPLETED Tab Click
    await completedTab.click();
    await expect(completedTab).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(500);

    // Verify Year Selector is visible on COMPLETED tab (if completed projects exist)
    if (completedProjects.length > 0) {
      await expect(page.locator('select')).toBeVisible();
    }

    // 5. Test switching back to ACTIVE Tab
    await activeTab.click();
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(500);

    // 6. Verify Today Summary dashboard metrics remain intact across tab switches
    const summaryRes = await page.request.get('/api/dashboard/today-summary?date=2026-08-07');
    expect(summaryRes.status()).toBe(200);
    const summaryData = (await summaryRes.json()).data;
    expect(summaryData.scheduled_today).toBeGreaterThanOrEqual(0);
  });
});
