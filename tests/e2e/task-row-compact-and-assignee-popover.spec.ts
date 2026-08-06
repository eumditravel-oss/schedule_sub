// tests/e2e/task-row-compact-and-assignee-popover.spec.ts
import { test, expect } from '@playwright/test';

const LOCAL_BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:5174').trim();

const ALL_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1901, height: 863 },
  { width: 1920, height: 1080 },
];

async function resolveProjectIds(page: any) {
  await page.goto(`${LOCAL_BASE_URL}/projects`);
  await page.waitForLoadState('networkidle');
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
      if (text.includes('ES') && pid.includes('1785986')) esId = pid;
      if ((text.includes('HUB') || text.includes('CONCOST')) && pid.includes('1785986')) hubId = pid;
    });

    return { esId, hubId };
  });
}

async function dismissModalAndSelectWorker(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
}

async function expandAllTaskGroups(page: any) {
  const collapsedToggles = page.locator('[data-testid^="task-group-toggle-"]');
  const count = await collapsedToggles.count();
  for (let i = 0; i < count; i++) {
    const toggle = collapsedToggles.nth(i);
    if (await toggle.isVisible().catch(() => false)) {
      const isExpanded = await toggle.evaluate((el: HTMLElement) => {
        return el.querySelector('svg')?.classList.contains('lucide-chevron-down');
      });
      if (!isExpanded) {
        await toggle.click().catch(() => {});
        await page.waitForTimeout(100);
      }
    }
  }
}

test.describe('P0 Compact Task Rows, Action Boundary Containment & Assignee Popover Portal Elevation', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });
    await dismissModalAndSelectWorker(page);
  });

  test('1. Compact Row Height Verification (Task Row 32~36px, Group Row 34~38px, Left === Timeline Height)', async ({ page }) => {
    const { hubId } = await resolveProjectIds(page);
    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
      await page.waitForLoadState('networkidle');

      const monthBtn = page.locator('[data-testid="view-month-btn"]');
      await monthBtn.waitFor({ state: 'visible', timeout: 15000 });
      await expandAllTaskGroups(page);

      const measurements = await page.evaluate(() => {
        const taskRows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-row-"]')).filter(
          (el) => !el.getAttribute('data-testid')?.includes('group') && !el.getAttribute('data-testid')?.includes('drag-handle')
        );
        const groupRows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-group-row-"]'));

        const taskHeights = taskRows.map((row) => {
          const tid = row.getAttribute('data-testid')?.replace('task-row-', '') || '';
          const leftCell = document.querySelector<HTMLElement>(`[data-testid="task-left-panel-${tid}"]`);
          const timelineCell = document.querySelector<HTMLElement>(`[data-testid="task-timeline-${tid}"]`);
          const rowRect = row.getBoundingClientRect();
          const leftRect = leftCell ? leftCell.getBoundingClientRect() : null;
          const timeRect = timelineCell ? timelineCell.getBoundingClientRect() : null;

          return {
            tid,
            rowHeight: rowRect.height,
            leftHeight: leftRect ? leftRect.height : 0,
            timeHeight: timeRect ? timeRect.height : 0,
            heightDiff: leftRect && timeRect ? Math.abs(leftRect.height - timeRect.height) : 0,
          };
        });

        const groupHeights = groupRows.map((row) => {
          const rect = row.getBoundingClientRect();
          return rect.height;
        });

        return { taskHeights, groupHeights };
      });

      expect(measurements.taskHeights.length).toBeGreaterThan(0);
      for (const item of measurements.taskHeights) {
        expect(item.rowHeight).toBeGreaterThanOrEqual(32);
        expect(item.rowHeight).toBeLessThanOrEqual(36);
        expect(item.heightDiff).toBeLessThanOrEqual(0.5);
      }

      for (const h of measurements.groupHeights) {
        expect(h).toBeGreaterThanOrEqual(34);
        expect(h).toBeLessThanOrEqual(38);
      }
    }
  });

  test('2. Action Column Boundary Containment (Zero Overflow onto Timeline, 1px Safety Margin)', async ({ page }) => {
    const { hubId, esId } = await resolveProjectIds(page);
    for (const pid of [hubId, esId]) {
      await page.goto(`${LOCAL_BASE_URL}/projects/${pid}`);
      await page.waitForLoadState('networkidle');

      const monthBtn = page.locator('[data-testid="view-month-btn"]');
      await monthBtn.waitFor({ state: 'visible', timeout: 15000 });
      await expandAllTaskGroups(page);

      const actionChecks = await page.evaluate(() => {
        const taskRows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="task-row-"]')).filter(
          (el) => !el.getAttribute('data-testid')?.includes('group') && !el.getAttribute('data-testid')?.includes('drag-handle')
        );

        return taskRows.map((row) => {
          const tid = row.getAttribute('data-testid')?.replace('task-row-', '') || '';
          const leftPanel = document.querySelector<HTMLElement>(`[data-testid="task-left-panel-${tid}"]`);
          const actionCol = document.querySelector<HTMLElement>(`[data-testid="task-action-column-${tid}"]`);
          const timeline = document.querySelector<HTMLElement>(`[data-testid="task-timeline-${tid}"]`);

          const moveBtn = document.querySelector<HTMLElement>(`[data-testid="task-move-menu-${tid}"]`);
          const editBtn = document.querySelector<HTMLElement>(`[data-testid="task-edit-btn-${tid}"]`);
          const deleteBtn = document.querySelector<HTMLElement>(`[data-testid="task-delete-btn-${tid}"]`);

          const leftRect = leftPanel ? leftPanel.getBoundingClientRect() : { right: 0 };
          const actionRect = actionCol ? actionCol.getBoundingClientRect() : { right: 0 };
          const timeRect = timeline ? timeline.getBoundingClientRect() : { left: 0 };

          const moveRight = moveBtn ? moveBtn.getBoundingClientRect().right : 0;
          const editRight = editBtn ? editBtn.getBoundingClientRect().right : 0;
          const deleteRight = deleteBtn ? deleteBtn.getBoundingClientRect().right : 0;

          const maxButtonRight = Math.max(moveRight, editRight, deleteRight);

          return {
            tid,
            leftPanelRight: leftRect.right,
            actionColRight: actionRect.right,
            timelineLeft: timeRect.left,
            maxButtonRight,
            actionOverflow: actionRect.right - leftRect.right,
            timelineOverlap: maxButtonRight > timeRect.left ? maxButtonRight - timeRect.left : 0,
          };
        });
      });

      expect(actionChecks.length).toBeGreaterThan(0);
      for (const check of actionChecks) {
        expect(check.actionColRight).toBeLessThanOrEqual(check.leftPanelRight + 0.5);
        expect(check.actionColRight).toBeLessThanOrEqual(check.timelineLeft + 0.5);
        expect(check.timelineOverlap).toBe(0);
      }
    }
  });

  test('3. Assignee Popover Portal Elevation, Top Z-Index & Top-Most Layer Verification', async ({ page }) => {
    const { hubId } = await resolveProjectIds(page);
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
    await page.waitForLoadState('networkidle');

    const monthBtn = page.locator('[data-testid="view-month-btn"]');
    await monthBtn.waitFor({ state: 'visible', timeout: 15000 });
    await expandAllTaskGroups(page);

    const firstTaskSummary = page.locator('[data-testid^="task-assignee-summary-"]').first();
    await expect(firstTaskSummary).toBeVisible();

    const taskId = await firstTaskSummary.evaluate((el: HTMLElement) => {
      const tid = el.getAttribute('data-testid') || '';
      return tid.replace('task-assignee-summary-', '');
    });

    // 1. Click assignee summary to open popover
    await firstTaskSummary.click();
    const popover = page.locator(`[data-testid="task-assignee-popover-${taskId}"]`);
    await expect(popover).toBeVisible({ timeout: 5000 });

    // 2. Verify Portal Parent is overlay-root or body
    const portalParent = await popover.evaluate((el: HTMLElement) => {
      return el.parentElement?.id || el.parentElement?.tagName;
    });
    expect(['overlay-root', 'BODY']).toContain(portalParent);

    // 3. Verify Position Fixed and Top Z-Index (>= 100000)
    const popoverStyle = await popover.evaluate((el: HTMLElement) => {
      const comp = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(centerX, centerY);

      return {
        position: comp.position,
        zIndex: Number(comp.zIndex || 0),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        isTopElement: el.contains(topEl),
        topElTag: topEl?.tagName,
        topElClass: topEl?.className,
      };
    });

    expect(popoverStyle.position).toBe('fixed');
    expect(popoverStyle.zIndex).toBeGreaterThanOrEqual(100000);
    expect(popoverStyle.isTopElement).toBe(true);

    // 4. Verify Viewport Boundary Clipping (left >= 8, top >= 8, right <= vw - 8, bottom <= vh - 8)
    expect(popoverStyle.rect.left).toBeGreaterThanOrEqual(8);
    expect(popoverStyle.rect.top).toBeGreaterThanOrEqual(8);
    expect(popoverStyle.rect.right).toBeLessThanOrEqual(1536 - 8);
    expect(popoverStyle.rect.bottom).toBeLessThanOrEqual(864 - 8);

    // 5. Test Escape Key Closes Popover
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();

    // 6. Test Outside Click Closes Popover
    await firstTaskSummary.click();
    await expect(popover).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(popover).not.toBeVisible();
  });
});
