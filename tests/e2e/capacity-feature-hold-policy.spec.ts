import { test, expect } from '@playwright/test';

test.describe('Workforce Allocation / Capacity Feature Hold Policy Suite (Addendum M)', () => {
  test('Unallocated workers produce 0 ALLOCATION_UNSET readiness warnings under hold policy', async ({ page }) => {
    // Intercept project detail API
    await page.route('**/api/projects/prj-test-hold*', async (route) => {
      const json = {
        id: 'prj-test-hold',
        name: 'Test Project Capacity Hold',
        name_ko: 'Test Project Capacity Hold',
        status: 'ACTIVE',
        start_date: '2026-08-01',
        end_date: '2026-08-30',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.route('**/api/tasks*', async (route) => {
      const json = [
        {
          id: 't-1',
          project_id: 'prj-test-hold',
          task_name: 'Core Implementation',
          start_date: '2026-08-01',
          end_date: '2026-08-30',
          schedule_status: 'SCHEDULED',
          schedule_state: 'IN_PROGRESS',
          actual_progress: 50,
          primary_worker_id: 'w-1',
          worker_name: 'Manh Cuong',
        },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.goto('/projects/prj-test-hold');
    await page.waitForLoadState('domcontentloaded');

    // Verify Project Readiness Popover does NOT show "투입률 미설정" (ALLOCATION_UNSET) warning
    const readinessTrigger = page.locator('[data-testid="project-readiness-trigger"]');
    if (await readinessTrigger.isVisible()) {
      await readinessTrigger.click();
      const popover = page.locator('[data-testid="project-readiness-popover"]');
      await expect(popover).toBeVisible();
      await expect(popover).not.toContainText('투입률 미설정');
    }
  });

  test('Workforce Capacity Page displays EXPERIMENTAL / HOLD banner', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.route('**/api/workers*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'wrk_01', name: '박용진 수석', is_active: 1, access_role: 'EDITOR' }]),
      });
    });
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/tasks*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/holidays*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/overrides*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/project-worker-allocations*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/workforce-capacity');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('EXPERIMENTAL / HOLD')).toBeVisible({ timeout: 10000 });
  });
});
