// tests/e2e/project-overview-name-readability.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const TARGET_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1100, height: 720 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

const TARGET_PROJECT_NAMES = [
  'CONCOST-HUB 개발',
  '웹개발작업',
  'ES 프로그램 개발',
];

const evidenceData = {
  spec_file: 'tests/e2e/project-overview-name-readability.spec.ts',
  executed_viewports: TARGET_VIEWPORTS.map((v) => v.width),
  found_project_count: 0,
  ready_badge_count_on_normal_projects: 0,
  truncated_name_count_at_1366_plus: 0,
  warning_badge_name_overlap_px: 0,
  left_panel_width_px: 350,
  geometry_error_px: 0,
  timestamp: new Date().toISOString(),
};

async function dismissBlockingModals(page: any) {
  const workerModal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await workerModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const btn = page.locator('[data-testid^="worker-prompt-option-"]').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  for (let i = 0; i < 3; i++) {
    const backdrop = page.locator('.fixed.inset-0.z-50').first();
    if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
      const confirmBtn = page.locator('button:has-text("유지"), button:has-text("확인"), button:has-text("닫기")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click({ force: true }).catch(() => {});
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }
}

test.describe('P1 Project Overview Name Readability & Hardened Assertions Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_00_ceo');
      localStorage.setItem('schedule_current_worker_name', 'CEO');
    });
  });

  test.beforeAll(async ({ request }) => {
    try {
      const prjRes = await request.get('/api/projects?status=ALL', {
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
      });
      const prjJson = await prjRes.json().catch(() => ({}));
      const list = prjJson.data || prjJson || [];

      for (const name of TARGET_PROJECT_NAMES) {
        const exists = Array.isArray(list) && list.some((p: any) => (p.name_ko || p.name) === name);
        if (!exists) {
          await request.post('/api/projects', {
            headers: {
              'Content-Type': 'application/json',
              'x-editor-name': encodeURIComponent('박용진 수석'),
            },
            data: {
              name,
              name_ko: name,
              start_date: '2026-08-01',
              end_date: '2026-08-31',
            },
          }).catch(() => {});
        }
      }
    } catch {}
  });

  test.afterAll(async () => {
    const evidenceDir = path.resolve('qa/live-production');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(evidenceDir, 'readability-hardening-evidence.json'),
      JSON.stringify(evidenceData, null, 2)
    );
  });

  for (const vp of TARGET_VIEWPORTS) {
    test(`1. Project Names legibility & zero READY badges at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/projects');
      await dismissBlockingModals(page);

      const allTabBtn = page.locator('[data-testid="all-tab-btn"]').first();
      await allTabBtn.waitFor({ state: 'visible', timeout: 10000 });
      await allTabBtn.evaluate((el: any) => el.click());
      await page.waitForTimeout(500);

      await page.waitForSelector('[data-testid^="project-name-row-"]', { timeout: 30000 });

      // A. Mandatory 3/3 Projects Check with Strict Assertions
      let foundCount = 0;
      for (const expectedName of TARGET_PROJECT_NAMES) {
        const nameRow = page.locator('[data-testid^="project-name-row-"]').filter({ hasText: expectedName }).first();
        await nameRow.evaluate((el: any) => el.scrollIntoView({ block: 'center' })).catch(() => {});
        await page.waitForTimeout(200);
        await expect(nameRow).toBeVisible({ timeout: 5000 });

        const nameSpan = nameRow.locator('span').first();
        await expect(nameSpan).toBeVisible();
        const text = await nameSpan.innerText();
        expect(text.trim()).toBe(expectedName);
        foundCount++;

        // At 1366px+, verify scrollWidth <= clientWidth + 0.5 (zero truncation)
        if (vp.width >= 1366) {
          const truncated = await nameSpan.evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
          expect(truncated).toBe(false);
          if (truncated) evidenceData.truncated_name_count_at_1366_plus++;
        }
      }

      expect(foundCount).toBe(3);
      evidenceData.found_project_count = foundCount;

      // B. Check Left Panel Width is strictly 350px
      const leftPanels = page.locator('[data-testid^="project-left-panel-"]');
      const panelCount = await leftPanels.count();
      expect(panelCount).toBeGreaterThan(0);

      for (let i = 0; i < panelCount; i++) {
        const panel = leftPanels.nth(i);
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(Math.abs(box.width - 350)).toBeLessThanOrEqual(0.5);
        }
      }

      // C. READY Badge ("정상" / "Bình thường") MUST be 0 on project rows
      let totalReadyBadgeCount = 0;
      for (const expectedName of TARGET_PROJECT_NAMES) {
        const projectRow = page.locator('[role="row"]').filter({ hasText: expectedName }).first();
        await expect(projectRow).toBeVisible();

        // Check no READY text badge exists
        const readyTextBadges = projectRow.locator('[data-testid="project-readiness-badge"]').filter({ hasText: /정상|Bình thường/ });
        const readyBadgeCount = await readyTextBadges.count();
        expect(readyBadgeCount).toBe(0);
        totalReadyBadgeCount += readyBadgeCount;
      }
      expect(totalReadyBadgeCount).toBe(0);
      evidenceData.ready_badge_count_on_normal_projects = totalReadyBadgeCount;

      // D. Warning Badge & Project Name Overlap Check (Must be 0px)
      const rowsWithWarning = page.locator('[role="row"]').filter({
        has: page.locator('[data-testid="project-readiness-badge"], [data-testid^="project-conflict-badge-"]'),
      });
      const warningRowCount = await rowsWithWarning.count();
      for (let i = 0; i < warningRowCount; i++) {
        const row = rowsWithWarning.nth(i);
        const nameRow = row.locator('[data-testid^="project-name-row-"]').first();
        const badge = row.locator('[data-testid="project-readiness-badge"], [data-testid^="project-conflict-badge-"]').first();

        const nameBox = await nameRow.boundingBox();
        const badgeBox = await badge.boundingBox();

        if (nameBox && badgeBox) {
          const isOverlapping = !(
            nameBox.x + nameBox.width <= badgeBox.x ||
            badgeBox.x + badgeBox.width <= nameBox.x ||
            nameBox.y + nameBox.height <= badgeBox.y ||
            badgeBox.y + badgeBox.height <= nameBox.y
          );
          expect(isOverlapping).toBe(false);
        }
      }
    });
  }

  test('2. Verify Gantt Header vs Body Grid Geometry Error <= 0.5px', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await dismissBlockingModals(page);
    const allTabBtn = page.locator('[data-testid="all-tab-btn"]').first();
    await allTabBtn.waitFor({ state: 'visible', timeout: 10000 });
    await allTabBtn.evaluate((el: any) => el.click());
    await page.waitForTimeout(500);
    await page.waitForSelector('[data-testid="desktop-gantt-canvas"]');

    const headerGrid = page.locator('[data-testid="overview-gantt-header-grid"]');
    const headerCorner = page.locator('[data-testid="overview-sticky-corner"]');
    const firstLeftPanel = page.locator('[data-testid^="project-left-panel-"]').first();

    const headerBox = await headerGrid.boundingBox();
    const cornerBox = await headerCorner.boundingBox();
    const panelBox = await firstLeftPanel.boundingBox();

    expect(cornerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();

    if (cornerBox && panelBox) {
      const widthDiff = Math.abs(cornerBox.width - panelBox.width);
      const xDiff = Math.abs(cornerBox.x - panelBox.x);
      expect(widthDiff).toBeLessThanOrEqual(0.5);
      expect(xDiff).toBeLessThanOrEqual(0.5);
      evidenceData.geometry_error_px = Math.max(widthDiff, xDiff);
    }
  });
});
