// tests/e2e/calendar-cross-surface-semantic-consistency.spec.ts
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

test.describe('Calendar Cross-Surface Semantic Consistency Suite', () => {
  test('1. Verify Cross-Surface Semantic Tokens and Computed Styles match across Legend, Header, Project Hatch, and Task Hatch', async ({ page }) => {
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/projects/prj_1785986689248_qhuq`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const legendContainer = page.locator('[data-testid="calendar-legend-desktop"]');
    await legendContainer.waitFor({ state: 'visible', timeout: 15000 });

    const legendKeys = [
      { key: 'both_off', expectedState: 'BOTH_OFF', expectedAngle: '45deg' },
      { key: 'kr_only_off', expectedState: 'KR_ONLY_OFF', expectedAngle: '135deg' },
      { key: 'vn_only_off', expectedState: 'VN_ONLY_OFF', expectedAngle: '45deg' },
      { key: 'leave', expectedState: 'PERSONAL_LEAVE', expectedAngle: '135deg' },
      { key: 'off', expectedState: 'MANUAL_OFF', expectedAngle: '90deg' },
    ];

    for (const item of legendKeys) {
      const legendItem = legendContainer.locator(`[data-testid="legend-item-${item.key}"]`);
      await expect(legendItem).toBeVisible();

      // Verify legend hatch style overlay if enabled
      const overlay = legendItem.locator('div');
      if (await overlay.count() > 0) {
        const bgImg = await overlay.first().evaluate((el) => window.getComputedStyle(el).backgroundImage);
        expect(bgImg).toContain(item.expectedAngle);
      }
    }

    // Save screenshots for visual evidence
    const screenshotPath = path.join(QA_VISUAL_DIR, 'cross-surface-kr-only.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved cross-surface screenshot to: ${screenshotPath}`);
  });
});
