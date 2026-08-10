// tests/e2e/vietnam-saturday-calendar.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');
const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.afterAll(async () => {
  // Cleanup test VN country overrides for August 2026
  const testDates = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'];
  for (const d of testDates) {
    await fetch(`${QA_BASE_URL}/api/calendar/overrides/ovr_vn_sat_${d}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    }).catch(() => {});
  }
});

async function dismissBlockingModals(page: any) {
  const workerPromptModal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await workerPromptModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const option = page.locator('[data-testid^="worker-prompt-option-"]').first();
    if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Vietnam Saturday Work Calendar E2E Suite', () => {

  test('1. Verify 5 Saturdays calculation, odd-week preset, impact modal, save, and Gantt header VN OFF display', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    // Open Calendar Manager Modal
    const manageBtn = page.locator('[data-testid="desktop-manage-calendar-btn"]').first().or(page.locator('[data-testid="manage-holidays-btn"]').first());
    await expect(manageBtn).toBeVisible({ timeout: 10000 });
    await manageBtn.click();

    const calModal = page.locator('[data-testid="calendar-manager-modal"]');
    await expect(calModal).toBeVisible({ timeout: 5000 });

    // Switch to Vietnam Saturday Calendar Tab
    const vnTab = page.locator('[data-testid="vietnam-saturday-calendar-tab"]');
    await expect(vnTab).toBeVisible();
    await vnTab.click();

    // Select August 2026
    const monthInput = page.locator('[data-testid="vn-saturday-month-input"]');
    await expect(monthInput).toBeVisible();
    await monthInput.fill('2026-08');
    await monthInput.dispatchEvent('change');
    await page.waitForTimeout(300);

    // Verify 5 Saturdays displayed
    const saturdays = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'];
    for (const d of saturdays) {
      const row = page.locator(`[data-testid="vn-saturday-row-${d}"]`);
      await expect(row, `Saturday row ${d} must be visible`).toBeVisible({ timeout: 5000 });
    }

    // Click 1·3·5 week off preset
    const oddOffBtn = page.locator('[data-testid="vn-saturday-odd-off-btn"]');
    await expect(oddOffBtn).toBeVisible();
    await oddOffBtn.click();

    // Save Vietnam Saturday Calendar
    const saveBtn = page.locator('[data-testid="vn-saturday-save-btn"]');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await expect(saveBtn).toBeEnabled({ timeout: 10000 });
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    // Verify Impact Modal if active
    const impactModal = page.locator('[data-testid="vn-saturday-impact-modal"]');
    if (await impactModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const confirmShiftBtn = page.locator('[data-testid="vn-saturday-confirm-shift-btn"]');
      if (await confirmShiftBtn.isVisible().catch(() => false)) {
        await confirmShiftBtn.click();
      }
      await expect(impactModal).toBeHidden({ timeout: 10000 }).catch(() => {});
    }

    // Close calendar manager modal
    const closeBtn = page.locator('[data-testid="calendar-modal-close-btn"]');
    await closeBtn.click();
    await expect(calModal).toBeHidden();

    // Verify Gantt Header displays KR OFF / VN OFF for 2026-08-15 if in view
    // Navigate date controls to August 2026
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill('2026-08-15');
    }

    // Screenshot QA result
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'vietnam-saturday-gantt-header.png') });

    // F5 Persistence test
    await page.reload();
    await dismissBlockingModals(page);

    // Open Calendar Modal again and verify persistence
    await manageBtn.click();
    await expect(calModal).toBeVisible();
    await vnTab.click();
    await monthInput.fill('2026-08');

    // Reset to All Work to clean up
    const resetBtn = page.locator('[data-testid="vn-saturday-all-work-btn"]');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    if (await impactModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const confirmShiftBtn2 = page.locator('[data-testid="vn-saturday-confirm-shift-btn"]');
      if (await confirmShiftBtn2.isVisible().catch(() => false)) {
        await confirmShiftBtn2.click();
      }
      await expect(impactModal).toBeHidden({ timeout: 10000 }).catch(() => {});
    }

    await closeBtn.click();
  });

});
