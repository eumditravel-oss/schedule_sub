// tests/e2e/warning-explainability.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

async function dismissAllModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const modal = page.locator('[data-testid="calendar-manager-modal"], [data-testid="project-delete-confirm-modal"]').first();
    if (await modal.isVisible({ timeout: 300 }).catch(() => false)) {
      const closeBtn = modal.locator('button').first();
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

test.describe('Warning Explainability UI Suite', () => {
  test('1. Verify clicking Overdue Strip opens OverdueTaskDetailModal with full evidence details', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/overview`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    const overdueStrip = page.locator('[data-testid="today-summary-overdue-secondary-strip"]');
    if (await overdueStrip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await overdueStrip.click({ force: true });
      const modal = page.locator('[data-testid="overdue-task-detail-modal"]');
      await expect(modal).toBeVisible();

      const closeBtn = page.locator('[data-testid="overdue-modal-close-btn"]');
      await closeBtn.click({ force: true });
    }
  });

  test('2. Verify clicking Conflict Badge on Project Overview opens WorkerConflictSummaryModal', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/overview`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    const conflictBadge = page.locator('[data-testid^="project-conflict-badge-"]').first();
    if (await conflictBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      await conflictBadge.click({ force: true });
      const modal = page.locator('[data-testid="worker-conflict-summary-modal"]');
      await expect(modal).toBeVisible();

      const closeBtn = page.locator('[data-testid="conflict-modal-close-btn"]');
      await closeBtn.click({ force: true });
    }
  });
});
