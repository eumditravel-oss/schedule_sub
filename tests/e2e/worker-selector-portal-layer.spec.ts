import { test, expect } from '@playwright/test';

const viewports = [
  { width: 1024, height: 768 },
  { width: 1100, height: 720 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

test.describe('P0 Worker Selector Dropdown Portal & Top Layer Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  for (const vp of viewports) {
    test(`Project Overview Worker Dropdown Portal at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/projects');

      const workerBtn = page.locator('[data-testid="worker-select-btn"]');
      await expect(workerBtn).toBeVisible({ timeout: 10000 });

      await workerBtn.click();

      const dropdown = page.locator('[data-testid="worker-selector-dropdown-portal"]');
      await expect(dropdown).toBeVisible();

      // 1. Verify fixed positioning & top layer zIndex
      const dropdownProps = await dropdown.evaluate((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          position: style.position,
          zIndex: parseInt(style.zIndex, 10),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          parentTag: el.parentElement?.tagName,
          parentId: el.parentElement?.id,
        };
      });

      expect(dropdownProps.position).toBe('fixed');
      expect(dropdownProps.zIndex).toBeGreaterThanOrEqual(100000);
      expect(dropdownProps.left).toBeGreaterThanOrEqual(0);
      expect(dropdownProps.top).toBeGreaterThanOrEqual(0);
      expect(dropdownProps.right).toBeLessThanOrEqual(vp.width);
      expect(dropdownProps.bottom).toBeLessThanOrEqual(vp.height);

      // 2. Verify elementFromPoint at center of dropdown returns dropdown or option child
      const centerHit = await dropdown.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hitEl = document.elementFromPoint(centerX, centerY);
        return {
          isInside: el.contains(hitEl),
          tagName: hitEl?.tagName,
          testId: hitEl?.getAttribute('data-testid'),
        };
      });

      expect(centerHit.isInside).toBe(true);

      // 3. Test Escape key closes dropdown
      await page.keyboard.press('Escape');
      await expect(dropdown).not.toBeVisible();

      // 4. Re-open and test outside click closes dropdown
      await workerBtn.click();
      await expect(dropdown).toBeVisible();
      await page.mouse.click(10, 10);
      await expect(dropdown).not.toBeVisible();
    });
  }

  test('Project Detail Worker Dropdown Portal top layer over Gantt & Sticky Header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');

    const firstProjectLink = page.locator('table tbody tr a, [data-testid^="project-row-"] a').first();
    if (await firstProjectLink.isVisible()) {
      await firstProjectLink.click();
    } else {
      await page.goto('/projects/prj_1');
    }

    await page.waitForTimeout(2000);

    const workerBtn = page.locator('[data-testid="worker-select-btn"]');
    await expect(workerBtn).toBeVisible();

    await workerBtn.click();

    const dropdown = page.locator('[data-testid="worker-selector-dropdown-portal"]');
    await expect(dropdown).toBeVisible();

    // Verify elementFromPoint over first option returns option child
    const optionHit = await dropdown.evaluate((el) => {
      const firstOption = el.querySelector('[data-testid^="worker-option-"]');
      if (!firstOption) return { found: false };
      const rect = firstOption.getBoundingClientRect();
      const hitEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        found: true,
        isInside: el.contains(hitEl),
      };
    });

    if (optionHit.found) {
      expect(optionHit.isInside).toBe(true);
    }

    // Select worker option
    const firstOption = dropdown.locator('[data-testid^="worker-option-"]').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
      await expect(dropdown).not.toBeVisible();
    }
  });
});
