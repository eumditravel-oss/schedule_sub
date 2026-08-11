// tests/e2e/gantt-inline-content.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function dismissBlockingModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const backdrop = page.locator('.fixed.inset-0.z-50').first();
    if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
      const confirmBtn = page.locator('button:has-text("유지"), button:has-text("확인"), button:has-text("X"), button:has-text("닫기"), button:has-text("Đóng")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click().catch(() => {});
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }
}

import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'gantt-inline-content');
let createdProjectId = '';
let createdTaskId = '';
let expectedCommitSha = '';

test.describe('Strict Gantt Inline Content & Build SHA E2E Suite', () => {
  test.beforeAll(async () => {
    try {
      expectedCommitSha = execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      expectedCommitSha = 'unknown';
    }

    const runId = Date.now();
    // 1. Create QA Project (25-day span to ensure >= 260px bar width)
    const prjRes = await fetch(`${TEST_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[QA-INLINE-E2E-${runId}] 간트 내부 정보 검증 프로젝트`,
        start_date: '2026-08-05',
        end_date: '2026-08-25',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });

    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    expect(prjJson.id || prjJson.data?.id).toBeTruthy();
    createdProjectId = prjJson.id || prjJson.data?.id;

    // 2. Create QA Task inside the Project
    const taskRes = await fetch(`${TEST_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: `[QA-INLINE-E2E-${runId}] 상세 작업 막대 검증`,
        start_date: '2026-08-05',
        end_date: '2026-08-20',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
        confirm_worker_schedule_conflict: true,
      }),
    });

    expect(taskRes.status).toBe(201);
    const taskJson: any = await taskRes.json();
    createdTaskId = taskJson.id || taskJson.data?.id;
  });

  test.afterAll(async () => {
    // ID-based specific cleanup
    if (createdTaskId) {
      const delTaskRes = await fetch(`${TEST_BASE_URL}/api/tasks/${createdTaskId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
      expect(delTaskRes.status).toBe(200);
    }

    if (createdProjectId) {
      const delPrjRes = await fetch(`${TEST_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
      expect(delPrjRes.status).toBe(200);

      // Verify ID absence (404)
      const checkPrjRes = await fetch(`${TEST_BASE_URL}/api/projects/${createdProjectId}`);
      expect(checkPrjRes.status).toBe(404);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/calendar/pending-schedule-decisions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('1. Verify Complete Tooltip Removal and Zero Title Attributes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const projectRow = page.locator(`[data-testid="project-row-${createdProjectId}"]`);
    await expect(projectRow).toBeVisible({ timeout: 15000 });
    const scheduleBar = projectRow.locator('[data-testid="gantt-schedule-bar"]');
    await expect(scheduleBar).toBeVisible();
    await scheduleBar.hover();
    await page.waitForTimeout(300);

    const tooltipCount = await page.locator('[data-testid="gantt-bar-tooltip"]').count();
    expect(tooltipCount).toBe(0);

    const titleAttrCount = await projectRow.locator('[data-testid="gantt-schedule-bar"][title]').count();
    expect(titleAttrCount).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-no-tooltip.png') });
  });

  test('2. Mandatory Verification of Desktop Zero Inline Title', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const projectRow = page.locator(`[data-testid="project-row-${createdProjectId}"]`);
    await expect(projectRow).toBeVisible({ timeout: 15000 });
    const firstBar = projectRow.locator('[data-testid="gantt-schedule-bar"]');
    await expect(firstBar).toBeVisible();
    const inlineTitle = firstBar.locator('[data-testid="gantt-bar-inline-title"]');
    await expect(inlineTitle).toHaveCount(0);

    const track = firstBar.locator('[data-testid="gantt-schedule-track"]');
    const trackBox = await track.boundingBox();
    expect(trackBox!.height).toBeGreaterThanOrEqual(18);
    expect(trackBox!.height).toBeLessThanOrEqual(24);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-info-overview.png') });
  });

  test('3. Mandatory Verification of Project Detail Page Task Bar Zero Inline Content', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${TEST_BASE_URL}/projects/${createdProjectId}`);
    await dismissBlockingModals(page);

    const detailBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(detailBar).toBeVisible({ timeout: 15000 });

    const detailInlineTitle = detailBar.locator('[data-testid="gantt-bar-inline-title"]');
    await expect(detailInlineTitle).toHaveCount(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-info-detail.png') });
  });

  test('4. Mandatory Verification of Mobile 30-Day Calendar Agenda View', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${TEST_BASE_URL}/projects/${createdProjectId}`);
    await dismissBlockingModals(page);

    const mobileGanttBtn = page.locator('[data-testid="mobile-view-gantt-btn"]');
    await expect(mobileGanttBtn).toBeVisible({ timeout: 10000 });
    await mobileGanttBtn.click();
    await page.waitForTimeout(500);

    const mobileView = page.locator('[data-testid="mobile-gantt-view"]');
    await expect(mobileView).toBeVisible({ timeout: 15000 });

    const dateCells = page.locator('[data-testid^="mobile-thirty-date-cell-"]');
    await page.waitForSelector('[data-testid^="mobile-thirty-date-cell-"]', { timeout: 10000 });
    await expect(dateCells).toHaveCount(30);

    // Verify cell click updates selection
    const targetCell = dateCells.nth(5);
    await targetCell.click();

    // Verify 0px page level horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-mobile-calendar-agenda.png') });
  });

  test('5. Verify Strict Git Commit SHA Alignment and BuildVersionIndicator Attributes', async ({ page }) => {
    test.setTimeout(60000);
    const versionRes = await fetch(`${TEST_BASE_URL}/api/version?t=${Date.now()}`);
    expect(versionRes.status).toBe(200);

    const versionJson: any = await versionRes.json();
    const apiCommitSha = versionJson.data?.commit || versionJson.commit;
    expect(apiCommitSha).toBeTruthy();
    expect(typeof apiCommitSha).toBe('string');

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${TEST_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const versionIndicator = page.locator('[data-testid="build-version-indicator"]');
    await expect(versionIndicator).toBeVisible({ timeout: 10000 });
    await expect(versionIndicator).not.toContainText('Build mismatch');

    // Wait for Cloudflare Workers edge propagation with active cache-busting reloads
    const maxAttempts = 10;
    let runtimeShaMatched = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const versionRes = await fetch(`${TEST_BASE_URL}/api/version?t=${Date.now()}`);
      if (versionRes.ok) {
        const vJson: any = await versionRes.json();
        const currentSha = vJson.data?.commit || vJson.commit;
        if (expectedCommitSha !== 'unknown' && typeof currentSha === 'string' && currentSha.startsWith(expectedCommitSha)) {
          runtimeShaMatched = true;
          break;
        }
      }
      if (attempt < maxAttempts) {
        await page.waitForTimeout(1000);
        await page.goto(`${TEST_BASE_URL}/projects?t=${Date.now()}`);
        await dismissBlockingModals(page);
      }
    }

    expect(runtimeShaMatched).toBe(true);

    const frontendSha = await versionIndicator.getAttribute('data-frontend-sha');
    const backendSha = await versionIndicator.getAttribute('data-backend-sha');

    expect(backendSha).toBe(expectedCommitSha);
    expect(frontendSha).toBe(expectedCommitSha);
  });
});
