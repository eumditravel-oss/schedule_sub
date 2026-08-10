import { test, expect } from '@playwright/test';

test.describe('Print Dropdown Menu Portal & Viewport Clamping Suite', () => {
  const viewports = [
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('scheduler_current_worker', JSON.stringify({
        id: 'w_pyj',
        name: 'Park Yongjin',
        access_role: 'EDITOR',
        country_code: 'KR'
      }));
    });
    await page.setExtraHTTPHeaders({
      'x-editor-name': 'Park Yongjin',
    });
  });

  for (const vp of viewports) {
    test(`1. Project Overview Print Dropdown Portal rendering & bounds at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      const triggerBtn = page.locator('[data-testid="print-menu-trigger-btn"]').first();
      await expect(triggerBtn).toBeVisible();

      // Get initial header scrollHeight
      const headerEl = page.locator('header').first();
      const initialScrollHeight = await headerEl.evaluate((el) => el.scrollHeight);

      // Open Print Dropdown
      await triggerBtn.click();

      // Verify portal panel is visible
      const panel = page.locator('[data-testid="print-dropdown-panel"]');
      await expect(panel).toBeVisible();

      // Verify panel parent is document.body
      const parentTagName = await panel.evaluate((el) => el.parentElement?.tagName.toLowerCase());
      expect(parentTagName).toBe('body');

      // Verify panel bounding box fits inside viewport
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
      }

      // Verify header vertical scrollbar did NOT increase
      const openScrollHeight = await headerEl.evaluate((el) => el.scrollHeight);
      expect(openScrollHeight).toBe(initialScrollHeight);
    });

    test(`2. Project Detail Print Dropdown Portal rendering at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      
      // Fetch an active project from API
      const response = await page.request.get('/api/projects', {
        headers: { 'x-editor-name': 'Park Yongjin' },
      });
      const projectsJson = await response.json();
      const projects = Array.isArray(projectsJson) ? projectsJson : (projectsJson.data || []);
      const prjId = projects[0]?.id || 'prj_demo_1';

      await page.goto(`/projects/${prjId}`);
      await page.waitForLoadState('networkidle');

      const triggerBtn = page.locator('[data-testid="print-menu-trigger-btn"]').first();
      await expect(triggerBtn).toBeVisible();

      await triggerBtn.click();

      const panel = page.locator('[data-testid="print-dropdown-panel"]');
      await expect(panel).toBeVisible();

      const parentTagName = await panel.evaluate((el) => el.parentElement?.tagName.toLowerCase());
      expect(parentTagName).toBe('body');
    });
  }
});
