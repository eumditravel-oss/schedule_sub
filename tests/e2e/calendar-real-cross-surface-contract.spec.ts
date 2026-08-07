// tests/e2e/calendar-real-cross-surface-contract.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const QA_BASE_URL = (process.env.TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev').trim();

const QA_VISUAL_DIR = path.join(process.cwd(), 'qa', 'calendar-visual');

test.beforeAll(async () => {
  if (!fs.existsSync(QA_VISUAL_DIR)) {
    fs.mkdirSync(QA_VISUAL_DIR, { recursive: true });
  }
});

async function setupWorkerSession(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
}

test.describe('Real Cross-Surface Calendar Token & Attribute Contract', () => {
  test('1. Verify data-calendar-surface attributes and visual state contract across Legend, Header, and Project Hatch', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await setupWorkerSession(page);
    await page.goto(`${QA_BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 1. Legend DOM Attributes
    const legendContainer = page.locator('[data-testid="calendar-legend-desktop"]');
    await legendContainer.waitFor({ state: 'visible', timeout: 15000 });

    const legendItems = legendContainer.locator('[data-calendar-surface="LEGEND"]');
    const legendCount = await legendItems.count();
    expect(legendCount).toBeGreaterThanOrEqual(4);

    // Verify MANUAL_OFF is completely gone from Legend
    const manualOffLegend = legendContainer.locator('[data-calendar-visual-state="MANUAL_OFF"]');
    expect(await manualOffLegend.count()).toBe(0);

    // 2. Date Header DOM Attributes
    const headers = page.locator('[data-calendar-surface="HEADER"]');
    expect(await headers.count()).toBeGreaterThan(0);
    const firstHeaderState = await headers.first().getAttribute('data-calendar-visual-state');
    expect(firstHeaderState).toBeTruthy();

    // 3. Project Overview Hatch Overlay DOM Attributes
    const projectHatches = page.locator('[data-calendar-surface="PROJECT_OVERVIEW"]');
    expect(await projectHatches.count()).toBeGreaterThan(0);
    const firstProjectHatchState = await projectHatches.first().getAttribute('data-calendar-visual-state');
    expect(firstProjectHatchState).toBeTruthy();

    // 4. Save Matrix Screenshot
    const screenshotPath = path.join(QA_VISUAL_DIR, 'semantic-cross-surface-final.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`Saved cross-surface screenshot to: ${screenshotPath}`);
  });
});
