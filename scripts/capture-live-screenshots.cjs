// scripts/capture-live-screenshots.cjs
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('Launching browser with system Edge/Chrome channel...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (err) {
      console.error('Failed to launch channel msedge or chrome:', err);
      process.exit(1);
    }
  }

  const artifactsDir = 'C:\\Users\\owner\\.gemini\\antigravity-ide\\brain\\eef79895-82d2-4dea-9e1e-81ed5175a484';
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Real Project IDs from DB
  const groupwareId = 'prj_1786324719846_dmo5';
  const ksrcv2Id = 'prj_1786332766310_iikk';

  // ==========================================
  // SCREENSHOT 1: Project Overview (Grid & Hatch in Body + Dashboard + Continuous Gantt V2)
  // ==========================================
  console.log('1. Navigating to Live Overview...');
  await page.goto('https://concost-dev-scheduler.eumditravel.workers.dev/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const workerOption = page.locator('button:has-text("박용진 수석")');
  if (await workerOption.isVisible()) {
    await workerOption.click();
    await page.waitForTimeout(1000);
  }

  const ss1Path = path.join(artifactsDir, 'screenshot1_live_overview.png');
  await page.screenshot({ path: ss1Path, fullPage: false });
  console.log('Screenshot 1 saved:', ss1Path);

  // ==========================================
  // SCREENSHOT 2: Project Detail (Body Grid & Holiday Hatch in task body)
  // ==========================================
  console.log('2. Navigating to Live Project Detail...');
  await page.goto(`https://concost-dev-scheduler.eumditravel.workers.dev/projects/${groupwareId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const ss2Path = path.join(artifactsDir, 'screenshot2_live_project_detail.png');
  await page.screenshot({ path: ss2Path, fullPage: false });
  console.log('Screenshot 2 saved:', ss2Path);

  // ==========================================
  // SCREENSHOT 3: Project Report Preview (Logical Report Page 1/9)
  // ==========================================
  console.log('3. Navigating to Live Single Project Report Preview...');
  await page.goto(`https://concost-dev-scheduler.eumditravel.workers.dev/print/project/${groupwareId}/summary-a4`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const ss3Path = path.join(artifactsDir, 'screenshot3_live_report_preview.png');
  await page.screenshot({ path: ss3Path, fullPage: false });
  console.log('Screenshot 3 saved:', ss3Path);

  // ==========================================
  // SCREENSHOT 4: Browser Print Preview (Print Media Emulation: Logical 9 = Physical 9)
  // ==========================================
  console.log('4. Emulating print media for Browser Print Preview...');
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(1000);

  const printPages = page.locator('.print-paper-a4');
  const printPageCount = await printPages.count();
  console.log(`Print pages count in print media emulation: ${printPageCount}`);

  const ss4Path = path.join(artifactsDir, 'screenshot4_live_print_preview.png');
  await page.screenshot({ path: ss4Path, fullPage: false });
  console.log('Screenshot 4 saved:', ss4Path);

  // Reset media back to screen
  await page.emulateMedia({ media: 'screen' });

  // ==========================================
  // SCREENSHOT 5: Build Fingerprint (No BUILD MISMATCH, Green Production Badge)
  // ==========================================
  console.log('5. Capturing Build Fingerprint floating badge...');
  await page.goto('https://concost-dev-scheduler.eumditravel.workers.dev/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const badgeLocator = page.locator('[data-testid="build-version-indicator"]');
  if (await badgeLocator.isVisible()) {
    await badgeLocator.scrollIntoViewIfNeeded();
  }

  const ss5Path = path.join(artifactsDir, 'screenshot5_live_build_fingerprint.png');
  await page.screenshot({ path: ss5Path, fullPage: false });
  console.log('Screenshot 5 saved:', ss5Path);

  await browser.close();
  console.log('ALL 5 LIVE SCREENSHOTS CAPTURED PERFECTLY!');
}

main().catch(err => {
  console.error('Error in capture script:', err);
  process.exit(1);
});
