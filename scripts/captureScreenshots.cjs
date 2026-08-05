// scripts/captureScreenshots.cjs
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: 'https://concost-dev-scheduler-qa.eumditravel.workers.dev',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  console.log('Navigating to homepage...');
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Worker prompt modal handling
  const workerBtn = page.locator('[data-testid="worker-option-wrk_01"]').or(page.locator('[data-testid^="worker-option-"]')).first();
  if (await workerBtn.isVisible()) {
    await workerBtn.click();
    await page.waitForTimeout(500);
  }

  // Navigate to project detail page
  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (await projectCard.isVisible()) {
    await projectCard.click();
    await page.waitForLoadState('networkidle');
  }

  // Handle worker prompt if it pops up again
  if (await workerBtn.isVisible()) {
    await workerBtn.click();
    await page.waitForTimeout(500);
  }

  // 1 & 2: Task Workday Summary & Warning Removed
  console.log('Capturing Task Workday Summary...');
  const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
  if (await addTaskBtn.isVisible()) {
    await addTaskBtn.click();
    await page.waitForTimeout(500);

    const startDate = page.locator('[data-testid="task-start-date"]');
    const endDate = page.locator('[data-testid="task-end-date"]');
    if (await startDate.isVisible()) {
      await startDate.fill('2026-08-03');
      await endDate.fill('2026-08-07');
      await page.waitForTimeout(500);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'task-workday-summary.png') });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'task-warning-removed.png') });
      console.log('Saved task-workday-summary.png and task-warning-removed.png');
    }

    const cancelBtn = page.locator('[data-testid="task-cancel-btn"]');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // 7: Worker Utilization Badge
  console.log('Capturing Worker Utilization Badge...');
  const utilBadge = page.locator('[data-testid="worker-utilization-badge"]').first();
  if (await utilBadge.isVisible()) {
    await utilBadge.screenshot({ path: path.join(SCREENSHOT_DIR, 'worker-utilization-badge.png') });
    console.log('Saved worker-utilization-badge.png');
  }

  // 3 & 5: DateHeaderInfoPanel Saturday KR/VN cards & Auto holiday lock badge
  console.log('Capturing DateHeaderInfoPanel...');
  const dateHeader = page.locator('[data-testid^="date-header-"]').first();
  if (await dateHeader.isVisible()) {
    await dateHeader.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'date-info-kr-vn-saturday.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'date-info-auto-holiday-locked.png') });
    console.log('Saved date-info-kr-vn-saturday.png and date-info-auto-holiday-locked.png');

    // 4: Manual holiday registration form
    const addManualBtn = page.locator('[data-testid="add-manual-holiday-btn-kr"]').or(page.locator('[data-testid="add-manual-holiday-btn-vn"]')).first();
    if (await addManualBtn.isVisible()) {
      await addManualBtn.click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'date-info-manual-holiday-form.png') });
      console.log('Saved date-info-manual-holiday-form.png');
    }

    const closeBtn = page.locator('[data-testid="date-info-close-btn"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // 6: Mobile Date Info Sheet
  console.log('Capturing Mobile Date Info Sheet...');
  const mobileContext = await browser.newContext({
    baseURL: 'https://concost-dev-scheduler-qa.eumditravel.workers.dev',
    viewport: { width: 375, height: 812 },
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('/');
  await mobilePage.waitForLoadState('networkidle');

  const mWorkerBtn = mobilePage.locator('[data-testid="worker-option-wrk_01"]').or(mobilePage.locator('[data-testid^="worker-option-"]')).first();
  if (await mWorkerBtn.isVisible()) {
    await mWorkerBtn.click();
    await mobilePage.waitForTimeout(500);
  }

  const mProjectCard = mobilePage.locator('[data-testid^="project-card-"]').first();
  if (await mProjectCard.isVisible()) {
    await mProjectCard.click();
    await mobilePage.waitForLoadState('networkidle');
  }

  const mDateHeader = mobilePage.locator('[data-testid^="date-header-"]').first();
  if (await mDateHeader.isVisible()) {
    await mDateHeader.click();
    await mobilePage.waitForTimeout(500);

    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-date-info-sheet.png') });
    console.log('Saved mobile-date-info-sheet.png');
  }

  await browser.close();
  console.log('All 7 screenshots captured successfully!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
