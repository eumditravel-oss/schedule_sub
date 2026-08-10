import { test, expect } from '@playwright/test';

test.describe('Scheduler V2.5 Live Production UI & Print Smoke Verification', () => {
  const prodUrl = 'https://concost-dev-scheduler.eumditravel.workers.dev';

  test.use({ baseURL: prodUrl });

  test('1. Production Overview Page: Print Button & Dropdown Panel Visibility (1920x1080 & 1366x768)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/projects');

    // Verify Print Menu Trigger Button
    const printBtn = page.locator('[data-testid="print-menu-trigger-btn"]');
    await expect(printBtn).toBeVisible({ timeout: 10000 });
    await expect(printBtn).toContainText('출력');

    // Click trigger -> Verify Dropdown Panel
    await printBtn.click();
    const dropdown = page.locator('[data-testid="print-dropdown-panel"]');
    await expect(dropdown).toBeVisible();

    await expect(page.locator('[data-testid="print-a4-month-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="print-a4-halfyear-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="print-a4-year-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="print-a3-today30-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="print-a3-custom30-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="print-a3-combined-btn"]')).toBeVisible();

    // Responsive 1366x768 Viewport Test
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(printBtn).toBeVisible();
  });

  test('2. Production Project Detail Page: Print Button Visibility', async ({ page }) => {
    // Fetch a real project ID from Production API
    const res = await page.request.get('/api/projects');
    expect(res.ok()).toBe(true);
    const json = await res.json();
    const firstProjId = json.data[0].id;

    await page.goto(`/projects/${firstProjId}`);

    const printBtn = page.locator('[data-testid="print-menu-trigger-btn"]');
    await expect(printBtn).toBeVisible({ timeout: 10000 });

    await printBtn.click();
    const dropdown = page.locator('[data-testid="print-dropdown-panel"]');
    await expect(dropdown).toBeVisible();

    await expect(page.locator('[data-testid="print-a4-summary-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="print-a3-full-btn"]')).toBeVisible();
  });

  test('3. Direct Print Route Smoke Test on Production', async ({ page }) => {
    // Direct navigation to A4 Monthly Print View on Production
    await page.goto('/print/projects/month-a4?month=2026-08&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.print-header')).toContainText('월간 전체 프로젝트 보고서');

    // Direct navigation to A3 Rolling 30 Print View on Production
    await page.goto('/print/projects/rolling-30-a3?mode=today&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.print-header')).toContainText('30일 전체 프로젝트 일정표');
  });
});
