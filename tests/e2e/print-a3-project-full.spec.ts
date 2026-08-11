import { test, expect } from '@playwright/test';

test.describe('Print Template 5: A3 Single Project Full Schedule', () => {
  let realProjectId = 'prj_1785986638625_9qkc';

  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get('/api/projects');
      if (res.ok()) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          realProjectId = json.data[0].id;
        }
      }
    } catch {
      // fallback
    }
  });

  test('should render A3 landscape full schedule table with 30-day band pagination for long projects', async ({ page }) => {
    await page.goto(`/print/project/${realProjectId}/full-a3?lang=ko&colorMode=color`);

    const shell = page.locator('.print-page-shell');
    await expect(shell.first()).toBeVisible();
    await expect(shell.first()).toHaveClass(/print-paper-a3/);
    await expect(shell.first()).toHaveClass(/print-landscape/);
    await expect(shell).toHaveCount(await page.locator('.print-page-band').count());

    await expect(page.locator('.print-header').first()).toContainText('프로젝트 상세 일정표 · 30일 구간');
  });
});
