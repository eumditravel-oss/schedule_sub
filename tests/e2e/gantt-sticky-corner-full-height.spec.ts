import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5174';

const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1100, height: 720 },
  { width: 1280, height: 720 },
  { width: 1313, height: 856 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

const SCROLL_RATIOS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

async function dismissBlockingModals(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
  await page.waitForTimeout(100);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(100);
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
    await page.waitForTimeout(200);
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
        await page.waitForTimeout(150);
      } else if (curVal < targetVal) {
        await nextBtn.click();
        await page.waitForTimeout(150);
      } else {
        break;
      }
    } else {
      await prevBtn.click();
      await page.waitForTimeout(150);
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
      await page.waitForTimeout(50);
    }
  }
}

test.describe('P0 Sticky Left Header Full-Height Corner Geometry & Hit Test Suite', () => {
  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  for (const vp of VIEWPORTS) {
    test(`Project Detail Header Full Height Audit at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await dismissBlockingModals(page);

      await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
      await dismissBlockingModals(page);

      const rows = page.locator('[data-testid^="project-row-"]');
      await rows.first().waitFor({ state: 'visible', timeout: 15000 });
      const count = await rows.count();
      let targetTitle = rows.first().locator('span.truncate').first();
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const text = await row.textContent();
        if (text?.includes('CONCOST-HUB') || text?.includes('HUB')) {
          targetTitle = row.locator('span.truncate').first();
          break;
        }
      }

      await targetTitle.click();
      await page.waitForTimeout(300);
      await dismissBlockingModals(page);

      const headerGrid = page.locator('[data-testid="detail-gantt-header-grid"]');
      await expect(headerGrid).toBeVisible({ timeout: 15000 });

      const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
      await ensureMonthView(page);
      await navigateToTargetMonth(page, '2026-07');
      await expandAllTaskGroups(page);

      const geom = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="detail-gantt-header-grid"]');
        const corner = document.querySelector('[data-testid="detail-sticky-corner"]');
        const month = document.querySelector('[data-testid="detail-month-header"]');
        const date = document.querySelector('[data-testid="detail-date-header"]');

        const gR = grid ? grid.getBoundingClientRect() : null;
        const cR = corner ? corner.getBoundingClientRect() : null;
        const mR = month ? month.getBoundingClientRect() : null;
        const dR = date ? date.getBoundingClientRect() : null;

        return { gR, cR, mR, dR };
      });

      expect(geom.gR).not.toBeNull();
      expect(geom.cR).not.toBeNull();
      expect(geom.mR).not.toBeNull();
      expect(geom.dR).not.toBeNull();

      expect(Math.abs(geom.cR.top - geom.gR.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.cR.bottom - geom.gR.bottom)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.cR.height - geom.gR.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.cR.height - (geom.mR.height + geom.dR.height))).toBeLessThanOrEqual(0.5);

      expect(Math.abs(geom.cR.height - 72)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.mR.height - 28)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.dR.height - 44)).toBeLessThanOrEqual(0.5);

      const scrollMetrics = await scrollContainer.evaluate((el) => ({
        maxScroll: el.scrollWidth - el.clientWidth,
      }));

      const sampleXList = [
        geom.cR.x + geom.cR.width * 0.25,
        geom.cR.x + geom.cR.width * 0.65,
        geom.cR.x + geom.cR.width - 20,
        geom.cR.x + geom.cR.width - 1,
      ];

      const monthY = geom.mR.top + geom.mR.height / 2;
      const dateY = geom.dR.top + geom.dR.height / 2;

      for (const ratio of SCROLL_RATIOS) {
        const targetScroll = Math.round(scrollMetrics.maxScroll * ratio);
        await scrollContainer.evaluate((el, target) => {
          el.scrollLeft = target;
        }, targetScroll);
        await page.waitForTimeout(30);

        for (const xVal of sampleXList) {
          const hitDate = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            const corner = document.querySelector('[data-testid="detail-sticky-corner"]');
            return {
              tag: el ? el.tagName : null,
              testId: el ? el.getAttribute('data-testid') : null,
              className: el ? el.className : null,
              isCornerOrChild: el ? corner?.contains(el) || el === corner : false,
            };
          }, { x: xVal, y: dateY });

          expect(hitDate.isCornerOrChild).toBe(true);
        }
      }
    });

    test(`Project Overview Header Full Height Audit at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await dismissBlockingModals(page);

      await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
      await dismissBlockingModals(page);

      const headerGrid = page.locator('[data-testid="overview-gantt-header-grid"]');
      await expect(headerGrid).toBeVisible({ timeout: 15000 });

      const scrollContainer = page.locator('[data-testid="desktop-gantt-scroll"]');
      await ensureMonthView(page);
      await navigateToTargetMonth(page, '2026-08');

      const geom = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="overview-gantt-header-grid"]');
        const corner = document.querySelector('[data-testid="overview-sticky-corner"]');
        const month = document.querySelector('[data-testid="overview-month-header"]');
        const date = document.querySelector('[data-testid="overview-date-header"]');

        const gR = grid ? grid.getBoundingClientRect() : null;
        const cR = corner ? corner.getBoundingClientRect() : null;
        const mR = month ? month.getBoundingClientRect() : null;
        const dR = date ? date.getBoundingClientRect() : null;

        return { gR, cR, mR, dR };
      });

      expect(geom.gR).not.toBeNull();
      expect(geom.cR).not.toBeNull();
      expect(geom.mR).not.toBeNull();
      expect(geom.dR).not.toBeNull();

      expect(Math.abs(geom.cR.top - geom.gR.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.cR.bottom - geom.gR.bottom)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.cR.height - geom.gR.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.cR.height - (geom.mR.height + geom.dR.height))).toBeLessThanOrEqual(0.5);

      expect(Math.abs(geom.cR.height - 72)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.mR.height - 28)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geom.dR.height - 44)).toBeLessThanOrEqual(0.5);

      const scrollMetrics = await scrollContainer.evaluate((el) => ({
        maxScroll: el.scrollWidth - el.clientWidth,
      }));

      const sampleXList = [
        geom.cR.x + geom.cR.width * 0.3,
        geom.cR.x + geom.cR.width * 0.7,
        geom.cR.x + geom.cR.width - 1,
      ];

      const monthY = geom.mR.top + geom.mR.height / 2;
      const dateY = geom.dR.top + geom.dR.height / 2;

      for (const ratio of SCROLL_RATIOS) {
        const targetScroll = Math.round(scrollMetrics.maxScroll * ratio);
        await scrollContainer.evaluate((el, target) => {
          el.scrollLeft = target;
        }, targetScroll);
        await page.waitForTimeout(30);

        for (const xVal of sampleXList) {
          const hitDate = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            const corner = document.querySelector('[data-testid="overview-sticky-corner"]');
            return {
              tag: el ? el.tagName : null,
              testId: el ? el.getAttribute('data-testid') : null,
              className: el ? el.className : null,
              isCornerOrChild: el ? corner?.contains(el) || el === corner : false,
            };
          }, { x: xVal, y: dateY });

          expect(hitDate.isCornerOrChild).toBe(true);
        }
      }
    });
  }
});
