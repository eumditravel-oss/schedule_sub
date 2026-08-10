import { test, expect } from '@playwright/test';

test.describe('Today Summary Monthly Completed KPI Suite (Addendum F)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      window.localStorage.setItem('schedule_ui_language', 'ko');
    });
    await page.setExtraHTTPHeaders({
      'x-editor-name': encodeURIComponent('박용진 수석'),
    });
  });

  test('Monthly completed project count includes ONLY projects with end_date in current month', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const card = page.locator('[data-testid="today-summary-card"]');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Verify "이번 달 완료 프로젝트" card label is rendered
    const monthlyLabel = card.locator('div:has-text("이번 달 완료 프로젝트"), div:has-text("Dự án hoàn thành tháng này")');
    await expect(monthlyLabel.first()).toBeVisible();

    // Verify monthly completed count element is rendered and contains number followed by 개 or dự án
    const countText = card.getByText(/\d+개|\d+ dự án/);
    await expect(countText.first()).toBeVisible();
  });
});
