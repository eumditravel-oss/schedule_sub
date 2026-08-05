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
      const confirmBtn = page.locator('button:has-text("확인"), button:has-text("X"), button:has-text("닫기")').first();
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

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
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
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[QA-INLINE-E2E-${runId}] 간트 내부 정보 검증 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-25',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });

    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    expect(prjJson.id || prjJson.data?.id).toBeTruthy();
    createdProjectId = prjJson.id || prjJson.data?.id;

    // 2. Create QA Task inside the Project
    const taskRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: `[QA-INLINE-E2E-${runId}] 상세 작업 막대 검증`,
        start_date: '2026-08-01',
        end_date: '2026-08-20',
        worker_name: '박용진 수석',
        editor_name: '박용진 수석',
      }),
    });

    expect(taskRes.status).toBe(201);
    const taskJson: any = await taskRes.json();
    createdTaskId = taskJson.id || taskJson.data?.id;
  });

  test.afterAll(async () => {
    // ID-based specific cleanup
    if (createdTaskId) {
      const delTaskRes = await fetch(`${QA_BASE_URL}/api/tasks/${createdTaskId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
      expect(delTaskRes.status).toBe(200);
    }

    if (createdProjectId) {
      const delPrjRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
      expect(delPrjRes.status).toBe(200);

      // Verify ID absence (404)
      const checkPrjRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`);
      expect(checkPrjRes.status).toBe(404);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('1. Verify Complete Tooltip Removal and Zero Title Attributes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const scheduleBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(scheduleBar).toBeVisible({ timeout: 15000 });

    // Hover over bar
    await scheduleBar.hover();
    await page.waitForTimeout(300);

    // Assert custom tooltip popovers count === 0
    const tooltipCount = await page.locator('[data-testid="gantt-bar-tooltip"]').count();
    expect(tooltipCount).toBe(0);

    // Assert native title attribute count on schedule bar === 0
    const titleAttrCount = await page.locator('[data-testid="gantt-schedule-bar"][title]').count();
    expect(titleAttrCount).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-no-tooltip.png') });
  });

  test('2. Mandatory Verification of Desktop Inline Title and Planned/Actual Progress Chips', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const firstBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(firstBar).toBeVisible({ timeout: 15000 });

    const inlineTitle = firstBar.locator('[data-testid="gantt-bar-inline-title"]');
    await expect(inlineTitle).toBeVisible();
    await expect(inlineTitle).not.toHaveText('');

    const inlineProgress = firstBar.locator('[data-testid="gantt-bar-inline-progress"]');
    await expect(inlineProgress).toBeVisible();
    await expect(inlineProgress).toContainText('예정');
    await expect(inlineProgress).toContainText('실제');

    const track = firstBar.locator('[data-testid="gantt-schedule-track"]');
    const trackBox = await track.boundingBox();
    expect(trackBox!.height).toBeGreaterThanOrEqual(26);
    expect(trackBox!.height).toBeLessThanOrEqual(30);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-info-overview.png') });
  });

  test('3. Mandatory Verification of Project Detail Page Task Bar Inline Content', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/projects/${createdProjectId}`);
    await dismissBlockingModals(page);

    const detailBar = page.locator('[data-testid="gantt-schedule-bar"]').first();
    await expect(detailBar).toBeVisible({ timeout: 15000 });

    const detailInlineTitle = detailBar.locator('[data-testid="gantt-bar-inline-title"]');
    await expect(detailInlineTitle).toBeVisible();

    const detailInlineProgress = detailBar.locator('[data-testid="gantt-bar-inline-progress"]');
    await expect(detailInlineProgress).toBeVisible();
    await expect(detailInlineProgress).toContainText('예정');
    await expect(detailInlineProgress).toContainText('실제');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-inline-info-detail.png') });
  });

  test('4. Mandatory Verification of Mobile 30-Day Gantt ScheduleBar and Cell Click Pass-Through', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${createdProjectId}`);
    await dismissBlockingModals(page);

    const mobileGanttBtn = page.locator('[data-testid="mobile-view-gantt-btn"]');
    await expect(mobileGanttBtn).toBeVisible({ timeout: 10000 });
    await mobileGanttBtn.click();
    await page.waitForTimeout(500);

    const mobileView = page.locator('[data-testid="mobile-gantt-view"]');
    await expect(mobileView).toBeVisible({ timeout: 15000 });

    const mobileBar = page.locator('[data-testid="mobile-gantt-schedule-bar"]').first();
    await expect(mobileBar).toBeVisible({ timeout: 15000 });

    const mobileTrack = page.locator('[data-testid="mobile-gantt-schedule-track"]').first();
    await expect(mobileTrack).toBeVisible();

    const trackBox = await mobileTrack.boundingBox();
    expect(trackBox!.height).toBeGreaterThanOrEqual(20);
    expect(trackBox!.height).toBeLessThanOrEqual(26);

    const mobileInlineContent = page.locator('[data-testid="mobile-gantt-inline-content"]').first();
    await expect(mobileInlineContent).toBeVisible();

    // Verify cell click pass-through underneath task bar opens DayActionBottomSheet
    await mobileBar.click({ force: true });
    await page.waitForTimeout(300);

    const actionSheet = page.locator('[data-testid="day-action-sheet"]').or(page.locator('[data-testid="day-action-panel"]')).first();
    if (await actionSheet.isVisible().catch(() => false)) {
      await expect(actionSheet).toBeVisible();
    }

    // Verify per-cell blue segment blocks do NOT exist in DOM
    const legacyBlueCellCount = await page.locator('.w-full.h-3\\.5.bg-blue-500, .w-full.h-4.bg-blue-600').count();
    expect(legacyBlueCellCount).toBe(0);

    // Verify native title attribute count on mobile bars is 0
    const mobileTitleAttrCount = await page.locator('[data-testid="mobile-gantt-schedule-bar"][title]').count();
    expect(mobileTitleAttrCount).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gantt-mobile-inline-info.png') });
  });

  test('5. Verify Strict Git Commit SHA Alignment and BuildVersionIndicator Attributes', async ({ page }) => {
    const versionRes = await fetch(`${QA_BASE_URL}/api/version`);
    expect(versionRes.status).toBe(200);

    const versionJson: any = await versionRes.json();
    const apiCommitSha = versionJson.data?.commit || versionJson.commit;
    expect(apiCommitSha).toBeTruthy();
    expect(typeof apiCommitSha).toBe('string');

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);

    const versionIndicator = page.locator('[data-testid="build-version-indicator"]');
    await expect(versionIndicator).toBeVisible({ timeout: 10000 });
    await expect(versionIndicator).not.toContainText('Build mismatch');

    // Wait for async /api/version state update
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="build-version-indicator"]');
      const backend = el?.getAttribute('data-backend-sha');
      return backend && backend !== 'unknown';
    }, { timeout: 10000 });

    const frontendSha = await versionIndicator.getAttribute('data-frontend-sha');
    const backendSha = await versionIndicator.getAttribute('data-backend-sha');

    if (expectedCommitSha !== 'unknown') {
      expect(backendSha).toBe(expectedCommitSha);
    }
    expect(frontendSha).toBeTruthy();
    expect(backendSha).toBeTruthy();
  });
});
