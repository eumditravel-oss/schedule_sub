import { test, expect, Page } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'runtime-react-crash-regression');

// Helper to attach runtime error collectors to a Playwright page
export function setupRuntimeCrashMonitor(page: Page) {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    console.error('[PAGEERROR DETECTED]', err);
    pageErrors.push(err);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out harmless network error logs if any, but catch React / JS crashes
      if (!text.includes('favicon.ico') && !text.includes('Failed to load resource')) {
        console.error('[CONSOLE ERROR DETECTED]', text);
        consoleErrors.push(text);
      }
    }
  });

  const verifyNoRuntimeErrors = async () => {
    // 1. Check pageerror array
    expect(pageErrors, `Pageerror array contains crashes: ${pageErrors.map(e => e.message).join('; ')}`).toEqual([]);

    // 2. Check console error array for React #310 or general React errors
    const reactErrors = consoleErrors.filter(e => e.includes('Minified React error') || e.includes('Rendered more hooks') || e.includes('Rendered fewer hooks'));
    expect(reactErrors, `React Hook mismatch or minified error detected: ${reactErrors.join('; ')}`).toEqual([]);

    // 3. Verify page content does not display fallback React Error Boundary text
    const errorTextCount = await page.locator('text=Unexpected Application Error').count();
    expect(errorTextCount, 'UI is showing Unexpected Application Error screen').toBe(0);

    const minifiedErrorCount = await page.locator('text=Minified React error').count();
    expect(minifiedErrorCount, 'UI is showing Minified React error screen').toBe(0);
  };

  return { pageErrors, consoleErrors, verifyNoRuntimeErrors };
}

test.describe('Global Runtime React Crash & Hook Consistency Regression Gate', () => {
  test('CASE 1: Overview Page Load & Interactivity Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Verify key Overview components are rendered
    await page.waitForTimeout(1000);
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 2: Project Detail Page Load & Task Gantt Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    // Wait for project detail content
    await page.waitForTimeout(1500);
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 3: Holiday Manager Modal Open & Close Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    const openBtn = page.locator('[data-testid="open-calendar-manager-modal-btn"]');
    if (await openBtn.isVisible()) {
      await openBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[data-testid="calendar-manager-modal"]');
      await expect(modal).toBeVisible();

      const closeBtn = page.locator('[data-testid="calendar-modal-close-btn"]');
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 4: Vietnam Holiday Tab Switch Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    const openBtn = page.locator('[data-testid="open-calendar-manager-modal-btn"]');
    if (await openBtn.isVisible()) {
      await openBtn.click();
      await page.waitForTimeout(500);

      const vnTab = page.locator('[data-testid="vietnam-public-holiday-tab"]');
      if (await vnTab.isVisible()) {
        await vnTab.click();
        await page.waitForTimeout(500);
      }

      const closeBtn = page.locator('[data-testid="calendar-modal-close-btn"]');
      await closeBtn.click();
    }
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 5: VN Bulk Impact Preview Open & Cancel Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    const openBtn = page.locator('[data-testid="open-calendar-manager-modal-btn"]');
    if (await openBtn.isVisible()) {
      await openBtn.click();
      await page.waitForTimeout(500);

      const vnSatTab = page.locator('[data-testid="vietnam-saturday-calendar-tab"]');
      if (await vnSatTab.isVisible()) {
        await vnSatTab.click();
        await page.waitForTimeout(500);
      }

      const closeBtn = page.locator('[data-testid="calendar-modal-close-btn"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 6: Date Header Panel Open & Close Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    const dateHeaderCell = page.locator('[data-testid^="date-header-col-"]').first();
    if (await dateHeaderCell.isVisible()) {
      await dateHeaderCell.click();
      await page.waitForTimeout(500);

      const closeBtn = page.locator('[data-testid="date-header-info-close-btn"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 7: Cross-Country Holiday Registration Form Open Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    const dateHeaderCell = page.locator('[data-testid^="date-header-col-"]').first();
    if (await dateHeaderCell.isVisible()) {
      await dateHeaderCell.click();
      await page.waitForTimeout(500);

      const addVnBtn = page.locator('[data-testid="add-manual-holiday-btn-vn"]');
      if (await addVnBtn.isVisible()) {
        await addVnBtn.click();
        await page.waitForTimeout(300);
      }

      const closeBtn = page.locator('[data-testid="date-header-info-close-btn"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
    await monitor.verifyNoRuntimeErrors();
  });

  test('CASE 8: Upcoming Task Project Render Smoke', async ({ page }) => {
    const monitor = setupRuntimeCrashMonitor(page);
    await page.goto('/projects/prj_1786324719846_dmo5');
    await page.waitForLoadState('networkidle');

    // Verify page loads without React hook mismatch or unexpected application error
    await page.waitForTimeout(1000);
    await monitor.verifyNoRuntimeErrors();
  });
});
