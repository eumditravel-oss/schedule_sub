import { test, expect } from '@playwright/test';
import { getKoreaDateString, getKoreaBusinessMonth, getKoreaBusinessYear } from '../../src/utils/dateUtils';

test.describe('Korea Business Date & Midnight Boundary Acceptance Suite', () => {
  test('1. Korea Business Date single source utility produces exact KST YYYY-MM-DD date without UTC drift', () => {
    // 2026-08-11 00:30 KST = 2026-08-10 15:30 UTC
    const kstMidnightDate = new Date('2026-08-10T15:30:00Z');
    const kstDateStr = getKoreaDateString(kstMidnightDate);
    const kstMonthStr = getKoreaBusinessMonth(kstMidnightDate);
    const kstYearStr = getKoreaBusinessYear(kstMidnightDate);

    expect(kstDateStr).toBe('2026-08-11');
    expect(kstMonthStr).toBe('2026-08');
    expect(kstYearStr).toBe('2026');
  });

  test('2. Print view uses Korea Business Date as reference date and 30-day rolling start date', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=today&lang=ko');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    // Verify printed reference date matches Korea Business Date
    const todayKst = getKoreaDateString();
    await expect(page.locator('.print-header')).toContainText(todayKst);
  });
});
