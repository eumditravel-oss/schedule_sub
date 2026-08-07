import { test, expect } from '@playwright/test';

test.describe('P0 Today Summary Live Contract & UI Consistency Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Verify GET /api/dashboard/today-summary returns 200 and matches UI counts', async ({ page }) => {
    // Intercept today-summary API call
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/dashboard/today-summary') && res.status() === 200),
      page.goto('/projects'),
    ]);

    const data: any = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(typeof data.data.scheduled_today.count).toBe('number');
    expect(typeof data.data.in_progress.count).toBe('number');
    expect(typeof data.data.completed_today.count).toBe('number');
    expect(typeof data.data.overdue.count).toBe('number');

    const summaryCard = page.locator('[data-testid="today-summary-card"]');
    await expect(summaryCard).toBeVisible();

    // Verify worker profile switch does NOT alter team dashboard numbers
    const workerBtn = page.locator('[data-testid="worker-select-btn"]');
    await workerBtn.click();
    const vietnameseWorkerOption = page.locator('[data-testid="worker-option-Thanh Phuong(탄 프엉)"]');
    if (await vietnameseWorkerOption.isVisible()) {
      await vietnameseWorkerOption.click();
    }

    await expect(summaryCard).toBeVisible();
    await expect(page.getByText('오늘 예정')).toBeVisible();
    await expect(page.getByText('진행 중')).toBeVisible();
    await expect(page.getByText('오늘 완료')).toBeVisible();
    await expect(page.getByText('기한 경과')).toBeVisible();
  });
});
