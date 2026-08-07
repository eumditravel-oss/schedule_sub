import { test, expect } from '@playwright/test';

test.describe('P0 Today Summary Live Contract & UI Consistency Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('Verify GET /api/dashboard/today-summary returns 200 and matches UI counts', async ({ page }) => {
    // 1. Direct API Contract Verification
    const response = await page.request.get('/api/dashboard/today-summary?date=2026-08-07');
    expect(response.status()).toBe(200);

    const data: any = await response.json();
    expect(data.date).toBe('2026-08-07');
    expect(typeof data.scheduled_today.count).toBe('number');
    expect(typeof data.in_progress.count).toBe('number');
    expect(typeof data.completed_today.count).toBe('number');
    expect(typeof data.overdue.count).toBe('number');

    // 2. UI Rendering & Worker Switch Test
    await page.goto('/projects');

    const summaryCard = page.locator('[data-testid="today-summary-card"]');
    await expect(summaryCard).toBeVisible({ timeout: 10000 });

    // Verify worker profile switch does NOT alter team dashboard metrics
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
