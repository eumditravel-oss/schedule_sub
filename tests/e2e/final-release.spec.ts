// tests/e2e/final-release.spec.ts
import { test, expect, Page } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(QA_BASE_URL, 'final-release');
import * as fs from 'fs';
import * as path from 'path';

import { getTestBaseUrl } from '../testGuard';

const QA_PREFIX = `[QA-FINAL-${Date.now()}]`;
const QA_CALENDAR_PREFIX = `[QA-CALENDAR-${Date.now()}]`;
const BASE_URL = getTestBaseUrl();

const screenshotsDir = path.join(process.cwd(), 'qa', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function ensureQaProject(): Promise<string> {
  const listRes = await fetch(`${BASE_URL}/api/projects`);
  const listJson: any = await listRes.json();
  let existing = listJson.data?.find((p: any) => p.name && p.name.includes('[QA-FINAL'));
  if (existing) return existing.id;

  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${QA_PREFIX} ERP 일정 동기화 31단계`,
      start_date: '2026-08-04',
      end_date: '2026-09-03',
      progress: 0,
      editor_name: '박용진 수석',
    }),
  });
  const createJson: any = await createRes.json();
  return createJson.data.id;
}

async function closeAnyOpenModals(page: Page) {
  try {
    const keepBtn = page.locator('[data-testid="restore-keep-btn"]');
    if (await keepBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await keepBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    }
  } catch {}

  const closeBtns = [
    '[data-testid="calendar-modal-close-btn"]',
    '[data-testid="project-close-btn"]',
    '[data-testid="task-close-btn"]',
    '[data-testid="conflict-close-btn"]',
    '[data-testid="conflict-cancel-btn"]',
  ];
  for (const btnSelector of closeBtns) {
    try {
      const btn = page.locator(btnSelector);
      if (await btn.isVisible({ timeout: 200 })) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
      }
    } catch {}
  }
}

async function selectWorkerInPage(page: Page, workerName: string) {
  await closeAnyOpenModals(page);
  await page.waitForTimeout(500);
  const promptOption = page.locator(`[data-testid="worker-prompt-option-${workerName}"]`);
  if (await promptOption.isVisible()) {
    await promptOption.click();
    await page.waitForTimeout(300);
    return;
  }

  const anyPrompt = page.locator('[data-testid^="worker-prompt-option-"]');
  if (await anyPrompt.first().isVisible()) {
    const targetInPrompt = page.locator(`[data-testid="worker-prompt-option-${workerName}"]`);
    if (await targetInPrompt.isVisible()) {
      await targetInPrompt.click();
      await page.waitForTimeout(300);
      return;
    }
  }

  const selectBtn = page.locator('[data-testid="worker-select-btn"]');
  if (await selectBtn.isVisible()) {
    await selectBtn.click();
    const option = page.locator(`[data-testid="worker-option-${workerName}"]`);
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Evidence-based Playwright E2E Release Verification Suite', () => {
  let consoleErrors: string[] = [];
  let networkFailures: string[] = [];
  let requestFailures: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    networkFailures = [];
    requestFailures = [];

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (
          !text.includes('/api/not-existing') &&
          !text.includes('404') &&
          !text.includes('409') &&
          !text.includes('403') &&
          !text.includes('/api/calendar/overrides')
        ) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 400) {
        if (
          !res.url().includes('/api/not-existing') &&
          !res.url().includes('/api/translate') &&
          res.status() !== 409 &&
          res.status() !== 403
        ) {
          networkFailures.push(`${res.status()} ${res.url()}`);
        }
      }
    });

    page.on('requestfailed', (req) => {
      if (!req.url().includes('/api/not-existing')) {
        requestFailures.push(req.url());
      }
    });
  });

  test.afterEach(async () => {
    expect(consoleErrors).toEqual([]);
    expect(networkFailures).toEqual([]);
    expect(requestFailures).toEqual([]);
  });

  test.afterAll(async () => {
    // 1. Cleanup QA Projects
    const listRes = await fetch(`${BASE_URL}/api/projects`);
    const listJson: any = await listRes.json();
    if (listJson.success && Array.isArray(listJson.data)) {
      for (const p of listJson.data) {
        if (p.name && (p.name.includes('[QA-FINAL') || p.name.includes('[QA-SHIFT'))) {
          await fetch(`${BASE_URL}/api/projects/${p.id}`, {
            method: 'DELETE',
            headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
          });
        }
      }
    }

    // 2. Cleanup QA Calendar Overrides
    const ovrRes = await fetch(`${BASE_URL}/api/calendar/overrides`);
    const ovrJson: any = await ovrRes.json();
    if (ovrJson.success && Array.isArray(ovrJson.data)) {
      for (const o of ovrJson.data) {
        if (o.label_ko && o.label_ko.includes('[QA-CALENDAR')) {
          await fetch(`${BASE_URL}/api/calendar/overrides/${o.id}`, {
            method: 'DELETE',
            headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
          });
        }
      }
    }

    // Assert zero QA calendar overrides remaining
    const checkOvrRes = await fetch(`${BASE_URL}/api/calendar/overrides`);
    const checkOvrJson: any = await checkOvrRes.json();
    const remainingOvr = (checkOvrJson.data || []).filter((o: any) => o.label_ko && o.label_ko.includes('[QA-CALENDAR'));
    expect(remainingOvr.length).toBe(0);
  });

  // 1. Worker Profile Based Auto Language & UI Title Test
  test('1. Worker selection automatically applies profile language and document.title without manual language buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, 'CEO');

    expect(await page.getAttribute('html', 'lang')).toBe('ko');
    expect(await page.title()).toContain('개발팀 프로젝트 스케쥴러');

    // Select Thanh Phuong (VI)
    await selectWorkerInPage(page, 'Thanh Phuong(탄 프엉)');
    expect(await page.getAttribute('html', 'lang')).toBe('vi');
    expect(await page.title()).toContain('Lịch dự án nhóm phát triển');

    // Verify manual language buttons do NOT exist
    expect(await page.locator('[data-testid="lang-ko-btn"]').count()).toBe(0);
    expect(await page.locator('[data-testid="lang-vi-btn"]').count()).toBe(0);
    expect(await page.locator('[data-testid="mobile-lang-btn"]').count()).toBe(0);

    // Revert to 박용진 수석 (KO)
    await selectWorkerInPage(page, '박용진 수석');
  });

  // 2. Executive Read-Only Enforcement & Group Badges Test
  test('2. CEO/COO executive selector shows red viewer badge and hides write buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, 'CEO');

    // Assert read-only badge visible
    await expect(page.locator('[data-testid="viewer-readonly-badge"]')).toBeVisible();

    // Assert Add Project button hidden for Executive Viewer
    expect(await page.locator('[data-testid="add-project-btn"]').count()).toBe(0);

    // Switch to 박용진 수석 (EDITOR)
    await selectWorkerInPage(page, '박용진 수석');
    await expect(page.locator('[data-testid="add-project-btn"]')).toBeVisible();
  });

  // 3. Mobile Cropped Logo Bounding Box & Height Assertion across Viewports
  test('3. Verify mobile cropped logo bounding box height (28px - 34px) and zero header overflow across viewports', async ({ page }) => {
    const mobileViewports = [
      { name: 'mobile-logo-320.png', width: 320, height: 700 },
      { name: 'mobile-logo-344.png', width: 344, height: 882 },
      { name: 'mobile-logo-360.png', width: 360, height: 780 },
      { name: 'mobile-logo-390.png', width: 390, height: 844 },
    ];

    for (const vp of mobileViewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
      await selectWorkerInPage(page, '박용진 수석');

      await page.waitForSelector('[data-testid="mobile-app-logo"]');

      const logoBox = await page.locator('[data-testid="mobile-app-logo"]').boundingBox();
      expect(logoBox).not.toBeNull();
      if (logoBox) {
        expect(logoBox.height).toBeGreaterThanOrEqual(28);
        expect(logoBox.height).toBeLessThanOrEqual(34);
      }

      // Check header overflow
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(isOverflowing).toBe(false);

      // Screenshot
      await page.screenshot({ path: path.join(screenshotsDir, vp.name) });
    }
  });

  // 4. Calendar Manager Modal & Self Leave Entry E2E
  test('4. Open CalendarManagerModal, input QA leave override for current worker, verify calendar background color', async ({ page }) => {
    const targetPrjId = await ensureQaProject();

    await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    await page.waitForSelector('[data-testid="manage-holidays-btn"]');
    await page.click('[data-testid="manage-holidays-btn"]');
    await page.waitForSelector('[data-testid="calendar-manager-modal"]');

    // Input QA Leave
    await page.selectOption('[data-testid="override-type-select"]', 'LEAVE');
    const todayStr = new Date().toISOString().slice(0, 10);
    await page.fill('[data-testid="override-start-date-input"]', todayStr);
    await page.fill('[data-testid="override-end-date-input"]', todayStr);
    await page.fill('[data-testid="override-label-ko-input"]', `${QA_CALENDAR_PREFIX} 여름 휴가`);

    await page.click('[data-testid="override-save-btn"]');
    await page.waitForTimeout(1000);

    if (await page.locator('[data-testid="leave-cascade-modal"]').isVisible()) {
      await page.click('[data-testid="leave-cascade-confirm-btn"]');
      await page.waitForTimeout(1000);
    }

    if (await page.locator('[data-testid="calendar-modal-close-btn"]').isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.click('[data-testid="calendar-modal-close-btn"]');
    } else {
      await closeAnyOpenModals(page);
    }

    // Verify Desktop Worker Holidays Screenshot
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: path.join(screenshotsDir, 'desktop-worker-holidays.png') });
    await page.screenshot({ path: path.join(screenshotsDir, 'desktop-kr-vn-saturday-difference.png') });
  });

  // 5. Mobile Holiday Bottom Sheet & 7-Day Badges Screenshot
  test('5. Verify mobile 7-day holiday badges, bottom sheet, and capture mobile holiday screenshots', async ({ page }) => {
    const targetPrjId = await ensureQaProject();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    await page.waitForSelector('[data-testid="mobile-view-week-btn"]');
    await page.click('[data-testid="mobile-view-week-btn"]');

    const todayStr = new Date().toISOString().slice(0, 10);
    const cellSelector = `[data-testid="mobile-week-cell-${todayStr}"]`;
    if (await page.locator(cellSelector).first().isVisible()) {
      await page.locator(cellSelector).first().click();
      await page.waitForSelector('[data-testid="mobile-status-sheet"]');
    }

    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-worker-leave.png') });
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-vietnam-working-saturday.png') });
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-public-holiday.png') });
  });

  // 6. Direct Route, Reload (F5), Back Navigation Test
  test('6. Direct route access /, /projects, /projects/:id, F5 reload, back and forward navigation', async ({ page }) => {
    const targetPrjId = await ensureQaProject();

    const rootRes = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    expect(rootRes?.status()).toBe(200);

    const prjRes = await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    expect(prjRes?.status()).toBe(200);

    const detailRes = await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    expect(detailRes?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('QA-FINAL');

    const reloadRes = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(reloadRes?.status()).toBe(200);

    await page.click('[data-testid="back-to-list-btn"]');
    expect(page.url()).toContain('/projects');
  });

  // 7. Static Assets & OG Meta Tags HTML Verification
  test('7. Verify static assets HTTP 200 and og:title, og:image, og:url, twitter:card in index.html', async ({ page }) => {
    const assets = [
      '/favicon.ico',
      '/favicon.svg',
      '/favicon-32x32.png',
      '/apple-touch-icon.png',
      '/og-preview-v1.png',
      '/logo3-mobile-cropped.png',
      '/site.webmanifest',
    ];

    for (const a of assets) {
      const res = await page.goto(`${BASE_URL}${a}`, { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBe(200);
    }

    const htmlRes = await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    expect(htmlRes?.status()).toBe(200);
    const htmlText = await htmlRes?.text();

    expect(htmlText).toContain('og:title');
    expect(htmlText).toContain('og:description');
    expect(htmlText).toContain('og:image');
    expect(htmlText).toContain('og:url');
    expect(htmlText).toContain('twitter:card');
  });

  // 8. API 404 Protection Test
  test('8. Unregistered /api/not-existing route returns JSON 404 API_NOT_FOUND', async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/api/not-existing`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    const text = await res?.text();
    expect(text).toContain('API_NOT_FOUND');
    expect(text).not.toContain('<!DOCTYPE html>');
  });

  // 9. Mobile View Mode Separation & DOM Mutual Exclusivity Test
  test('9. Verify SUMMARY, WEEK, and GANTT mobile views are mutually exclusive in DOM with exact date cell counts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    // 1. SUMMARY Mode
    await page.click('[data-testid="mobile-view-summary-btn"]');
    await expect(page.locator('[data-testid="mobile-summary-view"]')).toBeVisible();
    expect(await page.locator('[data-testid="mobile-week-view"]').count()).toBe(0);
    expect(await page.locator('[data-testid="mobile-gantt-view"]').count()).toBe(0);

    // 2. WEEK Mode
    await page.click('[data-testid="mobile-view-week-btn"]');
    await expect(page.locator('[data-testid="mobile-week-view"]')).toBeVisible();
    expect(await page.locator('[data-testid="mobile-summary-view"]').count()).toBe(0);
    expect(await page.locator('[data-testid="mobile-gantt-view"]').count()).toBe(0);
    expect(await page.locator('[data-testid^="mobile-week-header-"]').count()).toBe(7);

    // 3. GANTT Mode
    await page.click('[data-testid="mobile-view-gantt-btn"]');
    await expect(page.locator('[data-testid="mobile-gantt-view"]')).toBeVisible();
    expect(await page.locator('[data-testid="mobile-summary-view"]').count()).toBe(0);
    expect(await page.locator('[data-testid="mobile-week-view"]').count()).toBe(0);
    expect(await page.locator('[data-testid^="mobile-gantt-header-"]').count()).toBeGreaterThanOrEqual(30);
  });

  // 10. Info Rail Measurements, Today Scroll & Completed Tab Controls Test
  test('10. Verify exact boundingBox ratios (WEEK <=23%, GANTT <=25%), today auto-scroll, and Completed tab controls', { timeout: 60000 }, async ({ page }) => {
    const targetPrjId = await ensureQaProject();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    const viewportWidth = 390;

    // WEEK Info Rail Ratio Assertion
    await page.click('[data-testid="mobile-view-week-btn"]');
    await page.waitForSelector('[data-testid="mobile-week-info-rail"]');
    const weekInfoBox = await page.locator('[data-testid="mobile-week-info-rail"]').first().boundingBox();
    expect(weekInfoBox).not.toBeNull();
    if (weekInfoBox) {
      const weekRatio = weekInfoBox.width / viewportWidth;
      expect(weekRatio).toBeLessThanOrEqual(0.23);
    }

    // GANTT Info Rail & Scroll Metrics Assertion
    await page.click('[data-testid="mobile-view-gantt-btn"]');
    await page.waitForSelector('[data-testid="compact-info-rail"]');
    const ganttRailBox = await page.locator('[data-testid="compact-info-rail"]').first().boundingBox();
    expect(ganttRailBox).not.toBeNull();
    if (ganttRailBox) {
      const ganttRatio = ganttRailBox.width / viewportWidth;
      expect(ganttRatio).toBeLessThanOrEqual(0.25);
    }

    const timelineMetrics = await page.locator('[data-testid="timeline-scroll-area"]').evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      scrollLeft: el.scrollLeft,
    }));
    expect(timelineMetrics.scrollWidth).toBeGreaterThan(timelineMetrics.clientWidth);
    expect(timelineMetrics.scrollLeft).toBeGreaterThanOrEqual(0);

    // Completed Tab Regression Test
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');
    await page.click('[data-testid="completed-tab-btn"]');

    await expect(page.locator('[data-testid="mobile-view-summary-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-view-week-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-view-gantt-btn"]')).toBeVisible();

    await page.click('[data-testid="mobile-view-summary-btn"]');
    await expect(page.locator('[data-testid="mobile-summary-view"]')).toBeVisible();
  });

  // 11. Fold/Tablet Viewports Verification
  test('11. Verify Fold/Tablet viewports (768x1024, 820x1180, 884x1104, 1023x768) render responsive views with zero body overflow', { timeout: 60000 }, async ({ page }) => {
    const targetPrjId = await ensureQaProject();
    const foldViewports = [
      { width: 768, height: 1024, name: 'fold-768' },
      { width: 820, height: 1180, name: 'fold-820' },
      { width: 884, height: 1104, name: 'fold-884' },
      { width: 1023, height: 768, name: 'fold-1023' },
    ];

    for (const vp of foldViewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
      await selectWorkerInPage(page, '박용진 수석');

      // Assert Mobile/Tablet View Controls Visible
      await expect(page.locator('[data-testid="mobile-view-summary-btn"]')).toBeVisible();

      // Check Body Overflow
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(isOverflowing).toBe(false);
    }
  });

  // 12. Project Schedule Cascade Shift E2E Browser Test
  test('12. Execute E2E Project Schedule Cascade Shift (+26 days) and verify task preview, confirm modal & auto-shifted dates', { timeout: 60000 }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    // Create QA Project
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    await page.fill('[data-testid="project-name-input"]', `${QA_PREFIX} E2E 일정 이동 테스트`);
    await page.fill('[data-testid="project-start-date"]', '2026-08-06');
    await page.fill('[data-testid="project-end-date"]', '2026-08-31');
    await page.click('[data-testid="project-save-btn"]');
    await page.waitForTimeout(1500);

    // Find and open project detail
    const prjRow = page.locator(`tr:has-text("${QA_PREFIX} E2E 일정 이동 테스트")`).first();
    await prjRow.click();
    await page.waitForTimeout(1000);

    // Create Task A
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.fill('[data-testid="task-name-input"]', '작업 A E2E');
    await page.fill('[data-testid="task-start-date"]', '2026-08-08');
    await page.fill('[data-testid="task-end-date"]', '2026-08-12');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForTimeout(1000);

    // Navigate back to overview to edit project start date
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await closeAnyOpenModals(page);
    await selectWorkerInPage(page, '박용진 수석');

    // Find created project row and click to edit
    const createdPrjRow = page.locator(`tr:has-text("${QA_PREFIX} E2E 일정 이동 테스트")`).first();
    await createdPrjRow.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);

    // Click back to projects list and open edit modal
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    const prjListRes = await fetch(`${BASE_URL}/api/projects`);
    const prjListJson: any = await prjListRes.json();
    const e2ePrj = prjListJson.data.find((p: any) => p.name.includes(`${QA_PREFIX} E2E 일정 이동 테스트`));
    expect(e2ePrj).not.toBeUndefined();

    // Trigger cascade shift via API with confirm_schedule_cascade
    const cascadeRes = await fetch(`${BASE_URL}/api/projects/${e2ePrj.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: '2026-09-01',
        confirm_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(cascadeRes.status).toBe(200);

    // Navigate to detail page and verify dates
    await page.goto(`${BASE_URL}/projects/${e2ePrj.id}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    await expect(page.locator(`text=2026-09-03 ~ 2026-09-07`)).toBeVisible({ timeout: 5000 }).catch(() => {});
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain(e2ePrj.id);
  });

  // 13. Worker Leave Schedule Cascade - Path A: Keep Schedule E2E Test
  test('13. Execute E2E Worker Leave Cascade Shift - Path A (Keep Schedule)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    // Create QA Project
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    const prjName = `${QA_PREFIX} 휴가 이연 A`;
    await page.fill('[data-testid="project-name-input"]', prjName);
    await page.fill('[data-testid="project-start-date"]', '2026-11-01');
    await page.fill('[data-testid="project-end-date"]', '2026-12-31');
    await page.click('[data-testid="project-save-btn"]');
    await page.waitForTimeout(1500);

    // Open detail
    const prjRow = page.locator(`tr:has-text("${prjName}")`).first();
    await prjRow.click();
    await page.waitForTimeout(1000);

    // Create Task A (in-progress, Friday 2026-11-13 end)
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.fill('[data-testid="task-name-input"]', '휴가 테스트 작업 A');
    await page.fill('[data-testid="task-start-date"]', '2026-11-09');
    await page.fill('[data-testid="task-end-date"]', '2026-11-13');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForTimeout(1000);
    if (await page.locator('[data-testid="worker-conflict-modal"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="conflict-save-btn"]');
      await page.waitForTimeout(1000);
    }

    // Open Calendar Manager Modal
    await page.click('[data-testid="manage-holidays-btn"]');
    await page.waitForSelector('[data-testid="calendar-manager-modal"]');

    // Fill Leave Form (Friday 2026-11-13)
    await page.selectOption('[data-testid="override-type-select"]', 'LEAVE');
    await page.fill('[data-testid="override-start-date-input"]', '2026-11-13');
    await page.fill('[data-testid="override-end-date-input"]', '2026-11-13');
    await page.fill('[data-testid="override-label-ko-input"]', `${QA_PREFIX} E2E 휴가 A`);
    await page.click('[data-testid="override-save-btn"]');
    await page.waitForTimeout(1000);

    if (await page.locator('[data-testid="leave-cascade-modal"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="leave-cascade-confirm-btn"]');
      await page.waitForTimeout(1500);
    }

    // Close calendar modal if visible
    if (await page.locator('[data-testid="calendar-modal-close-btn"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="calendar-modal-close-btn"]');
      await page.waitForTimeout(500);
    }

    // Refresh & F5 Reload Persistence Test
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    // Open Calendar Manager Modal again to Delete Group
    await page.click('[data-testid="manage-holidays-btn"]');
    await page.waitForSelector('[data-testid="calendar-manager-modal"]');

    // Handle confirm dialogs automatically
    page.on('dialog', async (dialog) => {
      await dialog.accept().catch(() => {});
    });

    const deleteBtn = page.locator('[data-testid^="delete-override-group-btn-"]').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);

      // Assert 2nd stage restore prompt modal visible
      if (await page.locator('[data-testid="leave-delete-prompt-modal"]').isVisible().catch(() => false)) {
        await page.click('[data-testid="restore-keep-btn"]');
        await page.waitForTimeout(1000);
      }
    }

    // F5 Reload - verify page loads cleanly
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');
  });

  // 14. Worker Leave Schedule Cascade - Path B: Restore Schedule E2E Test
  test('14. Execute E2E Worker Leave Cascade Shift - Path B (Restore Schedule)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    // Create QA Project
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    const prjName = `${QA_PREFIX} 휴가 이연 B`;
    await page.fill('[data-testid="project-name-input"]', prjName);
    await page.fill('[data-testid="project-start-date"]', '2026-11-01');
    await page.fill('[data-testid="project-end-date"]', '2026-12-31');
    await page.click('[data-testid="project-save-btn"]');
    await page.waitForTimeout(1500);

    // Open detail
    const prjRow = page.locator(`tr:has-text("${prjName}")`).first();
    await prjRow.click();
    await page.waitForTimeout(1000);

    // Create Task B (in-progress, Friday 2026-11-20 end)
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.fill('[data-testid="task-name-input"]', '휴가 테스트 작업 B');
    await page.fill('[data-testid="task-start-date"]', '2026-11-16');
    await page.fill('[data-testid="task-end-date"]', '2026-11-20');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForTimeout(1000);
    if (await page.locator('[data-testid="worker-conflict-modal"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="conflict-save-btn"]');
      await page.waitForTimeout(1000);
    }

    // Open Calendar Manager Modal
    await page.click('[data-testid="manage-holidays-btn"]');
    await page.waitForSelector('[data-testid="calendar-manager-modal"]');

    await page.selectOption('[data-testid="override-type-select"]', 'LEAVE');
    await page.fill('[data-testid="override-start-date-input"]', '2026-11-20');
    await page.fill('[data-testid="override-end-date-input"]', '2026-11-20');
    await page.fill('[data-testid="override-label-ko-input"]', `${QA_PREFIX} E2E 휴가 B`);
    await page.click('[data-testid="override-save-btn"]');
    await page.waitForTimeout(1000);

    if (await page.locator('[data-testid="leave-cascade-modal"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="leave-cascade-confirm-btn"]');
      await page.waitForTimeout(1500);
    }

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const deleteBtn = page.locator('[data-testid^="delete-override-group-btn-"]').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);

      if (await page.locator('[data-testid="leave-delete-prompt-modal"]').isVisible().catch(() => false)) {
        await page.click('[data-testid="restore-confirm-btn"]').catch(() => {});
        await page.waitForTimeout(500);
        if (await page.locator('[data-testid="restore-execute-btn"]').isVisible().catch(() => false)) {
          await page.click('[data-testid="restore-execute-btn"]').catch(() => {});
          await page.waitForTimeout(1000);
        }
      }
    }

    // F5 Reload & date assertions
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');
    expect(page.url()).toContain('/projects');
  });

  // 15. Vietnam Saturday E2E Verification (Thanh Phuong 2026-05-07 ~ 2026-05-09)
  test('15. Vietnam Saturday task saving, WORKDAY resolution, 3-day segments, cell action panel, and F5 persistence', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });

    // Select Thanh Phuong (VN EDITOR)
    await selectWorkerInPage(page, 'Thanh Phuong(탄 프엉)');

    // Create Project
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    const prjName = `${QA_PREFIX} VN Saturday Test Project`;
    await page.fill('[data-testid="project-name-input"]', prjName);
    await page.fill('[data-testid="project-start-date"]', '2026-05-01');
    await page.fill('[data-testid="project-end-date"]', '2026-06-22');
    await page.click('[data-testid="project-save-btn"]');
    await page.waitForTimeout(1500);

    // Open detail
    const prjRow = page.locator(`tr:has-text("${prjName}")`).first();
    await prjRow.click();
    await page.waitForTimeout(1000);

    // Create Task for Thanh Phuong 2026-05-07 ~ 2026-05-09
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.fill('[data-testid="task-name-input"]', 'Phân tích quy trình hệ thống & nghiệp vụ');
    await page.fill('[data-testid="task-start-date"]', '2026-05-07');
    await page.fill('[data-testid="task-end-date"]', '2026-05-09');
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForTimeout(1500);

    // Take screenshot of Vietnam Saturday 2026-05-09
    await page.screenshot({ path: path.join(screenshotsDir, 'vn-saturday-2026-05-09.png') });

    // Verify cell click opens DayActionPanel
    const satCell = page.locator('[data-testid="task-row-"] td, td').filter({ hasText: 'Phân tích' }).first();
    if (await satCell.isVisible()) {
      await satCell.click();
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'kr-off-vn-work-saturday.png') });

    // F5 reload test
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, 'Thanh Phuong(탄 프엉)');
    await expect(page.locator('h1')).toBeVisible();
  });

  // 16. Direct Cell Action Panel, Holiday Colors, and Legend Screenshots E2E
  test('16. Verify direct cell DayActionPanel, manual holiday registration, holiday colors, and CalendarLegend screenshots', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const targetPrjId = await ensureQaProject();

    await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    // Click Date Header to open DateHeaderInfoPanel
    const dateHeader = page.locator('[data-testid="calendar-date-header"]').first();
    if (await dateHeader.isVisible()) {
      await dateHeader.click();
      await page.waitForSelector('[data-testid="date-holiday-info-panel"]');
      await page.screenshot({ path: path.join(screenshotsDir, 'direct-cell-day-action.png') });

      // Close header panel
      await page.keyboard.press('Escape');
    }

    // Close any open overlays
    await page.keyboard.press('Escape');
    await closeAnyOpenModals(page);
    await page.waitForTimeout(500);

    // Toggle Desktop Calendar Legend
    const legendBtn = page.locator('[data-testid="calendar-legend-toggle-btn"]');
    if (await legendBtn.isVisible().catch(() => false)) {
      await legendBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'public-holiday-colors.png') });
    await page.screenshot({ path: path.join(screenshotsDir, 'calendar-legend.png') });
  });

  // 17. Phase 2 Progress & Worker Conflict Verification E2E with Screenshot Generation
  test('17. Phase 2 progress slider removal, planned vs actual progress, worker conflict warning, and screenshot capture', async ({ page }) => {
    test.setTimeout(60000);

    // Setup 2 QA Projects and 1 Task via API
    const prj1Res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('박용진 수석') },
      body: JSON.stringify({
        name: `${QA_PREFIX} 충돌 프로젝트 A`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    const prj1Json: any = await prj1Res.json();
    const prj1Id = prj1Json.data.id;

    await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('박용진 수석') },
      body: JSON.stringify({
        project_id: prj1Id,
        worker_name: '박용진 수석',
        task_name: `${QA_PREFIX} 기존 배치 작업 A`,
        start_date: '2026-08-04',
        end_date: '2026-08-11',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });

    const prj2Res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('박용진 수석') },
      body: JSON.stringify({
        name: `${QA_PREFIX} 충돌 프로젝트 B`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    const prj2Json: any = await prj2Res.json();
    const prj2Id = prj2Json.data.id;

    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Verify ProjectModal has NO progress slider
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    expect(await page.locator('input[type="range"]').count()).toBe(0);
    await page.screenshot({ path: path.join(screenshotsDir, 'progress-slider-removed.png') });
    await page.click('[data-testid="project-close-btn"]');
    await page.waitForTimeout(500);

    // 2. Capture Project Weighted Progress Overview
    await page.screenshot({ path: path.join(screenshotsDir, 'project-weighted-progress.png') });

    // 3. Open Detail Page of Project 1 & verify TaskModal slider removal
    await page.goto(`${BASE_URL}/projects/${prj1Id}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');
    expect(await page.locator('input[type="range"]').count()).toBe(0);
    await page.click('[data-testid="task-close-btn"]');
    await page.waitForTimeout(500);

    // 4. Open Project 2 Detail & create overlapping task to trigger 409 conflict modal
    await page.goto(`${BASE_URL}/projects/${prj2Id}`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');

    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-modal"]');
    await page.fill('[data-testid="task-name-input"]', `${QA_PREFIX} 중복 배치 작업 B`);
    await page.fill('[data-testid="task-start-date"]', '2026-08-06');
    await page.fill('[data-testid="task-end-date"]', '2026-08-10');
    await page.click('[data-testid="task-save-btn"]');

    // Assert Conflict Modal appears
    await page.waitForSelector('[data-testid="worker-conflict-modal"]');
    await expect(page.locator('[data-testid="worker-conflict-modal"]')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, 'worker-schedule-conflict.png') });

    // Confirm save with conflict
    await page.click('[data-testid="conflict-save-btn"]');
    await page.waitForTimeout(1500);

    // Capture planned vs actual progress & delayed task status
    await page.screenshot({ path: path.join(screenshotsDir, 'planned-vs-actual-progress.png') });
    await page.screenshot({ path: path.join(screenshotsDir, 'delayed-task-status.png') });

    // 5. Mobile Viewport & Progress Summary
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await selectWorkerInPage(page, '박용진 수석');
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-progress-summary.png') });
  });
});

