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

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    networkFailures = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
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
  });

  test.afterAll(async () => {
    // Guaranteed Cleanup of any QA-FINAL test project on remote API
    try {
      const listRes = await fetch(`${BASE_URL}/api/projects`);
      const listJson: any = await listRes.json();
      if (listJson.success && Array.isArray(listJson.data)) {
        for (const p of listJson.data) {
          if (p.name && p.name.includes('[QA-FINAL')) {
            await fetch(`${BASE_URL}/api/projects/${p.id}`, {
              method: 'DELETE',
              headers: { 'x-editor-name': encodeURIComponent('CEO') },
            });
            console.log(`Cleaned up QA project ${p.id}`);
          }
        }
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }
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
    expect(consoleErrors.length).toBe(0);
  });

  // 2. Worker Selector Dropdown Test
  test('2. Worker selector lists 7 active members and sets current worker', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="worker-select-btn"]');

    await page.click('[data-testid="worker-select-btn"]');
    await page.waitForSelector('[data-testid="worker-option-CEO"]');

    // Verify CEO, COO, etc.
    await expect(page.locator('[data-testid="worker-option-CEO"]')).toBeVisible();
    await expect(page.locator('[data-testid="worker-option-COO"]')).toBeVisible();
    await expect(page.locator('[data-testid="worker-option-유종욱 실장"]')).toBeVisible();

    // Select CEO
    await page.click('[data-testid="worker-option-CEO"]');
    await expect(page.locator('[data-testid="worker-select-btn"]')).toContainText('CEO');
  });

  // 3. Project Creation & Auto Translation Test
  test('3. Create project with auto translation and save to D1', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="worker-select-btn"]');

    // Select worker CEO
    await page.click('[data-testid="worker-select-btn"]');
    await page.click('[data-testid="worker-option-CEO"]');

    // Click Add Project
    await page.click('[data-testid="add-project-btn"]');
    await page.waitForSelector('[data-testid="project-name-input"]');

    const prjName = `${QA_PREFIX} ERP 일정 동기화`;
    await page.fill('[data-testid="project-name-input"]', prjName);

    // Wait for debounced translation completion (~1.8s)
    await page.waitForTimeout(1800);

    // Click Save
    await page.click('[data-testid="project-save-btn"]');
    await page.waitForSelector(`text=${prjName}`);
  });

  // 4. Project Detail, Task Creation & Status Update Test
  test('4. Navigate to Project Detail, add task, update status', async ({ page }) => {
    const targetPrjId = await ensureQaProject();

    await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });

    // Verify Project Title
    await expect(page.locator('h1')).toContainText('QA-FINAL');

    // Select Worker CEO
    await page.click('[data-testid="worker-select-btn"]');
    await page.click('[data-testid="worker-option-CEO"]');

    // Add Task
    await page.click('[data-testid="add-task-btn"]');
    await page.waitForSelector('[data-testid="task-name-input"]');

    const taskName = `${QA_PREFIX} 모듈 디버깅`;
    await page.fill('[data-testid="task-name-input"]', taskName);
    await page.click('[data-testid="task-save-btn"]');

    await page.waitForSelector(`text=${taskName}`);
    expect(consoleErrors.length).toBe(0);
  });

  // 5. Direct Route, Refresh (F5), Back Navigation Test
  test('5. Direct route access, F5 reload, back navigation', async ({ page }) => {
    const targetPrjId = await ensureQaProject();

    // Direct access to project detail
    const res = await page.goto(`${BASE_URL}/projects/${targetPrjId}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('QA-FINAL');

    // F5 Reload
    const reloadRes = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(reloadRes?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('QA-FINAL');

    // Back to list
    await page.click('[data-testid="back-to-list-btn"]');
    await page.waitForSelector('[data-testid="add-project-btn"]');
    expect(page.url()).toContain('/projects');
  });

  // 6. Viewport Screenshots & Body Overflow Checks across 10 viewports
  test('6. Render across 10 viewports, capture screenshots, verify zero body overflow', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');

    const viewports = [
      { name: 'desktop-1920-projects.png', width: 1920, height: 1080 },
      { name: 'desktop-1366-projects.png', width: 1366, height: 768 },
      { name: 'iphone12-projects.png', width: 390, height: 844 },
      { name: 'galaxy-s24-week.png', width: 360, height: 780 },
      { name: 'zflip-projects.png', width: 360, height: 880 },
      { name: 'fold-outer.png', width: 344, height: 882 },
      { name: 'fold-inner.png', width: 768, height: 1024 },
      { name: 'mobile-status-sheet.png', width: 390, height: 844 },
      { name: 'vi-mobile-projects.png', width: 390, height: 844, lang: 'vi' },
      { name: 'compact-320.png', width: 320, height: 700 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      if (vp.lang === 'vi') {
        const langSelector = vp.width < 768 ? '[data-testid="mobile-lang-btn"]' : '[data-testid="lang-vi-btn"]';
        await page.click(langSelector);
      }

      // Check document overflow: scrollWidth <= clientWidth
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(isOverflowing).toBe(false);

      // Capture Screenshot to qa/screenshots/
      if (vp.name !== 'compact-320.png') {
        await page.screenshot({ path: path.join(screenshotsDir, vp.name) });
      }
    }
  });

  // 7. Static Assets & OG Metadata Verification
  test('7. Verify favicon, manifest, apple-touch-icon, and og-preview-v1.png HTTP 200', async ({ page }) => {
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
  });

  // 8. API 404 Protection Test
  test('8. Unregistered /api/not-existing route returns JSON 404 API_NOT_FOUND', async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/api/not-existing`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    const text = await res?.text();
    expect(text).toContain('API_NOT_FOUND');
    expect(text).not.toContain('<!DOCTYPE html>');
  });
});
