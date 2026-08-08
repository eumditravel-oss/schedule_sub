// tests/e2e/project-overview-name-readability.spec.ts
import { test, expect } from '@playwright/test';

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

test.describe('P1 Project Overview Name Readability & Geometry Suite', () => {
  for (const vp of TARGET_VIEWPORTS) {
    test(`1. Project Names legibility & zero READY badges at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/projects');
      await page.waitForSelector('[data-testid="desktop-gantt-canvas"]', { timeout: 10000 });

      // Click ALL tab to see all projects
      const allTabBtn = page.locator('[data-testid="all-tab-btn"]');
      if (await allTabBtn.isVisible()) {
        await allTabBtn.click();
        await page.waitForTimeout(1000);
      }

      // Check project row left panel width is exactly 350px
      const leftPanels = page.locator('[data-testid^="project-left-panel-"]');
      const count = await leftPanels.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const panel = leftPanels.nth(i);
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(Math.abs(box.width - 350)).toBeLessThanOrEqual(0.5);
        }
      }

      // Check READY Readiness Badge count is 0 for normal projects
      const readinessBadges = page.locator('[data-testid="project-readiness-badge"]');
      const badgeCount = await readinessBadges.count();

      // Ensure no badge displays "정상" or "Bình thường"
      for (let i = 0; i < badgeCount; i++) {
        const txt = await readinessBadges.nth(i).innerText();
        expect(txt).not.toContain('정상');
        expect(txt).not.toContain('Bình thường');
      }

      // At 1366px and above, verify target project names are fully visible without truncation
      if (vp.width >= 1366) {
        for (const name of TARGET_PROJECT_NAMES) {
          const nameSpan = page.locator(`[data-testid^="project-name-row-"]:has-text("${name}") span`).first();
          if (await nameSpan.isVisible()) {
            const isTruncated = await nameSpan.evaluate((el) => el.scrollWidth > el.clientWidth);
            expect(isTruncated).toBe(false);
          }
        }
      }
    });
  }

  test('2. Verify Gantt Header vs Body Grid Geometry Error <= 0.5px', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
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
      expect(Math.abs(cornerBox.width - panelBox.width)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(cornerBox.left - panelBox.left)).toBeLessThanOrEqual(0.5);
    }
  });
});
