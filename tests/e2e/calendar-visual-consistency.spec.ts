// tests/e2e/calendar-visual-consistency.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (process.env.TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev').trim();

const QA_VISUAL_DIR = path.join(process.cwd(), 'qa', 'calendar-visual');
if (!fs.existsSync(QA_VISUAL_DIR)) {
  fs.mkdirSync(QA_VISUAL_DIR, { recursive: true });
}

async function dismissWorkerPromptModal(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
  await page.waitForTimeout(300);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Calendar Semantic Visual Hatch Consistency Suite', () => {
  test('1. Verify Desktop Calendar Legend items for all visual states and capture palette screenshot', async ({ page }) => {
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const legendContainer = page.locator('[data-testid="calendar-legend-desktop"]');
    await legendContainer.waitFor({ state: 'visible', timeout: 15000 });

    // Assert each legend item exists
    const legendKeys = [
      'workday',
      'both_off',
      'kr_only_off',
      'vn_only_off',
      'leave',
      'off',
      'work_override',
      'today',
      'issue',
    ];

    for (const key of legendKeys) {
      const item = legendContainer.locator(`[data-testid="legend-item-${key}"]`);
      await expect(item).toBeVisible();
    }

    // Save palette screenshot
    const screenshotPath = path.join(QA_VISUAL_DIR, 'calendar-semantic-palette.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved visual palette screenshot to: ${screenshotPath}`);
  });
});
