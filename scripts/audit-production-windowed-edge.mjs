import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

const PROD_BASE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev';
const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

const WINDOW_SIZES = [
  { width: 1313, height: 856 },
  { width: 1280, height: 800 },
  { width: 1100, height: 720 },
  { width: 1024, height: 768 },
];

const SCROLL_RATIOS = [0, 0.25, 0.5, 0.75, 1.0];

async function setupWorkerInitScript(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
}

async function dismissWorkerPromptModal(page) {
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function ensureMonthView(page) {
  const monthBtn = page.locator('[data-testid="view-month-btn"]');
  await monthBtn.waitFor({ state: 'visible', timeout: 15000 });
  const cls = (await monthBtn.getAttribute('class')) || '';
  const ariaPressed = await monthBtn.getAttribute('aria-pressed');
  const dataState = await monthBtn.getAttribute('data-state');
  const isAlreadyActive = ariaPressed === 'true' || dataState === 'active' || cls.includes('bg-white');
  if (!isAlreadyActive) {
    await monthBtn.click();
    await page.waitForTimeout(300);
  }
}

async function navigateToTargetMonth(page, targetYearMonthStr) {
  const prevBtn = page.locator('[data-testid="nav-prev-btn"]');
  const nextBtn = page.locator('[data-testid="nav-next-btn"]');
  const rangeToolbar = page.locator('section[data-testid="desktop-schedule-toolbar"]');

  await rangeToolbar.waitFor({ state: 'visible', timeout: 15000 });

  for (let i = 0; i < 15; i++) {
    const text = await rangeToolbar.textContent();
    if (text?.includes(targetYearMonthStr)) {
      break;
    }
    const match = text?.match(/(\d{4})년\s*(\d{1,2})월/);
    if (match) {
      const curY = parseInt(match[1], 10);
      const curM = parseInt(match[2], 10);
      const [tY, tM] = targetYearMonthStr.split('-').map((n) => parseInt(n, 10));

      const curVal = curY * 12 + curM;
      const targetVal = tY * 12 + tM;

      if (curVal > targetVal) {
        await prevBtn.click();
        await page.waitForTimeout(300);
      } else if (curVal < targetVal) {
        await nextBtn.click();
        await page.waitForTimeout(300);
      } else {
        break;
      }
    } else {
      await prevBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function expandAllTaskGroups(page) {
  const desktopScroll = page.locator('[data-testid="desktop-gantt-scroll"]');
  const toggleBtns = desktopScroll.locator('[data-testid^="task-group-toggle-"]');
  const count = await toggleBtns.count();
  for (let i = 0; i < count; i++) {
    const btn = toggleBtns.nth(i);
    const html = await btn.innerHTML();
    if (html.includes('chevron-right') || html.includes('d="m9 18 6-6-6-6"')) {
      await btn.click();
      await page.waitForTimeout(100);
    }
  }
}

function parsePngPixel(png, x, y) {
  const idx = (Math.floor(y) * png.width + Math.floor(x)) * 4;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3],
  };
}

function comparePngRegions(png1, png2, clipRect) {
  let diffPixels = 0;
  let totalPixels = 0;

  const startX = Math.max(0, Math.floor(clipRect.x));
  const startY = Math.max(0, Math.floor(clipRect.y));
  const endX = Math.min(png1.width, Math.floor(clipRect.x + clipRect.width));
  const endY = Math.min(png1.height, Math.floor(clipRect.y + clipRect.height));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      totalPixels++;
      const idx = (y * png1.width + x) * 4;
      const rDiff = Math.abs(png1.data[idx] - png2.data[idx]);
      const gDiff = Math.abs(png1.data[idx + 1] - png2.data[idx + 1]);
      const bDiff = Math.abs(png1.data[idx + 2] - png2.data[idx + 2]);

      if (rDiff > 15 || gDiff > 15 || bDiff > 15) {
        diffPixels++;
      }
    }
  }

  const diffRatio = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
  return { diffPixels, totalPixels, diffRatio };
}

async function runAudit() {
  const outDir = path.join(process.cwd(), 'qa', 'live-production');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('=== PHASE 1: LAUNCHING BROWSER FOR LIVE PRODUCTION AUDIT ===');
  let channelName = 'msedge';
  let browser;

  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--window-size=1313,856'],
    });
    console.log('Successfully launched Microsoft Edge (msedge)!');
  } catch (err) {
    console.log('Edge channel not found, falling back to Google Chrome (chrome)...');
    try {
      channelName = 'chrome';
      browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--window-size=1313,856'],
      });
      console.log('Successfully launched Google Chrome (chrome)!');
    } catch (err2) {
      console.log('Chrome channel not found, falling back to default Playwright Chromium...');
      channelName = 'chromium';
      browser = await chromium.launch({
        headless: true,
        args: ['--window-size=1313,856'],
      });
    }
  }

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  // 1. Setup Worker init script & Verify Build Indicator SHA on Live Production
  console.log('\n--- VERIFYING LIVE PRODUCTION BUILD INDICATOR SHA ---');
  await setupWorkerInitScript(page);
  await page.setViewportSize({ width: 1313, height: 856 });
  await page.goto(`${PROD_BASE_URL}/projects`, { waitUntil: 'networkidle' });
  await dismissWorkerPromptModal(page);

  const indicator = page.locator('[data-testid="build-version-indicator"]').first();
  await indicator.waitFor({ state: 'visible', timeout: 15000 });
  const liveBuildShaText = (await indicator.innerText()).trim();
  const liveBackendShaAttr = (await indicator.getAttribute('data-backend-sha')) || '';
  const liveFrontendShaAttr = (await indicator.getAttribute('data-frontend-sha')) || '';
  console.log(`Live Production Build Indicator Text: "${liveBuildShaText}"`);
  console.log(`Live Production Build Indicator Backend SHA: "${liveBackendShaAttr}"`);
  console.log(`Live Production Build Indicator Frontend SHA: "${liveFrontendShaAttr}"`);

  // Check /api/version
  const apiRes = await page.request.get(`${PROD_BASE_URL}/api/version?nocache=${Date.now()}`);
  const apiJson = await apiRes.json();
  const liveApiCommit = apiJson.data?.commit || '';
  console.log(`Live Production /api/version Commit: "${liveApiCommit}"`);

  // 2. Audit Project Detail (July 2026 - HUB Project)
  console.log('\n--- AUDITING PROJECT DETAIL (CONCOST-HUB July 2026) ---');
  await page.goto(`${PROD_BASE_URL}/projects/prj_1785986741604_ppqz`, { waitUntil: 'networkidle' });
  await dismissWorkerPromptModal(page);
  await page.waitForTimeout(500);

  const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
  await scrollContainer.waitFor({ state: 'visible', timeout: 15000 });

  await ensureMonthView(page);
  await navigateToTargetMonth(page, '2026-07');
  await expandAllTaskGroups(page);

  const scrollMetrics = await scrollContainer.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    maxScroll: el.scrollWidth - el.clientWidth,
  }));
  console.log('Project Detail Scroll Metrics:', scrollMetrics);

  const detailScreenshots = {};
  const detailPngBuffers = {};

  for (const ratio of SCROLL_RATIOS) {
    const targetScroll = Math.round(scrollMetrics.maxScroll * ratio);
    await scrollContainer.evaluate((el, target) => {
      el.scrollLeft = target;
    }, targetScroll);
    await page.waitForTimeout(150);

    const percentName = Math.round(ratio * 100);
    const fileName = `detail-${percentName}.png`;
    const filePath = path.join(outDir, fileName);

    await page.screenshot({ path: filePath, fullPage: false });
    const buf = fs.readFileSync(filePath);
    detailPngBuffers[percentName] = PNG.sync.read(buf);
    detailScreenshots[percentName] = filePath;
    console.log(`Saved screenshot: qa/live-production/${fileName} (scrollLeft: ${targetScroll}px)`);
  }

  // Measure Sticky Left Panel Bounding Box & Sample Pixel Colors
  const firstTaskPanel = scrollContainer.locator('[data-testid^="task-left-panel-"]').first();
  const panelBox = await firstTaskPanel.boundingBox();
  console.log('Task Left Panel Box:', panelBox);

  // Sample Pixel RGB at 0%, 50%, 100% scroll in detail screenshots
  const detailPixelSamples = [];
  const samplePoints = [
    { name: 'Task Name Center', x: panelBox.x + panelBox.width * 0.3, y: panelBox.y + panelBox.height * 0.5 },
    { name: 'Worker Column Center', x: panelBox.x + panelBox.width * 0.7, y: panelBox.y + panelBox.height * 0.5 },
    { name: 'Action Column Center', x: panelBox.x + panelBox.width - 20, y: panelBox.y + panelBox.height * 0.5 },
    { name: '1px Inside Right Boundary', x: panelBox.x + panelBox.width - 1, y: panelBox.y + panelBox.height * 0.5 },
  ];

  for (const pt of samplePoints) {
    const pixel0 = parsePngPixel(detailPngBuffers[0], pt.x, pt.y);
    const pixel50 = parsePngPixel(detailPngBuffers[50], pt.x, pt.y);
    const pixel100 = parsePngPixel(detailPngBuffers[100], pt.x, pt.y);

    detailPixelSamples.push({
      sampleName: pt.name,
      x: pt.x,
      y: pt.y,
      pixelAt0: pixel0,
      pixelAt50: pixel50,
      pixelAt100: pixel100,
    });
  }

  // Compare Sticky Left Panel Clip Diff between 0%, 50%, and 100%
  const clipRect = { x: panelBox.x, y: panelBox.y, width: panelBox.width - 2, height: panelBox.height };
  const detailDiff0_50 = comparePngRegions(detailPngBuffers[0], detailPngBuffers[50], clipRect);
  const detailDiff0_100 = comparePngRegions(detailPngBuffers[0], detailPngBuffers[100], clipRect);

  const detailDiffReport = {
    timestamp: new Date().toISOString(),
    browserChannel: channelName,
    url: `${PROD_BASE_URL}/projects/prj_1785986741604_ppqz`,
    buildIndicatorSha: liveBuildShaText,
    backendSha: liveBackendShaAttr,
    frontendSha: liveFrontendShaAttr,
    apiCommit: liveApiCommit,
    stickyPanelWidth: panelBox.width,
    diff0_50: detailDiff0_50,
    diff0_100: detailDiff0_100,
    samples: detailPixelSamples,
    pass: detailDiff0_50.diffRatio <= 0.1 && detailDiff0_100.diffRatio <= 0.1,
  };

  fs.writeFileSync(path.join(outDir, 'detail-sticky-diff.json'), JSON.stringify(detailDiffReport, null, 2), 'utf-8');
  console.log('Saved qa/live-production/detail-sticky-diff.json:', detailDiffReport.pass ? 'PASS' : 'FAIL');

  // 3. Audit Project Overview (August 2026)
  console.log('\n--- AUDITING PROJECT OVERVIEW (August 2026) ---');
  await page.goto(`${PROD_BASE_URL}/projects`, { waitUntil: 'networkidle' });
  await dismissWorkerPromptModal(page);

  const overviewScrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
  await overviewScrollContainer.waitFor({ state: 'visible', timeout: 15000 });

  await ensureMonthView(page);
  await navigateToTargetMonth(page, '2026-08');

  const overviewScrollMetrics = await overviewScrollContainer.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    maxScroll: el.scrollWidth - el.clientWidth,
  }));
  console.log('Project Overview Scroll Metrics:', overviewScrollMetrics);

  const overviewScreenshots = {};
  const overviewPngBuffers = {};

  for (const ratio of SCROLL_RATIOS) {
    const targetScroll = Math.round(overviewScrollMetrics.maxScroll * ratio);
    await overviewScrollContainer.evaluate((el, target) => {
      el.scrollLeft = target;
    }, targetScroll);
    await page.waitForTimeout(150);

    const percentName = Math.round(ratio * 100);
    const fileName = `overview-${percentName}.png`;
    const filePath = path.join(outDir, fileName);

    await page.screenshot({ path: filePath, fullPage: false });
    const buf = fs.readFileSync(filePath);
    overviewPngBuffers[percentName] = PNG.sync.read(buf);
    overviewScreenshots[percentName] = filePath;
    console.log(`Saved screenshot: qa/live-production/${fileName} (scrollLeft: ${targetScroll}px)`);
  }

  const firstProjectPanel = overviewScrollContainer.locator('[data-testid^="project-left-panel-"]').first();
  const ovPanelBox = await firstProjectPanel.boundingBox();
  console.log('Project Left Panel Box:', ovPanelBox);

  const ovSamplePoints = [
    { name: 'Project Name Center', x: ovPanelBox.x + ovPanelBox.width * 0.3, y: ovPanelBox.y + ovPanelBox.height * 0.5 },
    { name: 'Progress Center', x: ovPanelBox.x + ovPanelBox.width * 0.7, y: ovPanelBox.y + ovPanelBox.height * 0.5 },
    { name: '1px Inside Right Boundary', x: ovPanelBox.x + ovPanelBox.width - 1, y: ovPanelBox.y + ovPanelBox.height * 0.5 },
  ];

  const overviewPixelSamples = [];
  for (const pt of ovSamplePoints) {
    const pixel0 = parsePngPixel(overviewPngBuffers[0], pt.x, pt.y);
    const pixel50 = parsePngPixel(overviewPngBuffers[50], pt.x, pt.y);
    const pixel100 = parsePngPixel(overviewPngBuffers[100], pt.x, pt.y);

    overviewPixelSamples.push({
      sampleName: pt.name,
      x: pt.x,
      y: pt.y,
      pixelAt0: pixel0,
      pixelAt50: pixel50,
      pixelAt100: pixel100,
    });
  }

  const ovClipRect = { x: ovPanelBox.x, y: ovPanelBox.y, width: ovPanelBox.width - 2, height: ovPanelBox.height };
  const overviewDiff0_50 = comparePngRegions(overviewPngBuffers[0], overviewPngBuffers[50], ovClipRect);
  const overviewDiff0_100 = comparePngRegions(overviewPngBuffers[0], overviewPngBuffers[100], ovClipRect);

  const overviewDiffReport = {
    timestamp: new Date().toISOString(),
    browserChannel: channelName,
    url: `${PROD_BASE_URL}/projects`,
    buildIndicatorSha: liveBuildShaText,
    backendSha: liveBackendShaAttr,
    frontendSha: liveFrontendShaAttr,
    apiCommit: liveApiCommit,
    stickyPanelWidth: ovPanelBox.width,
    diff0_50: overviewDiff0_50,
    diff0_100: overviewDiff0_100,
    samples: overviewPixelSamples,
    pass: overviewDiff0_50.diffRatio <= 0.1 && overviewDiff0_100.diffRatio <= 0.1,
  };

  fs.writeFileSync(path.join(outDir, 'overview-sticky-diff.json'), JSON.stringify(overviewDiffReport, null, 2), 'utf-8');
  console.log('Saved qa/live-production/overview-sticky-diff.json:', overviewDiffReport.pass ? 'PASS' : 'FAIL');

  await browser.close();

  console.log('\n=== AUDIT SUMMARY ===');
  console.log('Channel:', channelName);
  console.log('Build Indicator SHA:', liveBuildShaText);
  console.log('Backend SHA:', liveBackendShaAttr);
  console.log('Frontend SHA:', liveFrontendShaAttr);
  console.log('API /api/version Commit:', liveApiCommit);
  console.log('Detail Sticky Diff Pass:', detailDiffReport.pass);
  console.log('Overview Sticky Diff Pass:', overviewDiffReport.pass);

  if (!detailDiffReport.pass || !overviewDiffReport.pass) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
