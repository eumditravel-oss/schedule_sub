import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('P1 Project Overview Desktop UI Restructuring & Layout Precision Suite', () => {
  const viewports = [
    { width: 1024, height: 768, name: '1024' },
    { width: 1100, height: 720, name: '1100' },
    { width: 1280, height: 720, name: '1280' },
    { width: 1366, height: 768, name: '1366' },
    { width: 1536, height: 864, name: '1536' },
    { width: 1920, height: 1080, name: '1920' },
  ];

  test.beforeAll(() => {
    const dir = path.join(process.cwd(), 'qa', 'layout');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  for (const vp of viewports) {
    test(`Verify Desktop Vertical Layout & Header Status Tabs Placement at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'selected_worker_profile',
          JSON.stringify({ id: 'wrk_03', name: '유종욱', country_code: 'KR', access_role: 'EDITOR' })
        );
      });

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Dismiss worker modal if still visible
      const workerModal = page.locator('[data-testid="worker-prompt-modal"]');
      if (await workerModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.click('button:has-text("유종욱")').catch(() => {});
        await page.waitForTimeout(300);
      }

      // 1. Verify Header & Status Tabs Placement
      const header = page.getByTestId('desktop-app-header');
      const statusTabs = page.getByTestId('overview-project-status-tabs');
      const calendarManagerBtn = page.getByTestId('desktop-manage-calendar-btn');
      const statusRow = page.getByTestId('overview-project-status-row');

      await expect(header).toBeVisible();
      await expect(statusTabs).toBeVisible();
      await expect(calendarManagerBtn).toBeVisible();

      // Zero main status rows in DOM
      expect(await statusRow.count()).toBe(0);

      // Verify Status Tabs is child of Header Actions and to the left of Calendar Manager
      const statusTabsBox = (await statusTabs.boundingBox())!;
      const calendarBtnBox = (await calendarManagerBtn.boundingBox())!;
      expect(
        statusTabsBox.x + statusTabsBox.width,
        `[${vp.width}px] Status tabs right must be <= Calendar Manager left`
      ).toBeLessThanOrEqual(calendarBtnBox.x + 1);

      // 2. Verify Remaining Layout Elements
      const legendRow = page.getByTestId('overview-legend-row');
      const todayCard = page.getByTestId('today-summary-card');
      const ganttControlRow = page.getByTestId('overview-gantt-control-row');
      const ganttViewControls = page.getByTestId('overview-gantt-view-controls');
      const ganttNav = page.getByTestId('overview-gantt-navigation');
      const ganttScroll = page.getByTestId('desktop-gantt-scroll');

      await expect(legendRow).toBeVisible();
      await expect(todayCard).toBeVisible();
      await expect(ganttControlRow).toBeVisible();
      await expect(ganttViewControls).toBeVisible();
      await expect(ganttNav).toBeVisible();
      await expect(ganttScroll).toBeVisible();

      // 3. Vertical Order Verification: Header -> Legend -> Today Summary -> Gantt Control -> Gantt Table
      const headerBox = (await header.boundingBox())!;
      const legendBox = (await legendRow.boundingBox())!;
      const summaryBox = (await todayCard.boundingBox())!;
      const controlBox = (await ganttControlRow.boundingBox())!;
      const ganttBox = (await ganttScroll.boundingBox())!;

      console.log(`[${vp.width}px] Header bottom: ${(headerBox.y + headerBox.height).toFixed(2)}, Legend top: ${legendBox.y.toFixed(2)}`);
      console.log(`[${vp.width}px] Legend bottom: ${(legendBox.y + legendBox.height).toFixed(2)}, Summary top: ${summaryBox.y.toFixed(2)}`);

      expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(legendBox.y + 0.5);
      expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(summaryBox.y + 0.5);
      expect(summaryBox.y + summaryBox.height).toBeLessThan(controlBox.y + 4);
      expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(ganttBox.y + 1);

      // 4. Center Alignment of View Controls (±8px tolerance)
      const controlsBox = (await ganttViewControls.boundingBox())!;
      const viewportCenter = vp.width / 2;
      const controlsCenter = controlsBox.x + controlsBox.width / 2;
      const centerOffset = Math.abs(controlsCenter - viewportCenter);

      expect(centerOffset).toBeLessThanOrEqual(8);

      // 5. Right Alignment of Navigation (±8px tolerance)
      const navBox = (await ganttNav.boundingBox())!;
      const navRight = navBox.x + navBox.width;
      const controlRowRight = controlBox.x + controlBox.width;
      const rightOffset = Math.abs(controlRowRight - navRight);

      expect(rightOffset).toBeLessThanOrEqual(8);

      // 6. Capture Screenshot for QA Audit
      if (['1024', '1366', '1536', '1920'].includes(vp.name)) {
        await page.screenshot({
          path: path.join(process.cwd(), 'qa', 'layout', `overview-${vp.name}.png`),
          fullPage: false,
        });
      }
    });
  }

  test('Verify Project Status Tab Switching and Completed Year Selector Placement', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'selected_worker_profile',
        JSON.stringify({ id: 'wrk_03', name: '유종욱', country_code: 'KR', access_role: 'EDITOR' })
      );
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dismiss worker modal if visible
    const workerModal = page.locator('[data-testid="worker-prompt-modal"]');
    if (await workerModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.click('button:has-text("유종욱")').catch(() => {});
      await page.waitForTimeout(300);
    }

    const activeBtn = page.getByTestId('active-tab-btn');
    const completedBtn = page.getByTestId('completed-tab-btn');

    await expect(activeBtn).toBeVisible();
    await expect(completedBtn).toBeVisible();

    // Click Completed tab
    await completedBtn.click();
    await page.waitForTimeout(300);

    const yearSelect = page.locator('[data-testid="overview-project-status-tabs"] select');
    await expect(yearSelect).toBeVisible();

    // Switch back to Active tab
    await activeBtn.click();
    await page.waitForTimeout(300);
    await expect(yearSelect).toHaveCount(0);
  });
});
