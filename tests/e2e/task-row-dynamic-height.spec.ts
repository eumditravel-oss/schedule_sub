import { test, expect } from '@playwright/test';

test.describe('Dynamic Gantt Row Height Suite', () => {
  test('Task title with long text wraps onto multiple lines and left/right cells match dynamic height', async ({ page }) => {
    await page.route('**/api/workers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'wrk_01', name: 'Manh Cuong', is_active: 1, access_role: 'EDITOR' }]) });
    });
    await page.route('**/api/calendar/holidays*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/overrides*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Intercept project detail API
    await page.route('**/api/projects/prj-dynamic-height*', async (route) => {
      const json = {
        id: 'prj-dynamic-height',
        name: 'Dynamic Height Verification Project',
        name_ko: 'Dynamic Height Verification Project',
        status: 'ACTIVE',
        start_date: '2026-08-01',
        end_date: '2026-08-30',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.route('**/api/tasks*', async (route) => {
      const json = [
        {
          id: 't-long-name-1',
          project_id: 'prj-dynamic-height',
          task_name: '아주 긴 작업 이름 테스트 - 한국어 베트남어 다국어 공정명 텍스트 줄바꿈 및 Gantt 좌우 영역 높이 동기화 검증용 세부 작업',
          task_name_ko: '아주 긴 작업 이름 테스트 - 한국어 베트남어 다국어 공정명 텍스트 줄바꿈 및 Gantt 좌우 영역 높이 동기화 검증용 세부 작업',
          start_date: '2026-08-01',
          end_date: '2026-08-15',
          schedule_status: 'SCHEDULED',
          schedule_state: 'IN_PROGRESS',
          actual_progress: 50,
          primary_worker_id: 'w-1',
          worker_name: 'Manh Cuong',
        },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.goto('/projects/prj-dynamic-height');
    await page.waitForLoadState('domcontentloaded');

    // Locate left panel cell and right timeline cell
    const leftCell = page.locator('[data-testid="task-left-panel-t-long-name-1"]');
    const rightCell = page.locator('[data-testid="task-timeline-t-long-name-1"]');

    await expect(leftCell).toBeVisible({ timeout: 10000 });
    await expect(rightCell).toBeVisible();

    // Check bounding boxes
    const leftBox = await leftCell.boundingBox();
    const rightBox = await rightCell.boundingBox();

    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();

    if (leftBox && rightBox) {
      // Row height expanded beyond 34px compact minimum
      expect(leftBox.height).toBeGreaterThanOrEqual(34);
      // Heights match within 0.5px
      expect(Math.abs(leftBox.height - rightBox.height)).toBeLessThanOrEqual(0.5);
    }
  });
});
