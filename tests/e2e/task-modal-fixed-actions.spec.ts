import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'task-modal-fixed-actions');

const QA_MODAL_DIR = path.join(process.cwd(), 'qa', 'modal');
if (!fs.existsSync(QA_MODAL_DIR)) {
  fs.mkdirSync(QA_MODAL_DIR, { recursive: true });
}

async function setupWorkerSession(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
}

async function handleWorkerPrompt(page: any) {
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const pyjBtn = page.locator('[data-testid="worker-prompt-option-wrk_02"]').or(page.locator('button:has-text("박용진")')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

const DESKTOP_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1100, height: 720 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

test.describe('Task Modal Fixed Actions Footer Suite', () => {
  for (const vp of DESKTOP_VIEWPORTS) {
    test(`Verify Task Modal actions are fixed and immediately visible on ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupWorkerSession(page);
      await page.goto(`${TEST_BASE_URL}/projects/prj_1785986589890_zi9o`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await handleWorkerPrompt(page);

      // Locate add-task button
      const addTaskBtn = page.locator('[data-testid="add-task-btn"]').or(page.locator('[data-testid^="task-group-add-task-"]')).first();
      await addTaskBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addTaskBtn.click();

      // Ensure worker prompt modal is handled if it appears after click
      await handleWorkerPrompt(page);

      const modal = page.locator('[data-testid="task-modal"]');
      await modal.waitFor({ state: 'visible', timeout: 8000 });

      // Verify Save and Cancel buttons are in DOM and in viewport
      const cancelBtn = page.locator('[data-testid="task-cancel-btn"]');
      const saveBtn = page.locator('[data-testid="task-save-btn"]');

      await expect(cancelBtn).toBeInViewport();
      await expect(saveBtn).toBeInViewport();

      // Save screenshot
      const screenshotPath = path.join(QA_MODAL_DIR, `fixed-actions-${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: screenshotPath });
      expect(fs.existsSync(screenshotPath)).toBe(true);

      // Close modal
      await cancelBtn.click();
    });
  }
});
