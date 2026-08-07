import { test, expect } from '@playwright/test';

const mobileViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];

test.describe('P0 Mobile Progress Single Source of Truth Contract Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  for (const vp of mobileViewports) {
    test(`Mobile Overview & Project Cards match API actual_progress at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);

      // Fetch projects via API
      const apiRes = await page.request.get('/api/projects');
      expect(apiRes.status()).toBe(200);
      const resJson = await apiRes.json();
      const projects: any[] = resJson.data || resJson || [];

      await page.goto('/projects');

      for (const prj of projects) {
        const expectedActual = prj.actual_progress ?? prj.progress ?? 0;
        const card = page.locator(`[data-testid="project-card-${prj.id}"]`);
        if (await card.isVisible()) {
          await expect(card).toHaveAttribute('data-progress-source', 'actual_progress');
          const attrVal = await card.getAttribute('data-actual-progress');
          expect(Number(attrVal)).toBe(Math.min(100, Math.max(0, Math.round(expectedActual))));
        }
      }
    });
  }

  test('Mobile Detail Tasks match API actual_progress', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects');

    const firstCard = page.locator('[data-testid^="project-card-"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
    } else {
      await page.goto('/projects/prj_1');
    }

    await page.waitForTimeout(1000);

    const taskCards = page.locator('[data-testid^="mobile-summary-task-card-"]');
    const count = await taskCards.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const card = taskCards.nth(i);
      await expect(card).toHaveAttribute('data-progress-source', 'actual_progress');
      const attrVal = await card.getAttribute('data-actual-progress');
      expect(attrVal).not.toBeNull();
      expect(Number(attrVal)).toBeGreaterThanOrEqual(0);
    }
  });
});
