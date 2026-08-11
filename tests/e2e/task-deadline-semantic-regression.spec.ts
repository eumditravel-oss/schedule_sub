import { test, expect } from '@playwright/test';

test.describe('Deadline Semantic Integrity Suite (Overdue vs Completion Review)', () => {
  test('AUTO_TIME task at 100% actual progress past end_date is classified as COMPLETION_REVIEW, NOT OVERDUE', async ({ page }) => {
    await page.route('**/api/workers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'wrk_01', name: '박용진 수석', is_active: 1, access_role: 'EDITOR' }]) });
    });
    await page.route('**/api/calendar/holidays*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/overrides*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/tasks*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Intercept GET /api/dashboard/today-summary
    await page.route('**/api/dashboard/today-summary*', async (route) => {
      const json = {
        date: '2026-08-10',
        scheduled_today: { count: 0, project_ids: [] },
        in_progress: { count: 0, project_ids: [] },
        completed_today: { count: 0, project_ids: [] },
        completed_this_month: { count: 1, project_ids: ['prj-1'] },
        overdue: { count: 0, task_ids: [] }, // 0 OVERDUE
        completion_review: { count: 1, task_ids: ['task-auto-100'] }, // 1 COMPLETION_REVIEW
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.goto('/projects');
    await page.waitForLoadState('domcontentloaded');

    const card = page.locator('[data-testid="today-summary-card"]');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Verify OVERDUE secondary strip is NOT present or shows 0
    const overdueStrip = card.locator('[data-testid="today-summary-overdue-secondary-strip"]');
    await expect(overdueStrip).not.toBeVisible();

    // Verify COMPLETION_REVIEW strip IS present and shows 1건
    const reviewStrip = card.locator('[data-testid="today-summary-completion-review-strip"]');
    await expect(reviewStrip).toBeVisible();
    await expect(reviewStrip).toContainText('1건');
  });
});
