import { test, expect } from '@playwright/test';

test.describe('Manual Country Holidays & UI Header Verification', () => {
  test('Verify calendar date header has no KR OFF / VN WORK text and shows 4-stage colors', async ({ page }) => {
    await page.goto('/');

    // Ensure header elements exist
    const headerCells = page.locator('[data-testid="calendar-date-header"]');
    await expect(headerCells.first()).toBeVisible({ timeout: 10000 });

    // Ensure NO text containing 'KR OFF' or 'VN WORK' exists in header cells
    const headerText = await headerCells.allInnerTexts();
    const joinedText = headerText.join(' ');
    expect(joinedText).not.toContain('KR OFF');
    expect(joinedText).not.toContain('VN WORK');
    expect(joinedText).not.toContain('OFF');

    // Verify data-country-off-state attribute is populated
    const firstState = await headerCells.first().getAttribute('data-country-off-state');
    expect(['BOTH_OFF', 'KR_ONLY_OFF', 'VN_ONLY_OFF', 'BOTH_WORK']).toContain(firstState);
  });

  test('Verify CalendarManagerModal has 4 tabs and supports weekday holiday setting', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.goto('/');

    // Dismiss worker selection modal if present
    const closeWorkerModal = page.locator('button:has-text("확인"), button:has-text("닫기")').first();
    if (await closeWorkerModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeWorkerModal.click().catch(() => {});
    }

    // Open Calendar Manager Modal
    const manageBtn = page.locator('[data-testid="manage-holidays-btn"], button:has-text("휴일·휴가 관리")').first();
    await expect(manageBtn).toBeVisible({ timeout: 10000 });
    await manageBtn.click();

    const modal = page.locator('[data-testid="calendar-manager-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify 4 Tabs
    const personalTab = page.locator('[data-testid="calendar-personal-tab"]');
    const vnSatTab = page.locator('[data-testid="vietnam-saturday-calendar-tab"]');
    const krHolTab = page.locator('[data-testid="korea-public-holiday-tab"]');
    const vnHolTab = page.locator('[data-testid="vietnam-public-holiday-tab"]');

    await expect(personalTab).toBeVisible();
    await expect(vnSatTab).toBeVisible();
    await expect(krHolTab).toBeVisible();
    await expect(vnHolTab).toBeVisible();

    // Click Korea Public Holiday Tab
    await krHolTab.click();
    const krMonthInput = page.locator('[data-testid="kr-holiday-month-input"]');
    await expect(krMonthInput).toBeVisible();

    const krSaveBtn = page.locator('[data-testid="kr-holiday-save-btn"]');
    await expect(krSaveBtn).toBeVisible();

    // Click Vietnam Public Holiday Tab
    await vnHolTab.click();
    const vnMonthInput = page.locator('[data-testid="vn-holiday-month-input"]');
    await expect(vnMonthInput).toBeVisible();

    const vnSaveBtn = page.locator('[data-testid="vn-holiday-save-btn"]');
    await expect(vnSaveBtn).toBeVisible();
  });
});
