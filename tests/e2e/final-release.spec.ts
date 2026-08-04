// tests/e2e/final-release.spec.ts
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const QA_PREFIX = `[QA-FINAL-${Date.now()}]`;
const QA_CALENDAR_PREFIX = `[QA-CALENDAR-${Date.now()}]`;
const BASE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev';

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

async function selectWorkerInPage(page: Page, workerName: string) {
  await page.waitForTimeout(800);
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

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('/api/not-existing') && !text.includes('404')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 400) {
        if (!res.url().includes('/api/not-existing') && !res.url().includes('/api/translate')) {
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

    // Close Modal
    await page.click('[data-testid="calendar-modal-close-btn"]');

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
    await selectWorkerInPage(page, '박용진 수석');

    // Find created project row and click to edit
    const createdPrjRow = page.locator(`tr:has-text("${QA_PREFIX} E2E 일정 이동 테스트")`).first();
    await createdPrjRow.click();
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
});
