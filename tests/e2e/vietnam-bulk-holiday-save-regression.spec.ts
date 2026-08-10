// tests/e2e/vietnam-bulk-holiday-save-regression.spec.ts
import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(QA_BASE_URL, 'vietnam-bulk-holiday-save-regression');

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

test.describe('Vietnam Bulk Holiday Save & Impact Modal Regression Suite', () => {
  const testYear = 2031;
  const testMonth = 8;
  const testDate = '2031-08-18';

  test.afterEach(async () => {
    // Ensure clean state on QA by sending empty holiday list for 2031-08
    await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        country_code: 'VN',
        year: testYear,
        month: testMonth,
        holidays: [],
        restore_shifted_tasks: false,
      }),
    }).catch(() => {});
  });

  test('CASE A: Vietnam Bulk Save Confirm -> Impact 200, Localized Modal, PUT 200, Persisted Reload', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Select worker wrk_02
    const workerSelectBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerSelectBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }

    // Open Calendar Manager Modal
    const calendarBtn = page.locator('[data-testid="desktop-manage-calendar-btn"], [data-testid="manage-calendar-btn"], button:has-text("공휴일")').first();
    await expect(calendarBtn).toBeVisible({ timeout: 15000 });
    await calendarBtn.click({ force: true });

    const calendarModal = page.locator('[data-testid="calendar-manager-modal"]');
    await expect(calendarModal).toBeVisible();

    // Click Vietnam Public Holiday Tab
    const vnTab = page.locator('[data-testid="vietnam-public-holiday-tab"]');
    await expect(vnTab).toBeVisible();
    await vnTab.click();

    // Select Month 2031-08
    const monthInput = page.locator('[data-testid="vn-holiday-month-input"]');
    await expect(monthInput).toBeVisible();
    await monthInput.fill(`${testYear}-${String(testMonth).padStart(2, '0')}`);

    // Click Date 2031-08-18 to toggle holiday selection
    const dateCell = page.locator(`[data-testid="vn-holiday-date-${testDate}"]`);
    await expect(dateCell).toBeVisible();
    await dateCell.click();

    // Listen for POST Impact response
    const impactPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/calendar/manual-holidays/impact') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    // Click Save Vietnam Holidays Button
    const saveBtn = page.locator('[data-testid="vn-holiday-save-btn"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    const impactResp = await impactPromise;
    expect(impactResp.status()).toBe(200);

    // Impact Modal MUST appear with localized content and step indicator
    const impactModal = page.locator('[data-testid="country-holiday-impact-modal"]');
    await expect(impactModal).toBeVisible({ timeout: 5000 });
    await expect(impactModal).toContainText('베트남 공휴일 일정 영향 검토');
    await expect(impactModal).toContainText('1단계 완료');

    // Listen for PUT /api/calendar/manual-holidays/month final save response
    const putSavePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/calendar/manual-holidays/month') && resp.request().method() === 'PUT',
      { timeout: 10000 }
    );

    // Click Confirm Save button
    const confirmBtn = page.locator('[data-testid="country-holiday-impact-confirm-btn"]').or(
      page.locator('[data-testid="country-holiday-impact-shift-btn"]')
    ).first();
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    const putResp = await putSavePromise;
    expect(putResp.status()).toBe(200);

    // Verify DB via GET API
    const getRes = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays?country=VN&year=${testYear}&month=${testMonth}`);
    expect(getRes.status).toBe(200);
    const getJson: any = await getRes.json();
    const holidays = Array.isArray(getJson) ? getJson : (getJson.data || []);
    const saved = holidays.find((h: any) => h.holiday_date === testDate);
    expect(saved).toBeTruthy();

    // Reload page and verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    const f5GetRes = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays?country=VN&year=${testYear}&month=${testMonth}`);
    const f5GetJson: any = await f5GetRes.json();
    const f5Holidays = Array.isArray(f5GetJson) ? f5GetJson : (f5GetJson.data || []);
    const f5Saved = f5Holidays.find((h: any) => h.holiday_date === testDate);
    expect(f5Saved).toBeTruthy();
  });

  test('CASE B: Vietnam Bulk Save Cancel -> Impact 200, Cancel Clicked, 0 PUT Requests, 0 DB Mutations', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Select worker wrk_02
    const workerSelectBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerSelectBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }

    // Open Calendar Manager Modal
    const calendarBtn = page.locator('[data-testid="desktop-manage-calendar-btn"], [data-testid="manage-calendar-btn"], button:has-text("공휴일")').first();
    await expect(calendarBtn).toBeVisible({ timeout: 15000 });
    await calendarBtn.click({ force: true });

    // Click Vietnam Public Holiday Tab
    const vnTab = page.locator('[data-testid="vietnam-public-holiday-tab"]');
    await expect(vnTab).toBeVisible();
    await vnTab.click();

    // Select Month 2031-08
    const monthInput = page.locator('[data-testid="vn-holiday-month-input"]');
    await monthInput.fill(`${testYear}-${String(testMonth).padStart(2, '0')}`);

    // Click Date 2031-08-18
    const dateCell = page.locator(`[data-testid="vn-holiday-date-${testDate}"]`);
    await dateCell.click();

    let putCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/calendar/manual-holidays/month') && req.method() === 'PUT') {
        putCount++;
      }
    });

    // Click Save
    const saveBtn = page.locator('[data-testid="vn-holiday-save-btn"]');
    await saveBtn.click();

    // Impact Modal appears
    const impactModal = page.locator('[data-testid="country-holiday-impact-modal"]');
    await expect(impactModal).toBeVisible({ timeout: 5000 });

    // Click Cancel
    const cancelBtn = page.locator('[data-testid="country-holiday-impact-cancel-btn"]');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Impact Modal closes
    await expect(impactModal).toBeHidden({ timeout: 5000 });
    expect(putCount).toBe(0);

    // Verify DB remains clean (0 mutation)
    const getRes = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays?country=VN&year=${testYear}&month=${testMonth}`);
    const getJson: any = await getRes.json();
    const holidays = Array.isArray(getJson) ? getJson : (getJson.data || []);
    const canceled = holidays.find((h: any) => h.holiday_date === testDate);
    expect(canceled).toBeFalsy();
  });
});
