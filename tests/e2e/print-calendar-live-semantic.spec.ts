import { test, expect } from '@playwright/test';

test.describe('P1 Calendar Visual Truth & Hatch Semantic Contract', () => {
  test('1. Web vs Print visualState 3/3 EXACT MATCH for KR_ONLY_OFF, VN_ONLY_OFF, BOTH_OFF', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-05-01&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    // KR_ONLY_OFF Date: 2026-05-05 (어린이날 - Tuesday)
    const krCell = page.locator('[data-date="2026-05-05"]').first();
    await expect(krCell).toBeVisible();
    await expect(krCell).toHaveAttribute('data-visual-state', 'KR_ONLY_OFF');

    // VN_ONLY_OFF Date: 2026-09-02 (베트남 국경일 - Wednesday)
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-09-01&lang=ko&colorMode=color');
    const vnCell = page.locator('[data-date="2026-09-02"]').first();
    await expect(vnCell).toBeVisible();
    await expect(vnCell).toHaveAttribute('data-visual-state', 'VN_ONLY_OFF');

    // BOTH_OFF Date: 2026-01-01 (신정 / Tet - Thursday)
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-01-01&lang=ko&colorMode=color');
    const bothCell = page.locator('[data-date="2026-01-01"]').first();
    await expect(bothCell).toBeVisible();
    await expect(bothCell).toHaveAttribute('data-visual-state', 'BOTH_OFF');
  });

  test('2. Mono Mode Hatch Pattern DOM Computed Style Verification (KR 135deg, VN 45deg, BOTH cross)', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-05-01&lang=ko&colorMode=mono');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    // Verify Mono KR_ONLY_OFF Hatch Style (135deg)
    const krMonoCell = page.locator('[data-date="2026-05-05"]').first();
    const krBgImage = await krMonoCell.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(krBgImage).toContain('135deg');

    // Verify Mono VN_ONLY_OFF Hatch Style (45deg)
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-09-01&lang=ko&colorMode=mono');
    const vnMonoCell = page.locator('[data-date="2026-09-02"]').first();
    const vnBgImage = await vnMonoCell.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(vnBgImage).toContain('45deg');

    // Verify Mono BOTH_OFF Cross Hatch Style
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-01-01&lang=ko&colorMode=mono');
    const bothMonoCell = page.locator('[data-date="2026-01-01"]').first();
    const bothBgImage = await bothMonoCell.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(bothBgImage).toContain('repeating-linear-gradient');
  });
});
