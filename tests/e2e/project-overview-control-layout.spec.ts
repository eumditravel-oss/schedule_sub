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
    test(`Verify Desktop Vertical Layout & Precision Centering at ${vp.width}x${vp.height}`, async ({ page }) => {
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

      // 1. Verify Elements Exist
      const legendRow = page.getByTestId('overview-legend-row');
      const statusRow = page.getByTestId('overview-project-status-row');
      const todayCard = page.getByTestId('today-summary-card');
      const ganttControlRow = page.getByTestId('overview-gantt-control-row');
      const ganttViewControls = page.getByTestId('overview-gantt-view-controls');
      const ganttNav = page.getByTestId('overview-gantt-navigation');
      const ganttScroll = page.getByTestId('desktop-gantt-scroll');

      await expect(legendRow).toBeVisible();
      await expect(statusRow).toBeVisible();
      await expect(todayCard).toBeVisible();
      await expect(ganttControlRow).toBeVisible();
      await expect(ganttViewControls).toBeVisible();
      await expect(ganttNav).toBeVisible();
      await expect(ganttScroll).toBeVisible();

      // 2. Get Bounding Boxes for Vertical Order Verification
      const legendBox = (await legendRow.boundingBox())!;
      const statusBox = (await statusRow.boundingBox())!;
      const summaryBox = (await todayCard.boundingBox())!;
      const controlBox = (await ganttControlRow.boundingBox())!;
      const ganttBox = (await ganttScroll.boundingBox())!;

      console.log(`[${vp.width}px] Legend bottom: ${(legendBox.y + legendBox.height).toFixed(2)}, Status top: ${statusBox.y.toFixed(2)}`);
      console.log(`[${vp.width}px] Status bottom: ${(statusBox.y + statusBox.height).toFixed(2)}, Summary top: ${summaryBox.y.toFixed(2)}`);
      console.log(`[${vp.width}px] Summary bottom: ${(summaryBox.y + summaryBox.height).toFixed(2)}, Controls top: ${controlBox.y.toFixed(2)}`);
      console.log(`[${vp.width}px] Controls bottom: ${(controlBox.y + controlBox.height).toFixed(2)}, Gantt top: ${ganttBox.y.toFixed(2)}`);

      // DOM 순서 엄격 검증: Legend → Status → Summary → Controls → Gantt
      // legend.bottom <= status.top + 0.5
      expect(
        legendBox.y + legendBox.height,
        `[${vp.width}px] Legend bottom must be <= Status top + 0.5`
      ).toBeLessThanOrEqual(statusBox.y + 0.5);

      // status.bottom <= summary.top + 0.5
      expect(
        statusBox.y + statusBox.height,
        `[${vp.width}px] Status bottom must be <= Summary top + 0.5`
      ).toBeLessThanOrEqual(summaryBox.y + 0.5);

      // summary.bottom < controls.top
      expect(
        summaryBox.y + summaryBox.height,
        `[${vp.width}px] Summary bottom must be < Controls top`
      ).toBeLessThan(controlBox.y + 4);

      // controls.bottom <= gantt.top
      expect(
        controlBox.y + controlBox.height,
        `[${vp.width}px] Controls bottom must be <= Gantt top`
      ).toBeLessThanOrEqual(ganttBox.y + 1);

      // 3. Verify Exact Center Alignment of View Controls (±8px tolerance)
      const controlsBox = (await ganttViewControls.boundingBox())!;
      const viewportCenter = vp.width / 2;
      const controlsCenter = controlsBox.x + controlsBox.width / 2;
      const centerOffset = Math.abs(controlsCenter - viewportCenter);

      console.log(`Viewport ${vp.width}px - Center Offset: ${centerOffset.toFixed(2)}px`);
      expect(centerOffset).toBeLessThanOrEqual(8);

      // 4. Verify Right Alignment of Navigation (±8px tolerance)
      const navBox = (await ganttNav.boundingBox())!;
      const navRight = navBox.x + navBox.width;
      const controlRowRight = controlBox.x + controlBox.width;
      const rightOffset = Math.abs(controlRowRight - navRight);

      console.log(`Viewport ${vp.width}px - Navigation Right Offset: ${rightOffset.toFixed(2)}px`);
      expect(rightOffset).toBeLessThanOrEqual(8);

      // 5. Capture Screenshot for QA Audit
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

    const statusRow = page.getByTestId('overview-project-status-row');
    const activeBtn = page.getByTestId('active-tab-btn');
    const completedBtn = page.getByTestId('completed-tab-btn');

    // Default: Active Tab
    await expect(activeBtn).toBeVisible();
    await expect(completedBtn).toBeVisible();

    // Click Completed Projects Tab
    await completedBtn.click();
    await page.waitForTimeout(300);

    // Verify Year Selector is visible immediately inside statusRow (left side)
    const yearSelect = statusRow.locator('select');
    await expect(yearSelect).toBeVisible();

    const yearSelectBox = (await yearSelect.boundingBox())!;
    const completedBtnBox = (await completedBtn.boundingBox())!;

    // Year select must be placed immediately right of Completed Projects button
    expect(yearSelectBox.x).toBeGreaterThan(completedBtnBox.x);
    expect(yearSelectBox.x).toBeLessThan(completedBtnBox.x + completedBtnBox.width + 40);
  });
});
