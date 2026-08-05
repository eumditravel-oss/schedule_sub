// tests/e2e/mobile-logo-header.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');
const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

async function dismissBlockingModals(page: any) {
  const workerPromptModal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await workerPromptModal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const option = page.locator('[data-testid^="worker-prompt-option-"]').first();
    if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(300);
    }
  }
}

const MOBILE_VIEWPORTS = [
  { width: 320, height: 700, label: '320' },
  { width: 344, height: 882, label: '344' },
  { width: 360, height: 780, label: '360' },
  { width: 390, height: 844, label: '390' },
  { width: 412, height: 915, label: '412' },
  { width: 768, height: 1024, label: 'fold-768' },
];

test.describe('Mobile Header Logo Legibility Suite', () => {

  test('1. Mobile header logo rendered height 32–38px, not clipped, no overlap with title', async ({ page }) => {
    for (const vp of MOBILE_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript(() => {
        localStorage.setItem('schedule_current_worker_id', 'wrk_01');
        localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      });
      await page.goto(`${QA_BASE_URL}/projects`);
      await dismissBlockingModals(page);

      const logo = page.locator('[data-testid="mobile-header-logo"]');
      await expect(logo, `[${vp.label}px] logo must be visible`).toBeVisible({ timeout: 10000 });

      // naturalWidth / naturalHeight > 0 (image loaded)
      const naturalDims = await logo.evaluate((el: HTMLImageElement) => ({
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
      }));
      expect(naturalDims.naturalWidth, `[${vp.label}px] logo naturalWidth > 0`).toBeGreaterThan(0);
      expect(naturalDims.naturalHeight, `[${vp.label}px] logo naturalHeight > 0`).toBeGreaterThan(0);

      const logoBox = await logo.boundingBox();
      expect(logoBox, `[${vp.label}px] logo boundingBox exists`).toBeTruthy();

      // Height 32–38px
      const minH = vp.width >= 390 ? 36 : vp.width >= 360 ? 36 : vp.width >= 344 ? 34 : 32;
      expect(logoBox!.height, `[${vp.label}px] logo height >= ${minH}px`).toBeGreaterThanOrEqual(minH);
      expect(logoBox!.height, `[${vp.label}px] logo height <= 38px`).toBeLessThanOrEqual(38);

      // Logo must not overflow header
      const headerBox = await page.locator('header').first().boundingBox();
      expect(headerBox).toBeTruthy();
      expect(logoBox!.y, `[${vp.label}px] logo top >= header top`).toBeGreaterThanOrEqual(headerBox!.y - 1);
      expect(logoBox!.y + logoBox!.height, `[${vp.label}px] logo bottom <= header bottom`).toBeLessThanOrEqual(headerBox!.y + headerBox!.height + 1);

      // Logo must not be clipped on left edge
      expect(logoBox!.x, `[${vp.label}px] logo left >= 0`).toBeGreaterThanOrEqual(0);

      // Header height 52–58px
      expect(headerBox!.height, `[${vp.label}px] header height >= 52`).toBeGreaterThanOrEqual(52);
      expect(headerBox!.height, `[${vp.label}px] header height <= 58`).toBeLessThanOrEqual(58);

      // Logo must not overlap title
      const titleEl = page.locator('[data-testid="mobile-header-title"]');
      if (await titleEl.isVisible().catch(() => false)) {
        const titleBox = await titleEl.boundingBox();
        if (titleBox) {
          // Logo right edge must be at least 4px left of title left edge
          expect(logoBox!.x + logoBox!.width, `[${vp.label}px] logo right must not overlap title`).toBeLessThanOrEqual(titleBox.x + 4);
        }
      }

      // No horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `[${vp.label}px] no horizontal overflow`).toBe(false);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `mobile-logo-${vp.label}-final.png`) });
    }
  });

  test('2. Logo image fill ratio: logo pixels cover ≥ 80% height and ≥ 90% width of the PNG', async ({ page }) => {
    // Verify tight crop via Playwright canvas analysis
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const logo = page.locator('[data-testid="mobile-header-logo"]');
    await expect(logo).toBeVisible({ timeout: 10000 });

    // Evaluate pixel fill ratio via canvas
    const fillRatios = await page.evaluate(async () => {
      const img = document.querySelector('[data-testid="mobile-header-logo"]') as HTMLImageElement;
      if (!img || !img.complete) return null;

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      let hasLogo = false;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
          // Non-transparent and not near-white
          if (a > 10 && !(r > 240 && g > 240 && b > 240)) {
            hasLogo = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!hasLogo) return { fillW: 0, fillH: 0, imgW: canvas.width, imgH: canvas.height };
      return {
        fillW: (maxX - minX + 1) / canvas.width,
        fillH: (maxY - minY + 1) / canvas.height,
        imgW: canvas.width,
        imgH: canvas.height,
        logoBbox: { minX, minY, maxX, maxY },
      };
    });

    expect(fillRatios, 'Canvas pixel analysis must return data').toBeTruthy();
    expect(fillRatios!.fillW, `Logo pixel fill width ratio must be >= 0.90 (got ${fillRatios!.fillW?.toFixed(3)})`).toBeGreaterThanOrEqual(0.90);
    expect(fillRatios!.fillH, `Logo pixel fill height ratio must be >= 0.80 (got ${fillRatios!.fillH?.toFixed(3)})`).toBeGreaterThanOrEqual(0.80);
  });

  test('3. Title centered in viewport (center within 20% of viewport width)', async ({ page }) => {
    for (const vp of MOBILE_VIEWPORTS.slice(0, 5)) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript(() => {
        localStorage.setItem('schedule_current_worker_id', 'wrk_01');
        localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      });
      await page.goto(`${QA_BASE_URL}/projects`);
      await dismissBlockingModals(page);

      const titleEl = page.locator('[data-testid="mobile-header-title"]');
      await expect(titleEl).toBeVisible({ timeout: 10000 });
      const titleBox = await titleEl.boundingBox();
      expect(titleBox).toBeTruthy();

      const titleCenter = titleBox!.x + titleBox!.width / 2;
      const viewportCenter = vp.width / 2;
      const deviation = Math.abs(titleCenter - viewportCenter);
      // Title center within 20% of viewport width from center
      expect(deviation, `[${vp.label}px] title center deviation from viewport center (got ${deviation.toFixed(1)}px)`).toBeLessThanOrEqual(vp.width * 0.20);
    }
  });

});
