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
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

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

      // Assert Vertical Sequence: Legend -> Status Row -> Today Summary -> Gantt Control -> Gantt Table
      expect(legendBox.y).toBeLessThan(statusBox.y);
      expect(statusBox.y).toBeLessThan(summaryBox.y);
      expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(controlBox.y + 16); // Allow small margin
      expect(controlBox.y).toBeLessThan(ganttBox.y);
      expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(ganttBox.y + 8);

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
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

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

    // Year select must be placed immediately right of Completed Projects button (x > completedBtn.x)
    expect(yearSelectBox.x).toBeGreaterThan(completedBtnBox.x);
    expect(yearSelectBox.x).toBeLessThan(completedBtnBox.x + completedBtnBox.width + 40);
  });
});
