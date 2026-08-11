// tests/e2e/project-bar-hatch-layer.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (process.env.TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev').trim();

const QA_VISUAL_DIR = path.join(process.cwd(), 'qa', 'calendar-visual');
if (!fs.existsSync(QA_VISUAL_DIR)) {
  fs.mkdirSync(QA_VISUAL_DIR, { recursive: true });
}

async function dismissWorkerPromptModal(page: any) {
  await page.route('**/api/calendar/pending-schedule-decisions**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
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

test.describe('Project Overview Schedule Bar Layering Suite', () => {
  test('1. Verify elementFromPoint at ScheduleBar center returns ScheduleBar (not Hatch Overlay z-10)', async ({ page }) => {
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-testid="calendar-manager-modal"]')).toBeHidden();

    const scheduleBarTrack = page.locator('[data-testid^="gantt-schedule-bar-track-"]').first();
    await scheduleBarTrack.waitFor({ state: 'visible', timeout: 15000 });

    const boundingBox = await scheduleBarTrack.boundingBox();
    expect(boundingBox).not.toBeNull();

    if (boundingBox) {
      const centerX = Math.round(boundingBox.x + boundingBox.width / 2);
      const centerY = Math.round(boundingBox.y + boundingBox.height / 2);

      // Perform elementFromPoint in browser context
      const topElementInfo = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        return {
          tagName: el.tagName,
          className: el.className,
          testId: el.getAttribute('data-testid'),
          scheduleBarTrackId: el.closest('[data-testid^="gantt-schedule-bar-track-"]')?.getAttribute('data-testid') || null,
          projectState: el.getAttribute('data-project-calendar-state'),
          surface: el.getAttribute('data-calendar-surface'),
        };
      }, { x: centerX, y: centerY });

      console.log('Top element at ScheduleBar center:', topElementInfo);
      
      // Top element must NOT be the project hatch overlay
      expect(topElementInfo?.surface).not.toBe('PROJECT_OVERVIEW');
      expect(topElementInfo?.testId).not.toContain('project-calendar-hatch');
      expect(topElementInfo?.scheduleBarTrackId).toBe(await scheduleBarTrack.getAttribute('data-testid'));
    }

    const screenshotPath = path.join(QA_VISUAL_DIR, 'overview-bar-above-hatch.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`Saved ScheduleBar layering screenshot to: ${screenshotPath}`);
  });
});
