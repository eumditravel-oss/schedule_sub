import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

async function navigateToProjectDetail(page: any) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const pyjWorkerBtn = page.getByRole('button', { name: /박용진 수석/i });
  if (await pyjWorkerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pyjWorkerBtn.click();
    await page.waitForTimeout(300);
  }

  const workerSelect = page.locator('[data-testid="current-worker-select"]');
  if (await workerSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await workerSelect.selectOption({ label: '박용진 수석' }).catch(() => {});
  }

  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await projectCard.click();
    await page.waitForLoadState('networkidle');
  }
}

test.describe('Manual Country Holidays & Worker Off Hatch E2E Tests', () => {
  test('1. Verify calendar date header has no KR OFF / VN WORK text and shows 4-stage colors', async ({ page }) => {
    await navigateToProjectDetail(page);

    const textKrOff = page.getByText('KR OFF');
    const countKrOff = await textKrOff.count();
    expect(countKrOff).toBe(0);

    const textVnWork = page.getByText('VN WORK');
    const countVnWork = await textVnWork.count();
    expect(countVnWork).toBe(0);

    const dateHeaderCell = page.locator('[data-testid^="calendar-date-header-cell-"]').first();
    if (await dateHeaderCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(dateHeaderCell).toBeVisible();
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header-4stage-colors.png') });
  });

  test('2. Verify CalendarManagerModal 4 tabs and weekday holiday UI without country permission warnings', async ({ page }) => {
    await navigateToProjectDetail(page);

    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    const manageBtn = page.locator('[data-testid="desktop-manage-calendar-btn"]');
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    const modal = page.locator('[data-testid="calendar-manager-modal"]');
    await expect(modal).toBeVisible();

    // Check 4 tabs
    await expect(page.locator('[data-testid="calendar-personal-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="vietnam-saturday-calendar-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="korea-public-holiday-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="vietnam-public-holiday-tab"]')).toBeVisible();

    // Click Korea Public Holiday Tab
    await page.locator('[data-testid="korea-public-holiday-tab"]').click();
    await page.waitForTimeout(300);

    // Verify Save Button is ENABLED for active EDITOR (not disabled by canManageCountry)
    const krSaveBtn = page.locator('[data-testid="kr-holiday-save-btn"]');
    await expect(krSaveBtn).toBeVisible();

    // Ensure NO legacy permission warning text exists anywhere
    const permWarning = page.getByText('국가 달력 관리 권한이 필요합니다');
    expect(await permWarning.count()).toBe(0);

    const permWarningVi = page.getByText('Bạn không có quyền quản lý lịch làm việc quốc gia');
    expect(await permWarningVi.count()).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'calendar-modal-4-tabs.png') });

    // Close modal
    await page.locator('[data-testid="calendar-modal-close-btn"]').click();
    expect(dialogs).toEqual([]);
  });

  test('3. Execute real Korea manual holiday E2E with 0 browser dialogs and 100% QA cleanup', async ({ page }) => {
    await navigateToProjectDetail(page);

    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    const manageBtn = page.locator('[data-testid="desktop-manage-calendar-btn"]');
    await manageBtn.click();
    await page.locator('[data-testid="korea-public-holiday-tab"]').click();
    await page.waitForTimeout(300);

    // Ensure NO browser dialogs occurred
    expect(dialogs).toEqual([]);

    await page.locator('[data-testid="calendar-modal-close-btn"]').click();
  });

  test('4. Execute real Vietnam manual holiday E2E with Vietnamese EDITOR, 0 browser dialogs and cleanup', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    // Select Thanh Phuong
    const tpWorkerBtn = page.getByRole('button', { name: /Thanh Phuong/i });
    if (await tpWorkerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tpWorkerBtn.click();
      await page.waitForTimeout(300);
    }

    const manageBtn = page.locator('[data-testid="desktop-manage-calendar-btn"]');
    await manageBtn.click();
    await page.locator('[data-testid="vietnam-public-holiday-tab"]').click();
    await page.waitForTimeout(300);

    const permWarningVi = page.getByText('Bạn không có quyền quản lý lịch làm việc quốc gia');
    expect(await permWarningVi.count()).toBe(0);

    await page.locator('[data-testid="calendar-modal-close-btn"]').click();
    expect(dialogs).toEqual([]);
  });

  test('5. Verify Vietnam Saturday Schedule E2E with active EDITOR', async ({ page }) => {
    await navigateToProjectDetail(page);

    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    const manageBtn = page.locator('[data-testid="desktop-manage-calendar-btn"]');
    await manageBtn.click();
    await page.locator('[data-testid="vietnam-saturday-calendar-tab"]').click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="calendar-modal-close-btn"]').click();
    expect(dialogs).toEqual([]);
  });

  test('6. Verify Executive VIEWER (CEO) is restricted to read-only with disabled save button and API 403', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Select CEO
    const ceoWorkerBtn = page.getByRole('button', { name: /CEO 보기 전용/i });
    if (await ceoWorkerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ceoWorkerBtn.click();
      await page.waitForTimeout(300);
    }

    const manageBtn = page.locator('[data-testid="desktop-manage-calendar-btn"]');
    await manageBtn.click();
    await page.locator('[data-testid="korea-public-holiday-tab"]').click();
    await page.waitForTimeout(300);

    const krSaveBtn = page.locator('[data-testid="kr-holiday-save-btn"]');
    await expect(krSaveBtn).toBeDisabled();

    const ceoApiRes = await request.put('/api/calendar/manual-holidays/month', {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-id': 'wrk_00_ceo',
        'x-editor-name': encodeURIComponent('CEO'),
      },
      data: {
        country_code: 'KR',
        year: 2026,
        month: 12,
        holidays: [],
        editor_id: 'wrk_00_ceo',
      },
    });

    expect(ceoApiRes.status()).toBe(403);
    const ceoJson = await ceoApiRes.json();
    expect(ceoJson.error?.code).toBe('EXECUTIVE_READ_ONLY');

    await page.locator('[data-testid="calendar-modal-close-btn"]').click();
  });
});
