// tests/e2e/today-summary-monthly-completion.spec.ts
import { test, expect } from '@playwright/test';

test.describe('P1 Today Summary Monthly Completed Projects KPI Suite', () => {
  test('1. Verify 4th Primary KPI is "이번 달 완료 프로젝트" with unit "개" and Overdue moved to Secondary Strip', async ({ page, request }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await page.waitForSelector('[data-testid="today-summary-card"]', { timeout: 10000 });

    // Fetch API summary
    const todaySummaryRes = await request.get('/api/dashboard/today-summary');
    expect(todaySummaryRes.status()).toBe(200);
    const summaryJson = await todaySummaryRes.json();
    const summaryData = summaryJson.data || summaryJson;

    const expectedMonthlyCount = summaryData.completed_this_month?.count ?? 0;

    // Verify 4th card contains "이번 달 완료 프로젝트"
    const card = page.locator('[data-testid="today-summary-card"]');
    await expect(card).toBeVisible();

    const monthlyKpiLabel = card.locator('span:has-text("이번 달 완료 프로젝트"), span:has-text("Dự án hoàn thành tháng này")');
    await expect(monthlyKpiLabel).toBeVisible();

    // Verify value matches API count and ends with "개"
    const monthlyKpiCard = card.locator('div.bg-violet-50\\/70');
    await expect(monthlyKpiCard).toBeVisible();
    const valueText = await monthlyKpiCard.locator('div.text-sm').innerText();
    expect(valueText.trim()).toBe(`${expectedMonthlyCount}개`);

    // Verify 4 primary cards do NOT contain "기한 경과" in primary grid
    const primaryGrid = card.locator('div.grid-cols-4');
    const primaryOverdueLabel = primaryGrid.locator('span:has-text("기한 경과")');
    expect(await primaryOverdueLabel.count()).toBe(0);

    // Verify overdue tasks (if any) render in Secondary Strip
    if ((summaryData.overdue?.count ?? 0) > 0) {
      const secondaryStrip = page.locator('[data-testid="today-summary-overdue-secondary-strip"]');
      await expect(secondaryStrip).toBeVisible();
      expect(await secondaryStrip.innerText()).toContain('기한 경과');
    }
  });

  test('2. Verify Monthly Completion KPI is independent of ALL / ACTIVE / COMPLETED tab selection', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await page.waitForSelector('[data-testid="today-summary-card"]');

    const monthlyKpiCard = page.locator('[data-testid="today-summary-card"] div.bg-violet-50\\/70');
    const initialText = await monthlyKpiCard.innerText();

    // Switch to COMPLETED tab
    const completedTab = page.locator('[data-testid="completed-tab-btn"]').first();
    if (await completedTab.isVisible()) {
      await completedTab.click({ force: true });
      await page.waitForTimeout(500);
      const completedTabText = await monthlyKpiCard.innerText();
      expect(completedTabText).toBe(initialText);
    }

    // Switch to ALL tab
    const allTab = page.locator('[data-testid="all-tab-btn"]').first();
    if (await allTab.isVisible()) {
      await allTab.click({ force: true });
      await page.waitForTimeout(500);
      const allTabText = await monthlyKpiCard.innerText();
      expect(allTabText).toBe(initialText);
    }
  });
});
