import { test, expect } from '@playwright/test';

test.describe('Print Template 8: A3 Combined 2~3 Projects Schedule', () => {
  test('should render A3 combined schedule table with project section headers', async ({ page }) => {
    await page.goto('/print/projects/combined-a3?projectIds=id1,id2,id3&lang=ko&colorMode=color');

    const shell = page.locator('.print-paper-a3');
    await expect(shell).toBeVisible();
    await expect(page.locator('.print-header')).toContainText('선택 프로젝트 통합 일정표');
  });
});
