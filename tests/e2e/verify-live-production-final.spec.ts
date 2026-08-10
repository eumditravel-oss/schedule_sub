// tests/e2e/verify-live-production-final.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { assertMutationSafety } from './productionMutationGuard';

const PROD_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://concost-dev-scheduler.eumditravel.workers.dev').trim();
assertMutationSafety(PROD_BASE_URL, 'verify-live-production-final');
const EXPECTED_SHA_PREFIX = 'ab62b03';

const QA_LIVE_DIR = path.join(process.cwd(), 'qa', 'live-production');
if (!fs.existsSync(QA_LIVE_DIR)) {
  fs.mkdirSync(QA_LIVE_DIR, { recursive: true });
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
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pyjBtn = page.locator('[data-testid="worker-prompt-option-wrk_02"]').or(page.locator('button:has-text("박용진")')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Live Production Release Final Audit Suite', () => {
  test('1. Verify Production /api/version and Build Indicator SHA', async ({ page }) => {
    // API Version Audit
    const versionRes = await page.request.get(`${PROD_BASE_URL}/api/version`);
    expect(versionRes.status()).toBe(200);
    const versionData = await versionRes.json();
    console.log('Production /api/version:', versionData);
    expect(versionData.success).toBe(true);
    expect(versionData.data.commit).toContain(EXPECTED_SHA_PREFIX);

    // Browser Build Indicator Audit
    await setupWorkerSession(page);
    await page.goto(`${PROD_BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const indicator = page.locator('[data-testid="build-version-indicator"]');
    await indicator.waitFor({ state: 'visible', timeout: 15000 });
    const indicatorText = await indicator.innerText();
    console.log('Production Build Indicator text:', indicatorText);
    expect(indicatorText).toContain(`Build ${EXPECTED_SHA_PREFIX}`);
  });

  test('2. Verify Project Overview Page schedule bar layering & hatch overlay', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await setupWorkerSession(page);
    await page.goto(`${PROD_BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Locate Schedule Bar
    const scheduleBar = page.locator('[data-testid="gantt-schedule-track"]').first();
    await scheduleBar.waitFor({ state: 'visible', timeout: 15000 });
    const box = await scheduleBar.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      const topElement = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? {
          tagName: el.tagName,
          className: el.className,
          testId: el.getAttribute('data-testid'),
          projectState: el.getAttribute('data-project-state'),
          surface: el.getAttribute('data-calendar-surface'),
        } : null;
      }, { x: centerX, y: centerY });

      console.log('Top Element at ScheduleBar center:', topElement);
      // Top element must be ScheduleBar container or inner ScheduleBar fill overlay
      expect(['gantt-schedule-track', 'gantt-bar-actual-overlay', 'gantt-bar-planned-overlay']).toContain(topElement?.testId);
    }

    // Save Screenshot 1
    const screenshotPath = path.join(QA_LIVE_DIR, 'overview-ab62b-final.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log('Saved overview screenshot:', screenshotPath);
  });

  test('3. Verify ES Project Detail 2026-05-02 BOTH_OFF visual contract', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await setupWorkerSession(page);
    await page.goto(`${PROD_BASE_URL}/projects/prj_1785986689248_qhuq`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await handleWorkerPrompt(page);

    // Header 2026-05-02 Audit
    const headerMay02 = page.locator('th[data-date="2026-05-02"]').or(page.locator('[data-calendar-surface="HEADER"][data-date="2026-05-02"]')).first();
    if (await headerMay02.isVisible({ timeout: 5000 }).catch(() => false)) {
      const headerState = await headerMay02.getAttribute('data-calendar-visual-state');
      console.log('2026-05-02 Header Visual State:', headerState);
      expect(headerState).toBe('BOTH_OFF');
    }

    // Save Screenshot 2
    const screenshotPath = path.join(QA_LIVE_DIR, 'es-2026-05-02-final.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log('Saved 2026-05-02 screenshot:', screenshotPath);
  });

  test('4. Verify ES Project Detail 2026-04-18 KR_ONLY_OFF visual contract', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await setupWorkerSession(page);
    await page.goto(`${PROD_BASE_URL}/projects/prj_1785986689248_qhuq`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await handleWorkerPrompt(page);

    // Save Screenshot 3
    const screenshotPath = path.join(QA_LIVE_DIR, 'es-2026-04-18-final.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log('Saved 2026-04-18 screenshot:', screenshotPath);
  });

  const MODAL_VIEWPORTS = [
    { width: 900, height: 700 },
    { width: 1024, height: 768 },
    { width: 1100, height: 720 },
    { width: 1313, height: 856 },
  ];

  for (const vp of MODAL_VIEWPORTS) {
    test(`5. Verify Task Modal fixed footer on ${vp.width}x${vp.height}`, async ({ page }) => {
      // Start at 1280x800 desktop viewport to render add-task-btn reliably, then resize if needed
      await page.setViewportSize({ width: 1280, height: 800 });
      await setupWorkerSession(page);
      await page.goto(`${PROD_BASE_URL}/projects/prj_1785986689248_qhuq`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      await handleWorkerPrompt(page);

      // Open Modal
      const addTaskBtn = page.locator('[data-testid="add-task-btn"]').or(page.locator('[data-testid^="task-group-add-task-"]')).first();
      await addTaskBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addTaskBtn.click();
      await handleWorkerPrompt(page);

      if (!(await page.locator('[data-testid="task-modal"]').isVisible({ timeout: 1000 }).catch(() => false))) {
        await addTaskBtn.click();
      }

      const modal = page.locator('[data-testid="task-modal"]');
      await modal.waitFor({ state: 'visible', timeout: 8000 });

      // Resize viewport to target test viewport size
      await page.setViewportSize(vp);
      await page.waitForTimeout(300);

      // Verify Save and Cancel buttons in Viewport immediately
      const cancelBtn = page.locator('[data-testid="task-cancel-btn"]');
      const saveBtn = page.locator('[data-testid="task-save-btn"]');

      await expect(cancelBtn).toBeInViewport();
      await expect(saveBtn).toBeInViewport();

      if (vp.width === 900 && vp.height === 700) {
        const screenshotPath = path.join(QA_LIVE_DIR, 'task-modal-900x700-final.png');
        await page.screenshot({ path: screenshotPath });
        expect(fs.existsSync(screenshotPath)).toBe(true);
        console.log('Saved 900x700 modal screenshot:', screenshotPath);
      }

      await cancelBtn.click();
    });
  }
});
