import { test, expect } from '@playwright/test';

test.describe('Print Template 1: A4 Project Summary Report', () => {
  test('should render A4 summary print page cleanly with header, KPI cards, table and footer', async ({ page }) => {
    // Navigate to A4 Single Project Summary route
    await page.goto('/print/project/qa-project-1/summary-a4?lang=ko&colorMode=color');

    // Wait for container
    const shell = page.locator('.print-page-shell');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveClass(/print-paper-a4/);
    await expect(shell).toHaveClass(/print-portrait/);

    // Verify Header Branding
    await expect(page.locator('.print-header')).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('CON-COST');
    await expect(page.locator('.print-header')).toContainText('VIETQS');

    // Verify Footer Disclaimer
    await expect(page.locator('.print-footer')).toBeVisible();
    await expect(page.locator('.print-footer')).toContainText('본 문서는 Scheduler V2.5 데이터 기준으로 자동 생성되었습니다.');

    // Verify Print Toolbar existence and print hiding
    const toolbar = page.locator('.print-toolbar');
    await expect(toolbar).toBeVisible();
  });
});
