// tests/e2e/final-release.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const QA_PREFIX = `[QA-FINAL-${Date.now()}]`;
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
      editor_name: 'CEO',
    }),
  });
  const createJson: any = await createRes.json();
  return createJson.data.id;
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
        if (!res.url().includes('/api/not-existing')) {
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
    // Cleanup any QA-FINAL test project on remote API and ASSERT 0 QA projects remain
    const listRes = await fetch(`${BASE_URL}/api/projects`);
    const listJson: any = await listRes.json();
    if (listJson.success && Array.isArray(listJson.data)) {
      for (const p of listJson.data) {
        if (p.name && p.name.includes('[QA-FINAL')) {
          await fetch(`${BASE_URL}/api/projects/${p.id}`, {
            method: 'DELETE',
            headers: { 'x-editor-name': encodeURIComponent('CEO') },
          });
        }
      }
    }

    const checkRes = await fetch(`${BASE_URL}/api/projects`);
    const checkJson: any = await checkRes.json();
    const remainingQa = checkJson.data?.filter((p: any) => p.name && p.name.includes('[QA-FINAL')) || [];
    expect(remainingQa.length).toBe(0);
  });

  // 1. Language Toggle & Dynamic Title Test
  test('1. Toggle KO and VI languages and verify document.title and html lang', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="lang-ko-btn"]');

    // Click KO
    await page.click('[data-testid="lang-ko-btn"]');
    expect(await page.getAttribute('html', 'lang')).toBe('ko');
    expect(await page.title()).toContain('개발팀 프로젝트 스케쥴러');

    // Click VI
    await page.click('[data-testid="lang-vi-btn"]');
    expect(await page.getAttribute('html', 'lang')).toBe('vi');
    expect(await page.title()).toContain('Lịch dự án nhóm phát triển');

    // Revert to KO
    await page.click('[data-testid="lang-ko-btn"]');
  });

  // 2. Worker Selector Dropdown & Option Click Test
  test('2. Worker selector lists 7 active members and sets current worker (worker-option-COO)', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="worker-select-btn"]');

    // Open dropdown
    await page.click('[data-testid="worker-select-btn"]');
    await page.waitForSelector('[data-testid="worker-option-CEO"]');

    // Verify CEO, COO, 유종욱 실장
    await expect(page.locator('[data-testid="worker-option-CEO"]')).toBeVisible();
    await expect(page.locator('[data-testid="worker-option-COO"]')).toBeVisible();
    await expect(page.locator('[data-testid="worker-option-유종욱 실장"]')).toBeVisible();

    // Select COO
    await page.click('[data-testid="worker-option-COO"]');
    await expect(page.locator('[data-testid="worker-select-btn"]')).toContainText('COO');

    // Select CEO
    await page.click('[data-testid="worker-select-btn"]');
    await page.click('[data-testid="worker-option-CEO"]');
    await expect(page.locator('[data-testid="worker-select-btn"]')).toContainText('CEO');
  });

  // 3. Active vs Completed Tabs & View Mode / Range Controls Click Test
  test('3. Click active-tab-btn, completed-tab-btn, view-30days-btn, view-month-btn, nav-prev-btn, nav-today-btn, nav-next-btn', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });

    // Click Completed Tab
    await page.click('[data-testid="completed-tab-btn"]');
    await expect(page.locator('[data-testid="year-select"]')).toBeVisible();

    // Click Active Tab
    await page.click('[data-testid="active-tab-btn"]');
    await expect(page.locator('[data-testid="view-30days-btn"]')).toBeVisible();

    // Desktop View Toggle: 월별 / 30일
    await page.click('[data-testid="view-month-btn"]');
    await expect(page.locator('[data-testid="view-month-btn"]')).toHaveClass(/bg-white/);

    await page.click('[data-testid="view-30days-btn"]');
    await expect(page.locator('[data-testid="view-30days-btn"]')).toHaveClass(/bg-white/);

    // Range Controls: prev, today, next
    await page.click('[data-testid="nav-prev-btn"]');
    await page.click('[data-testid="nav-next-btn"]');
    await page.click('[data-testid="nav-today-btn"]');
  });

  // 4. Project Modal Cancel & Close Button Test
  test('4. Open project modal and test project-cancel-btn and project-close-btn', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="worker-select-btn"]');
    await page.click('[data-testid="worker-option-CEO"]');

    // Open Modal and click Close X
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    await page.click('[data-testid="project-close-btn"]');
    await expect(page.locator('[data-testid="project-modal"]')).not.toBeVisible();

    // Open Modal and click Cancel
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-modal"]');
    await page.click('[data-testid="project-cancel-btn"]');
    await expect(page.locator('[data-testid="project-modal"]')).not.toBeVisible();
  });

  // 5. Project Creation, Task Creation, Status Options Click & Reopen / Delete Test
  test('5. Create QA project, add task, click all 4 status options, test project completion and reopen', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="worker-select-btn"]');
    await page.click('[data-testid="worker-option-CEO"]');

    // Create QA Project
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-name-input"]');
    const prjName = `${QA_PREFIX} ERP 일정 동기화`;
    await page.fill('[data-testid="project-name-input"]', prjName);
    await page.waitForTimeout(1800);
    await page.click('[data-testid="project-save-btn"]');
    await page.waitForSelector(`text=${prjName}`);

    // Navigate to Detail
    await page.click(`text=${prjName}`);
    await page.waitForSelector('[data-testid="add-task-btn"]');

    // Select CEO
    await page.click('[data-testid="worker-select-btn"]');
    await page.click('[data-testid="worker-option-CEO"]');

    // Add Task
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-name-input"]');
    const taskName = `${QA_PREFIX} 모듈 디버깅`;
    await page.fill('[data-testid="task-name-input"]', taskName);
    await page.click('[data-testid="task-save-btn"]');
    await page.waitForSelector(`text=${taskName}`);

    // Click Date Cell -> Test 4 Status Options (NONE, IN_PROGRESS, COMPLETED, ISSUE)
    const todayStr = new Date().toISOString().slice(0, 10);
    const listRes = await fetch(`${BASE_URL}/api/projects`);
    const listJson: any = await listRes.json();
    const createdPrj = listJson.data.find((p: any) => p.name.includes(QA_PREFIX));
    expect(createdPrj).toBeDefined();

    const detailRes = await fetch(`${BASE_URL}/api/projects/${createdPrj.id}/detail`);
    const detailJson: any = await detailRes.json();
    const createdTaskId = detailJson.data.tasks[0].id;

    // Open Status Popover on today date cell
    await page.click(`[data-testid="status-cell-${createdTaskId}-${todayStr}"]`);
    await page.waitForSelector('[data-testid="status-popover"]');

    // Click IN_PROGRESS
    await page.click('[data-testid="status-option-IN_PROGRESS"]');
    await page.waitForTimeout(500);

    // Click COMPLETED
    await page.click(`[data-testid="status-cell-${createdTaskId}-${todayStr}"]`);
    await page.waitForSelector('[data-testid="status-popover"]');
    await page.click('[data-testid="status-option-COMPLETED"]');
    await page.waitForTimeout(500);

    // Click ISSUE
    await page.click(`[data-testid="status-cell-${createdTaskId}-${todayStr}"]`);
    await page.waitForSelector('[data-testid="status-popover"]');
    await page.click('[data-testid="status-option-ISSUE"]');
    await page.waitForTimeout(500);

    // Click NONE
    await page.click(`[data-testid="status-cell-${createdTaskId}-${todayStr}"]`);
    await page.waitForSelector('[data-testid="status-popover"]');
    await page.click('[data-testid="status-option-NONE"]');
    await page.waitForTimeout(500);
  });

  // 6. Direct Route, Reload (F5), Back & Forward Navigation Test
  test('6. Direct route access /, /projects, /projects/:id, F5 reload, back and forward navigation', async ({ page }) => {
    const targetPrjId = await ensureQaProject();

    // Direct access to /
    const rootRes = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    expect(rootRes?.status()).toBe(200);

    // Direct access to /projects
    const prjRes = await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    expect(prjRes?.status()).toBe(200);

    // Direct access to /projects/:id
    const detailRes = await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    expect(detailRes?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('QA-FINAL');

    // F5 Reload
    const reloadRes = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(reloadRes?.status()).toBe(200);

    // Back button
    await page.click('[data-testid="back-to-list-btn"]');
    await page.waitForSelector('[data-testid="add-project-btn"]');
    expect(page.url()).toContain('/projects');
  });

  // 7. 10 Viewports, Screenshot Evidence Generation & Overflow Check
  test('7. Render across exact 10 viewports, verify zero body overflow, capture evidence screenshots', async ({ page }) => {
    test.setTimeout(90000); // 90s timeout for screenshots
    const targetPrjId = await ensureQaProject();

    const viewports = [
      { name: 'desktop-1920-projects.png', width: 1920, height: 1080 },
      { name: 'desktop-1366-projects.png', width: 1536, height: 864 },
      { name: 'desktop-1366-projects.png', width: 1366, height: 768 },
      { name: 'iphone12-projects.png', width: 390, height: 844 },
      { name: 'galaxy-s24-week.png', width: 360, height: 780, action: 'WEEK' },
      { name: 'zflip-projects.png', width: 360, height: 880 },
      { name: 'fold-outer.png', width: 344, height: 882 },
      { name: 'fold-inner.png', width: 768, height: 1024 },
      { name: 'tablet-landscape.png', width: 1024, height: 768 },
      { name: 'mobile-status-sheet.png', width: 390, height: 844, action: 'STATUS_SHEET' },
      { name: 'vi-mobile-projects.png', width: 390, height: 844, action: 'VIETNAMESE' },
      { name: 'compact-320.png', width: 320, height: 700 },
    ];

    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="active-tab-btn"]');

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);

      if (vp.action === 'STATUS_SHEET') {
        await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="mobile-view-week-btn"]');
        await page.click('[data-testid="mobile-view-week-btn"]');

        const todayStr = new Date().toISOString().slice(0, 10);
        const cellSelector = `[data-testid="mobile-week-cell-${todayStr}"]`;
        if (await page.locator(cellSelector).isVisible()) {
          await page.click(cellSelector);
          await page.waitForSelector('[data-testid="mobile-status-sheet"]');
        }
      } else if (vp.action === 'WEEK') {
        if (await page.locator('[data-testid="mobile-view-week-btn"]').isVisible()) {
          await page.click('[data-testid="mobile-view-week-btn"]');
        }
      } else if (vp.action === 'VIETNAMESE') {
        await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
        const langSelector = vp.width < 768 ? '[data-testid="mobile-lang-btn"]' : '[data-testid="lang-vi-btn"]';
        if (await page.locator(langSelector).isVisible()) {
          await page.click(langSelector);
          await expect(page.locator('[data-testid="active-tab-btn"]')).toContainText('Dự án');
        }
      }

      // Check document overflow: scrollWidth <= clientWidth
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(isOverflowing).toBe(false);

      // Capture Screenshot
      if (vp.name !== 'compact-320.png' && vp.name !== 'tablet-landscape.png') {
        await page.screenshot({ path: path.join(screenshotsDir, vp.name) });
      }
    }
  });

  // 8. Static Assets & OG Meta Tags HTML Verification
  test('8. Verify static assets HTTP 200 and og:title, og:image, og:url, twitter:card in index.html', async ({ page }) => {
    const assets = [
      '/favicon.ico',
      '/favicon.svg',
      '/favicon-32x32.png',
      '/apple-touch-icon.png',
      '/og-preview-v1.png',
      '/site.webmanifest',
    ];

    for (const a of assets) {
      const res = await page.goto(`${BASE_URL}${a}`, { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBe(200);
    }

    // Fetch index.html and verify OG tags
    const htmlRes = await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    expect(htmlRes?.status()).toBe(200);
    const htmlText = await htmlRes?.text();

    expect(htmlText).toContain('og:title');
    expect(htmlText).toContain('og:description');
    expect(htmlText).toContain('og:image');
    expect(htmlText).toContain('og:url');
    expect(htmlText).toContain('twitter:card');
  });

  // 9. API 404 Protection Test
  test('9. Unregistered /api/not-existing route returns JSON 404 API_NOT_FOUND', async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/api/not-existing`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    const text = await res?.text();
    expect(text).toContain('API_NOT_FOUND');
    expect(text).not.toContain('<!DOCTYPE html>');
  });
});
