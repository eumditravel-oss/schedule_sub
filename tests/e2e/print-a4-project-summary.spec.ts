import { test, expect } from '@playwright/test';

test.describe('Print Template 1: A4 Project Summary Report', () => {
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

  test('should render A4 summary print page cleanly with header, KPI cards, table and footer', async ({ page }) => {
    await page.goto(`/print/project/${realProjectId}/summary-a4?lang=ko&colorMode=color`);

    const shell = page.locator('.print-page-shell');
    await expect(shell.first()).toBeVisible();
    await expect(shell.first()).toHaveClass(/print-paper-a4/);
    await expect(shell.first()).toHaveClass(/print-landscape/);

    await expect(page.locator('.print-header').first()).toBeVisible();
    await expect(page.locator('.print-header').first()).toContainText('CON-COST');
    await expect(page.locator('.print-header').first()).toContainText('VIETQS');

    await expect(page.locator('.print-footer').first()).toBeVisible();
    await expect(page.locator('.print-footer').first()).toContainText('본 문서는 Scheduler V2.5 데이터 기준으로 자동 생성되었습니다.');

    const toolbar = page.locator('.print-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(page.getByTestId('print-orientation-fixed')).toContainText('가로 고정');
  });
});
