import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * P0 Gantt Sticky Left Occlusion & Multi-Viewport Windowed E2E Suite
 *
 * Verifies that horizontally scrolling the Gantt timeline in windowed viewports
 * keeps all date headers, day grids, ScheduleBars, project bars, and holiday/vacation hatches
 * STRICTLY BEHIND sticky left information panels and header corners across Project Detail & Overview.
 */

const BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:5174').trim();

const WINDOWED_VIEWPORTS = [
  { width: 1024, height: 768, name: '1024x768' },
  { width: 1100, height: 720, name: '1100x720' },
  { width: 1280, height: 720, name: '1280x720' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1536, height: 864, name: '1536x864' },
  { width: 1920, height: 1080, name: '1920x1080' },
];

const SCROLL_RATIOS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

async function dismissWorkerPromptModal(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', '박용진 수석');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
  await page.waitForTimeout(300);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function resolveProjectIds(page: any) {
  await page.goto(`${BASE_URL}/projects`);
  await page.waitForLoadState('networkidle');
  await dismissWorkerPromptModal(page);
  return await page.evaluate(() => {
    const defaultEs = 'prj_1785986689248_qhuq';
    const defaultHub = 'prj_1785986741604_ppqz';
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="project-row-"]'));
    let esId = defaultEs;
    let hubId = defaultHub;

    rows.forEach((r) => {
      const tid = r.getAttribute('data-testid') || '';
      const pid = tid.replace('project-row-', '');
      const text = r.textContent || '';
      if (text.includes('ES') && !esId.includes('1785986')) {
        esId = pid;
      }
      if ((text.includes('HUB') || text.includes('CONCOST')) && !hubId.includes('1785986')) {
        hubId = pid;
      }
      if (text.includes('ES') && pid.includes('1785986')) esId = pid;
      if ((text.includes('HUB') || text.includes('CONCOST')) && pid.includes('1785986')) hubId = pid;
    });

    return { esId, hubId };
  });
}

async function ensureMonthView(page: any) {
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

async function navigateToTargetMonth(page: any, targetYearMonthStr: string) {
  const prevBtn = page.locator('[data-testid="nav-prev-btn"]');
  const nextBtn = page.locator('[data-testid="nav-next-btn"]');
  const rangeToolbar = page.locator('section[data-testid="desktop-schedule-toolbar"]');

  await expect(rangeToolbar).toBeVisible();

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
        await expect(prevBtn).toBeVisible();
        await prevBtn.click();
        await page.waitForTimeout(300);
      } else if (curVal < targetVal) {
        await expect(nextBtn).toBeVisible();
        await nextBtn.click();
        await page.waitForTimeout(300);
      } else {
        break;
      }
    } else {
      await expect(prevBtn).toBeVisible();
      await prevBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function expandAllTaskGroups(page: any) {
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

test.describe('P0 Gantt Sticky Left Occlusion & Windowed Viewport Suite', () => {
  test.beforeEach(async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => pageErrors.push(err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!txt.includes('Failed to load resource') && !txt.includes('404') && !txt.includes('favicon')) {
          consoleErrors.push(txt);
        }
      }
    });

    (page as any)._pageErrors = pageErrors;
    (page as any)._consoleErrors = consoleErrors;
  });

  test('1. Project Detail - Sticky Left Occlusion & 5-Viewport Windowed Scroll Audit', async ({ page }) => {
    test.setTimeout(120000);
    const pageErrors: Error[] = (page as any)._pageErrors;
    const consoleErrors: string[] = (page as any)._consoleErrors;

    const screenshotsDir = path.join(process.cwd(), 'qa', 'screenshots');
    const occlusionDir = path.join(process.cwd(), 'qa', 'occlusion');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    if (!fs.existsSync(occlusionDir)) fs.mkdirSync(occlusionDir, { recursive: true });

    // 1. Resolve project IDs & Navigate to HUB Project Detail
    await page.setViewportSize({ width: 1920, height: 1080 });
    const { hubId } = await resolveProjectIds(page);

    await page.goto(`${BASE_URL}/projects/${hubId}`, { waitUntil: 'networkidle' });
    await dismissWorkerPromptModal(page);
    await expect(page.locator('[data-testid="desktop-gantt-canvas"]')).toBeVisible({ timeout: 15000 });

    await ensureMonthView(page);
    await navigateToTargetMonth(page, '2026-07');
    await expandAllTaskGroups(page);

    // Verify task left panels baseline
    const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
    const taskLeftPanels = scrollContainer.locator('[data-testid^="task-left-panel-"]');
    await expect(taskLeftPanels).toHaveCount(21);

    const detailAuditResults: any[] = [];

    // Audit across all Viewports
    for (const vp of WINDOWED_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      await expect(scrollContainer).toBeVisible({ timeout: 15000 });

      // Check windowed scrollability
      const scrollMetrics = await scrollContainer.evaluate((el: HTMLElement) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        maxScroll: el.scrollWidth - el.clientWidth,
      }));

      if (vp.width <= 1366) {
        expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
      }

      for (const ratio of SCROLL_RATIOS) {
        const targetScrollLeft = Math.round(scrollMetrics.maxScroll * ratio);

        await scrollContainer.evaluate((el: HTMLElement, target: number) => {
          el.scrollLeft = target;
        }, targetScrollLeft);
        await page.waitForTimeout(100);

        const actualScrollLeft = await scrollContainer.evaluate((el: HTMLElement) => el.scrollLeft);

        // 1. Verify Occlusion Rail exists
        const occlusionRails = scrollContainer.locator('[data-testid="gantt-sticky-occlusion-rail"]');
        expect(await occlusionRails.count()).toBeGreaterThan(0);

        // 2. Audit Sticky Left Corner
        const cornerHeader = scrollContainer.locator('[data-testid="detail-sticky-corner"]');
        await expect(cornerHeader).toBeVisible();

        const cornerBox = await cornerHeader.boundingBox();
        const containerBox = await scrollContainer.boundingBox();
        expect(cornerBox).not.toBeNull();
        expect(containerBox).not.toBeNull();

        // Sticky Corner Left aligns with Container Left + 1px border within 0.5px
        expect(Math.abs(cornerBox!.x - (containerBox!.x + 1))).toBeLessThanOrEqual(0.5);

        // 3. Perform ElementFromPoint Sampling inside Sticky Left Panel
        const firstTaskPanel = scrollContainer.locator('[data-testid^="task-left-panel-"]').first();
        const panelBox = await firstTaskPanel.boundingBox();
        expect(panelBox).not.toBeNull();

        const samples = [
          { name: 'Task Name Center', x: panelBox!.x + panelBox!.width * 0.3, y: panelBox!.y + panelBox!.height * 0.5 },
          { name: 'Worker Column Center', x: panelBox!.x + panelBox!.width * 0.7, y: panelBox!.y + panelBox!.height * 0.5 },
          { name: 'Action Column Center', x: panelBox!.x + panelBox!.width - 20, y: panelBox!.y + panelBox!.height * 0.5 },
          { name: '1px Inside Right Boundary', x: panelBox!.x + panelBox!.width - 1, y: panelBox!.y + panelBox!.height * 0.5 },
        ];

        const sampleResults: any[] = [];

        for (const sample of samples) {
          const evalRes = await page.evaluate(({ x, y }) => {
            const topEl = document.elementFromPoint(x, y) as HTMLElement | null;
            const stack = document.elementsFromPoint(x, y) as HTMLElement[];

            const topTestId = topEl?.getAttribute('data-testid') || topEl?.closest('[data-testid]')?.getAttribute('data-testid') || '';

            const isStickyOrChild = !!topEl?.closest('[data-testid^="task-left-panel-"], [data-testid="detail-sticky-corner"], [data-testid^="task-group-left-panel-"]');

            const isForbiddenTimelineElement = !!(
              topTestId.includes('gantt-date-header') ||
              topTestId.includes('gantt-task-cell') ||
              topTestId.includes('gantt-schedule-bar') ||
              topTestId.includes('worker-day-cell') ||
              topTestId.includes('gantt-today-column')
            );

            const stickyIndex = stack.findIndex((el) => el.getAttribute('data-testid')?.startsWith('task-left-panel-') || el.closest('[data-testid^="task-left-panel-"]'));
            const timelineIndex = stack.findIndex((el) => el.getAttribute('data-testid')?.startsWith('gantt-task-cell-') || el.closest('[data-testid^="task-timeline-"]'));

            return {
              topTestId,
              isStickyOrChild,
              isForbiddenTimelineElement,
              stickyIndex,
              timelineIndex,
            };
          }, { x: sample.x, y: sample.y });

          expect(evalRes.isStickyOrChild).toBe(true);
          expect(evalRes.isForbiddenTimelineElement).toBe(false);
          if (evalRes.stickyIndex !== -1 && evalRes.timelineIndex !== -1) {
            expect(evalRes.stickyIndex).toBeLessThan(evalRes.timelineIndex);
          }

          sampleResults.push({
            name: sample.name,
            x: sample.x,
            y: sample.y,
            topElementTestId: evalRes.topTestId,
            topElementInsideSticky: evalRes.isStickyOrChild,
            timelineVisibleAboveSticky: evalRes.isForbiddenTimelineElement,
          });
        }

        // 4. Verify Computed Opacity & Opaque Background
        const bgStyles = await firstTaskPanel.evaluate((el: HTMLElement) => {
          const comp = window.getComputedStyle(el);
          return {
            opacity: comp.opacity,
            backgroundColor: comp.backgroundColor,
            isolation: comp.isolation,
            zIndex: comp.zIndex,
          };
        });

        expect(parseFloat(bgStyles.opacity)).toBe(1.0);
        expect(bgStyles.backgroundColor).not.toContain('rgba(0, 0, 0, 0)');
        expect(bgStyles.backgroundColor).not.toContain('transparent');
        expect(parseInt(bgStyles.zIndex, 10)).toBeGreaterThanOrEqual(100);

        detailAuditResults.push({
          viewport: vp,
          scrollLeft: actualScrollLeft,
          maxScroll: scrollMetrics.maxScroll,
          stickyLeft: {
            left: panelBox!.x,
            right: panelBox!.x + panelBox!.width,
            width: panelBox!.width,
            zIndex: parseInt(bgStyles.zIndex, 10),
            backgroundColor: bgStyles.backgroundColor,
            opacity: bgStyles.opacity,
          },
          samples: sampleResults,
          pass: true,
        });

        // Take Required Screenshots for 1024 viewport
        if (vp.width === 1024 && ratio === 0) {
          await page.screenshot({ path: path.join(screenshotsDir, 'detail-windowed-scroll-1024-left.png') });
        } else if (vp.width === 1024 && ratio === 1.0) {
          await page.screenshot({ path: path.join(screenshotsDir, 'detail-windowed-scroll-1024-right.png') });
        }
      }
    }

    // Save JSON Proof
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      project: 'CONCOST-HUB',
      auditCount: detailAuditResults.length,
      audits: detailAuditResults,
      pass: true,
    };
    fs.writeFileSync(path.join(occlusionDir, 'detail-windowed.json'), JSON.stringify(jsonOutput, null, 2), 'utf-8');

    expect(pageErrors.length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('2. Project Overview - Sticky Left Occlusion & 5-Viewport Windowed Scroll Audit', async ({ page }) => {
    test.setTimeout(120000);
    const pageErrors: Error[] = (page as any)._pageErrors;
    const consoleErrors: string[] = (page as any)._consoleErrors;

    const screenshotsDir = path.join(process.cwd(), 'qa', 'screenshots');
    const occlusionDir = path.join(process.cwd(), 'qa', 'occlusion');

    // 1. Navigate to Project Overview
    await page.setViewportSize({ width: 1920, height: 1080 });
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle' });
    await dismissWorkerPromptModal(page);
    await expect(page.locator('[data-testid="desktop-gantt-canvas"]')).toBeVisible({ timeout: 15000 });

    await ensureMonthView(page);
    await navigateToTargetMonth(page, '2026-07');

    const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
    await expect(scrollContainer).toBeVisible({ timeout: 15000 });

    const projectLeftPanels = scrollContainer.locator('[data-testid^="project-left-panel-"]');
    const projectCount = await projectLeftPanels.count();
    expect(projectCount).toBeGreaterThanOrEqual(2);

    const overviewAuditResults: any[] = [];

    // Audit across all Viewports
    for (const vp of WINDOWED_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      await expect(scrollContainer).toBeVisible({ timeout: 15000 });

      const scrollMetrics = await scrollContainer.evaluate((el: HTMLElement) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        maxScroll: el.scrollWidth - el.clientWidth,
      }));

      if (vp.width <= 1366) {
        expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
      }

      for (const ratio of SCROLL_RATIOS) {
        const targetScrollLeft = Math.round(scrollMetrics.maxScroll * ratio);

        await scrollContainer.evaluate((el: HTMLElement, target: number) => {
          el.scrollLeft = target;
        }, targetScrollLeft);
        await page.waitForTimeout(100);

        const actualScrollLeft = await scrollContainer.evaluate((el: HTMLElement) => el.scrollLeft);

        // 1. Verify Occlusion Rail exists
        const occlusionRails = scrollContainer.locator('[data-testid="gantt-sticky-occlusion-rail"]');
        expect(await occlusionRails.count()).toBeGreaterThan(0);

        // 2. Audit Sticky Corner Header
        const cornerHeader = scrollContainer.locator('[data-testid="overview-sticky-corner"]');
        await expect(cornerHeader).toBeVisible();

        const cornerBox = await cornerHeader.boundingBox();
        const containerBox = await scrollContainer.boundingBox();
        expect(cornerBox).not.toBeNull();
        expect(containerBox).not.toBeNull();

        expect(Math.abs(cornerBox!.x - (containerBox!.x + 1))).toBeLessThanOrEqual(0.5);

        // 3. Perform ElementFromPoint Sampling inside Overview Left Panel
        const firstProjectPanel = scrollContainer.locator('[data-testid^="project-left-panel-"]').first();
        const panelBox = await firstProjectPanel.boundingBox();
        expect(panelBox).not.toBeNull();

        const samples = [
          { name: 'Project Name Center', x: panelBox!.x + panelBox!.width * 0.3, y: panelBox!.y + panelBox!.height * 0.5 },
          { name: 'Progress/Actions Center', x: panelBox!.x + panelBox!.width * 0.7, y: panelBox!.y + panelBox!.height * 0.5 },
          { name: '1px Inside Right Boundary', x: panelBox!.x + panelBox!.width - 1, y: panelBox!.y + panelBox!.height * 0.5 },
        ];

        const sampleResults: any[] = [];

        for (const sample of samples) {
          const evalRes = await page.evaluate(({ x, y }) => {
            const topEl = document.elementFromPoint(x, y) as HTMLElement | null;
            const stack = document.elementsFromPoint(x, y) as HTMLElement[];

            const topTestId = topEl?.getAttribute('data-testid') || topEl?.closest('[data-testid]')?.getAttribute('data-testid') || '';

            const isStickyOrChild = !!topEl?.closest('[data-testid^="project-left-panel-"], [data-testid="overview-sticky-corner"]');

            const isForbiddenTimelineElement = !!(
              topTestId.includes('gantt-date-header') ||
              topTestId.includes('gantt-task-cell-overview') ||
              topTestId.includes('gantt-schedule-bar') ||
              topTestId.includes('project-calendar-hatch') ||
              topTestId.includes('gantt-today-column')
            );

            const stickyIndex = stack.findIndex((el) => el.getAttribute('data-testid')?.startsWith('project-left-panel-') || el.closest('[data-testid^="project-left-panel-"]'));
            const timelineIndex = stack.findIndex((el) => el.getAttribute('data-testid')?.startsWith('gantt-task-cell-overview-') || el.closest('[data-testid^="project-timeline-"]'));

            return {
              topTestId,
              isStickyOrChild,
              isForbiddenTimelineElement,
              stickyIndex,
              timelineIndex,
            };
          }, { x: sample.x, y: sample.y });

          expect(evalRes.isStickyOrChild).toBe(true);
          expect(evalRes.isForbiddenTimelineElement).toBe(false);
          if (evalRes.stickyIndex !== -1 && evalRes.timelineIndex !== -1) {
            expect(evalRes.stickyIndex).toBeLessThan(evalRes.timelineIndex);
          }

          sampleResults.push({
            name: sample.name,
            x: sample.x,
            y: sample.y,
            topElementTestId: evalRes.topTestId,
            topElementInsideSticky: evalRes.isStickyOrChild,
            timelineVisibleAboveSticky: evalRes.isForbiddenTimelineElement,
          });
        }

        // 4. Verify Computed Opacity & Opaque Background
        const bgStyles = await firstProjectPanel.evaluate((el: HTMLElement) => {
          const comp = window.getComputedStyle(el);
          return {
            opacity: comp.opacity,
            backgroundColor: comp.backgroundColor,
            isolation: comp.isolation,
            zIndex: comp.zIndex,
          };
        });

        expect(parseFloat(bgStyles.opacity)).toBe(1.0);
        expect(bgStyles.backgroundColor).not.toContain('rgba(0, 0, 0, 0)');
        expect(bgStyles.backgroundColor).not.toContain('transparent');
        expect(parseInt(bgStyles.zIndex, 10)).toBeGreaterThanOrEqual(100);

        overviewAuditResults.push({
          viewport: vp,
          scrollLeft: actualScrollLeft,
          maxScroll: scrollMetrics.maxScroll,
          stickyLeft: {
            left: panelBox!.x,
            right: panelBox!.x + panelBox!.width,
            width: panelBox!.width,
            zIndex: parseInt(bgStyles.zIndex, 10),
            backgroundColor: bgStyles.backgroundColor,
            opacity: bgStyles.opacity,
          },
          samples: sampleResults,
          pass: true,
        });

        // Take Required Screenshots for 1024 viewport
        if (vp.width === 1024 && ratio === 0) {
          await page.screenshot({ path: path.join(screenshotsDir, 'overview-windowed-scroll-1024-left.png') });
        } else if (vp.width === 1024 && ratio === 1.0) {
          await page.screenshot({ path: path.join(screenshotsDir, 'overview-windowed-scroll-1024-right.png') });
        }
      }
    }

    // Save JSON Proof
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      page: 'Project Overview',
      auditCount: overviewAuditResults.length,
      audits: overviewAuditResults,
      pass: true,
    };
    fs.writeFileSync(path.join(occlusionDir, 'overview-windowed.json'), JSON.stringify(jsonOutput, null, 2), 'utf-8');

    expect(pageErrors.length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('3. Dynamic Real-Time Window Resize & Occlusion Audit (1920 -> 1280 -> 1024 -> 1366 -> 1920)', async ({ page }) => {
    test.setTimeout(60000);
    const pageErrors: Error[] = (page as any)._pageErrors;
    const consoleErrors: string[] = (page as any)._consoleErrors;

    await page.setViewportSize({ width: 1920, height: 1080 });
    const { hubId } = await resolveProjectIds(page);

    await page.goto(`${BASE_URL}/projects/${hubId}`, { waitUntil: 'networkidle' });
    await dismissWorkerPromptModal(page);
    await expect(page.locator('[data-testid="desktop-gantt-canvas"]')).toBeVisible({ timeout: 15000 });

    const resizeSequence = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ];

    const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
    await expect(scrollContainer).toBeVisible({ timeout: 15000 });

    for (const size of resizeSequence) {
      await page.setViewportSize(size);
      await page.waitForTimeout(200);

      await expect(scrollContainer).toBeVisible({ timeout: 15000 });

      // Scroll to 50%
      await scrollContainer.evaluate((el: HTMLElement) => {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.5;
      });
      await page.waitForTimeout(100);

      // Verify corner alignment
      const cornerHeader = scrollContainer.locator('[data-testid="detail-sticky-corner"]');
      const cornerBox = await cornerHeader.boundingBox();
      const containerBox = await scrollContainer.boundingBox();

      expect(cornerBox).not.toBeNull();
      expect(containerBox).not.toBeNull();
      expect(Math.abs(cornerBox!.x - (containerBox!.x + 1))).toBeLessThanOrEqual(0.5);

      // Verify elementFromPoint inside task panel
      const firstTaskPanel = scrollContainer.locator('[data-testid^="task-left-panel-"]').first();
      const panelBox = await firstTaskPanel.boundingBox();
      expect(panelBox).not.toBeNull();

      const topTestId = await page.evaluate(({ x, y }) => {
        const topEl = document.elementFromPoint(x, y) as HTMLElement | null;
        return topEl?.getAttribute('data-testid') || topEl?.closest('[data-testid]')?.getAttribute('data-testid') || '';
      }, { x: panelBox!.x + panelBox!.width * 0.5, y: panelBox!.y + panelBox!.height * 0.5 });

      expect(topTestId).not.toContain('gantt-date-header');
      expect(topTestId).not.toContain('gantt-task-cell');
      expect(topTestId).not.toContain('gantt-schedule-bar');
    }

    expect(pageErrors.length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });
});
