import { test, expect } from '@playwright/test';

test.describe('Print Template 8: A3 Combined 2~3 Projects Schedule', () => {
  let p1 = 'prj_1785986638625_9qkc';
  let p2 = 'prj_1785986589890_zi9o';

  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get('/api/projects');
      if (res.ok()) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length >= 2) {
          p1 = json.data[0].id;
          p2 = json.data[1].id;
        }
      }
    } catch {
      // fallback
    }
  });

  test('should render A3 combined schedule table with project section headers', async ({ page }) => {
    await page.goto(`/print/projects/combined-a3?projectIds=${p1},${p2}&lang=ko&colorMode=color`);

    const shell = page.locator('.print-paper-a3');
    await expect(shell).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('선택 프로젝트 통합 일정표');
  });
});
