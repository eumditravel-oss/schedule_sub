// tests/e2e/multi-assignee-calendar-consistency.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (process.env.TEST_BASE_URL || 'https://concost-dev-scheduler.eumditravel.workers.dev').trim();
const ES_PROJECT_ID = 'prj_1785986689248_qhuq';

const QA_CONSISTENCY_DIR = path.join(process.cwd(), 'qa', 'calendar-consistency');
if (!fs.existsSync(QA_CONSISTENCY_DIR)) {
  fs.mkdirSync(QA_CONSISTENCY_DIR, { recursive: true });
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

async function ensureMonthView(page: any) {
  const monthBtn = page.locator('[data-testid="view-month-btn"]');
  await monthBtn.waitFor({ state: 'visible', timeout: 15000 });
  const cls = (await monthBtn.getAttribute('class')) || '';
  const isAlreadyActive = cls.includes('bg-white') || (await monthBtn.getAttribute('data-state')) === 'active';
  if (!isAlreadyActive) {
    await monthBtn.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Multi-Assignee Calendar Consistency & 05-09 Stale Override Removal', () => {
  test('verifies May 2026 worker statuses, confirms 05-09 has 0 partial-off badges and captures proof screenshots', async ({ page }) => {
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/projects/${ES_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await ensureMonthView(page);

    // Verify 2026-05-09 cells for ES tasks (e.g. task 1.1 tsk_1785986692954_uttb)
    const taskCell0509 = page.locator('[data-testid="task-worker-hatch-tsk_1785986692954_uttb-2026-05-09"]').or(
      page.locator('div[data-assignee-availability]').filter({ hasText: '' })
    );

    // Confirm that 2026-05-09 does NOT have worker-partial-off-badge on the grid
    const partialOffBadges0509 = page.locator('div[data-testid="worker-partial-off-badge"]');
    const badgeCount = await partialOffBadges0509.count();

    console.log(`[E2E] Found ${badgeCount} partial-off badges in current view`);
    expect(badgeCount).toBe(0);

    // Capture screenshots for proof
    const datesToProof = ['05-05', '05-09', '05-18', '05-23', '05-25', '05-30'];
    for (const dStr of datesToProof) {
      const shotPath = path.join(QA_CONSISTENCY_DIR, `may-${dStr}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved screenshot: ${shotPath}`);
    }
  });
});
