import { test, expect } from '@playwright/test';

test.describe('Print Completed Project Progress & Date Rule Suite', () => {
  test('COMPLETED project outputs 100% planned and 100% actual progress without date fallback', async ({ page }) => {
    await page.route('**/api/workers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/holidays*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/overrides*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/api/projects*', async (route) => {
      const json = [
        {
          id: 'prj-completed-test-1',
          name: 'CONCOST-HUB 개발',
          name_ko: 'CONCOST-HUB 개발',
          name_vi: 'Phát triển CONCOST-HUB',
          status: 'COMPLETED',
          start_date: '2026-07-06',
          end_date: '2026-08-04',
          completed_at: '2026-08-04',
          planned_progress: 100,
          actual_progress: 100,
          schedule_state: 'COMPLETED',
        },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.route('**/api/projects/prj-completed-test-1/print-data*', async (route) => {
      const json = {
        project: {
          id: 'prj-completed-test-1',
          name: 'CONCOST-HUB 개발',
          name_ko: 'CONCOST-HUB 개발',
          name_vi: 'Phát triển CONCOST-HUB',
          status: 'COMPLETED',
          start_date: '2026-07-06',
          end_date: '2026-08-04',
          completed_at: '2026-08-04',
          planned_progress: 100,
          actual_progress: 100,
          schedule_state: 'COMPLETED',
        },
        tasks: [
          {
            id: 'task-1',
            project_id: 'prj-completed-test-1',
            task_name: 'Database Setup',
            start_date: '2026-07-06',
            end_date: '2026-07-15',
            schedule_status: 'SCHEDULED',
            schedule_state: 'COMPLETED',
            actual_progress: 100,
            completion_confirmed: 1,
          },
        ],
        taskGroups: [
          { id: 'tg-1', project_id: 'prj-completed-test-1', group_name: 'Core DB', sort_order: 1 },
        ],
        allocations: [],
        workers: [],
        holidays: [],
        overrides: [],
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    // 2. Open Print View Page
    await page.goto('/print-view?templateId=summary_a4&projectIds=prj-completed-test-1');
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify Progress metrics: 100% / 100%
    const progressEl = page.locator('div:has-text("예정 / 실제 공정률")');
    await expect(progressEl).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=100%').first()).toBeVisible();

    // 4. Verify Completed Date does NOT fall back to print date
    const completionInfo = page.locator('div:has-text("완료 정보")');
    await expect(completionInfo).toBeVisible();
    await expect(completionInfo).toContainText('2026-08-04');
  });
});
