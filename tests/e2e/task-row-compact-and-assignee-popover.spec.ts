import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(QA_BASE_URL, 'task-row-compact-and-assignee-popover');

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
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const toggle = collapsedToggles.nth(i);
    await expect(toggle).toBeVisible();
    const isExpanded = await toggle.evaluate((el: HTMLElement) => {
      return el.querySelector('svg')?.classList.contains('lucide-chevron-down');
    });
    if (!isExpanded) {
      await toggle.click();
      await page.waitForTimeout(100);
    }
  }
}

test.describe('P0 Compact Task Rows, Action Boundary Containment & Assignee Popover Portal Elevation', () => {
  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });
    await dismissModalAndSelectWorker(page);
  });

  test('1. Compact Row Height Verification & Exact Row Count Assertions (HUB=21, ES=15)', async ({ page }) => {
    const { hubId, esId } = await resolveProjectIds(page);

    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);

      // 1. HUB Project (Exact 21 Task Rows)
      await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="view-month-btn"]').waitFor({ state: 'visible', timeout: 15000 });
      await expandAllTaskGroups(page);

      const hubData = await page.evaluate(() => {
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

        const groupHeights = groupRows.map((row) => row.getBoundingClientRect().height);
        return { taskHeights, groupHeights };
      });

      expect(hubData.taskHeights.length).toBe(21);
      for (const item of hubData.taskHeights) {
        expect(item.rowHeight).toBeGreaterThanOrEqual(32);
        expect(item.rowHeight).toBeLessThanOrEqual(36);
        expect(item.heightDiff).toBeLessThanOrEqual(0.5);
      }
      for (const h of hubData.groupHeights) {
        expect(h).toBeGreaterThanOrEqual(34);
        expect(h).toBeLessThanOrEqual(38);
      }

      // 2. ES Project (Exact 15 Task Rows)
      await page.goto(`${LOCAL_BASE_URL}/projects/${esId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="view-month-btn"]').waitFor({ state: 'visible', timeout: 15000 });
      await expandAllTaskGroups(page);

      const esData = await page.evaluate(() => {
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

        const groupHeights = groupRows.map((row) => row.getBoundingClientRect().height);
        return { taskHeights, groupHeights };
      });

      expect(esData.taskHeights.length).toBe(15);
      for (const item of esData.taskHeights) {
        expect(item.rowHeight).toBeGreaterThanOrEqual(32);
        expect(item.rowHeight).toBeLessThanOrEqual(36);
        expect(item.heightDiff).toBeLessThanOrEqual(0.5);
      }
      for (const h of esData.groupHeights) {
        expect(h).toBeGreaterThanOrEqual(34);
        expect(h).toBeLessThanOrEqual(38);
      }
    }
  });

  test('2. Action Column Boundary Containment across ALL 5 Viewports (36 Rows, 1px Safety Margin)', async ({ page }) => {
    const { hubId, esId } = await resolveProjectIds(page);

    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);

      for (const pid of [hubId, esId]) {
        const expectedCount = pid === hubId ? 21 : 15;
        await page.goto(`${LOCAL_BASE_URL}/projects/${pid}`);
        await page.waitForLoadState('networkidle');
        await page.locator('[data-testid="view-month-btn"]').waitFor({ state: 'visible', timeout: 15000 });
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

        expect(actionChecks.length).toBe(expectedCount);
        for (const check of actionChecks) {
          expect(check.actionColRight).toBeLessThanOrEqual(check.leftPanelRight + 0.5);
          expect(check.actionColRight).toBeLessThanOrEqual(check.timelineLeft + 0.5);
          // Strict 1px safety margin with 0.5px subpixel tolerance
          expect(check.maxButtonRight).toBeLessThanOrEqual(check.timelineLeft - 0.5);
          expect(check.timelineOverlap).toBe(0);
        }
      }
    }
  });

  test('3. Comprehensive Assignee Popover Portal Elevation, Top Z-Index & Interactive Trigger Audit', async ({ page }) => {
    const { hubId } = await resolveProjectIds(page);
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="view-month-btn"]').waitFor({ state: 'visible', timeout: 15000 });
    await expandAllTaskGroups(page);

    // 1. Summary Chip Trigger
    const firstTaskSummary = page.locator('[data-testid^="task-assignee-summary-"]').first();
    await expect(firstTaskSummary).toBeVisible();

    const taskId = await firstTaskSummary.evaluate((el: HTMLElement) => {
      return el.getAttribute('data-testid')?.replace('task-assignee-summary-', '') || '';
    });

    await firstTaskSummary.click();
    const popover = page.locator(`[data-testid="task-assignee-popover-${taskId}"]`);
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Verify Portal Parent is overlay-root or body
    const portalParent = await popover.evaluate((el: HTMLElement) => el.parentElement?.id || el.parentElement?.tagName);
    expect(['overlay-root', 'BODY']).toContain(portalParent);

    // Verify position fixed, zIndex >= 100000, elementFromPoint top priority
    const popoverStyle = await popover.evaluate((el: HTMLElement) => {
      const comp = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(centerX, centerY);

      const items = Array.from(el.querySelectorAll<HTMLElement>('.space-y-2 > div'));
      const textContent = el.textContent || '';
      const hasPrimaryBadge = textContent.includes('주 담당');

      let totalPercent = 0;
      const percentMatches = textContent.match(/비중 (\d+)%/g) || [];
      percentMatches.forEach((m) => {
        const val = Number(m.replace('비중 ', '').replace('%', ''));
        totalPercent += val;
      });

      return {
        position: comp.position,
        zIndex: Number(comp.zIndex || 0),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        isTopElement: el.contains(topEl),
        itemCount: items.length,
        hasPrimaryBadge,
        totalPercent,
      };
    });

    expect(popoverStyle.position).toBe('fixed');
    expect(popoverStyle.zIndex).toBeGreaterThanOrEqual(100000);
    expect(popoverStyle.isTopElement).toBe(true);
    expect(popoverStyle.itemCount).toBeGreaterThanOrEqual(1);
    expect(popoverStyle.hasPrimaryBadge).toBe(true);
    expect(popoverStyle.totalPercent).toBeGreaterThanOrEqual(99);
    expect(popoverStyle.totalPercent).toBeLessThanOrEqual(101);

    // Test Escape key closes popover
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();

    // 2. Test +N (+1) More Button Trigger
    const moreBtn = page.locator('[data-testid^="task-assignee-more-"]').first();
    if (await moreBtn.isVisible().catch(() => false)) {
      const moreTaskId = await moreBtn.evaluate((el: HTMLElement) => {
        return el.getAttribute('data-testid')?.replace('task-assignee-more-', '') || '';
      });
      await moreBtn.click();
      const morePopover = page.locator(`[data-testid="task-assignee-popover-${moreTaskId}"]`);
      await expect(morePopover).toBeVisible();

      // Test Outside Click Closes Popover
      await page.mouse.click(10, 10);
      await expect(morePopover).not.toBeVisible();
    }

    // 3. Test Scroll Closes Popover
    await firstTaskSummary.click();
    await expect(popover).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect(popover).not.toBeVisible();

    // 4. Test Resize Closes Popover
    await firstTaskSummary.click();
    await expect(popover).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await expect(popover).not.toBeVisible();

    // 5. Test Popover State Transition for Another Task
    const summaries = page.locator('[data-testid^="task-assignee-summary-"]');
    if ((await summaries.count()) >= 3) {
      const summary0 = summaries.nth(0);
      const summary2 = summaries.nth(2);

      const tid0 = await summary0.evaluate((el: HTMLElement) => el.getAttribute('data-testid')?.replace('task-assignee-summary-', ''));
      const tid2 = await summary2.evaluate((el: HTMLElement) => el.getAttribute('data-testid')?.replace('task-assignee-summary-', ''));

      await summary0.click();
      await expect(page.locator(`[data-testid="task-assignee-popover-${tid0}"]`)).toBeVisible();

      // Close popover0
      await page.keyboard.press('Escape');
      await expect(page.locator(`[data-testid="task-assignee-popover-${tid0}"]`)).not.toBeVisible();

      // Open popover2
      await summary2.click();
      await expect(page.locator(`[data-testid="task-assignee-popover-${tid2}"]`)).toBeVisible();

      // Clean up
      await page.keyboard.press('Escape');
    }
  });

  test('4. Popover Viewport Boundary & Clipping Audit across ALL 5 Viewports (0 Clipping Errors)', async ({ page }) => {
    const { hubId } = await resolveProjectIds(page);

    for (const vp of ALL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${LOCAL_BASE_URL}/projects/${hubId}`);
      await page.waitForLoadState('networkidle');

      await page.locator('[data-testid="view-month-btn"]').waitFor({ state: 'visible', timeout: 15000 });
      await expandAllTaskGroups(page);

      const summaries = page.locator('[data-testid^="task-assignee-summary-"]');
      const count = await summaries.count();
      expect(count).toBeGreaterThan(0);

      // Audit popover for first, middle, and last task
      const indicesToTest = [0, Math.floor(count / 2), count - 1];

      for (const idx of indicesToTest) {
        const summary = summaries.nth(idx);
        await summary.scrollIntoViewIfNeeded();
        const taskId = await summary.evaluate((el: HTMLElement) => el.getAttribute('data-testid')?.replace('task-assignee-summary-', ''));

        await summary.click();
        const popover = page.locator(`[data-testid="task-assignee-popover-${taskId}"]`);
        await expect(popover).toBeVisible({ timeout: 5000 });

        const popoverRect = await popover.evaluate((el: HTMLElement) => {
          const rect = el.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        });

        // Strict 8px Viewport Padding Boundary Assertions
        expect(popoverRect.left).toBeGreaterThanOrEqual(8);
        expect(popoverRect.top).toBeGreaterThanOrEqual(8);
        expect(popoverRect.right).toBeLessThanOrEqual(vp.width - 8);
        expect(popoverRect.bottom).toBeLessThanOrEqual(vp.height - 8);

        await page.keyboard.press('Escape');
        await expect(popover).not.toBeVisible();
      }
    }
  });
});
