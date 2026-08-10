import { test, expect } from '@playwright/test';

test.describe('Project Start-Date Sorting Contract Suite (Addendum G)', () => {
  test('Projects are sorted strictly by start_date DESC regardless of ACTIVE or COMPLETED status', async ({ page }) => {
    await page.route('**/api/workers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'wrk_01', name: '박용진 수석', is_active: 1, access_role: 'EDITOR' }]) });
    });
    await page.route('**/api/calendar/holidays*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/calendar/overrides*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/tasks*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Intercept GET /api/projects
    await page.route('**/api/projects*', async (route) => {
      const json = [
        {
          id: 'p1',
          name: 'GROUPWARE - 그룹웨어 시스템 개발',
          name_ko: 'GROUPWARE - 그룹웨어 시스템 개발',
          status: 'ACTIVE',
          start_date: '2026-08-05',
          end_date: '2026-11-10',
        },
        {
          id: 'p2',
          name: 'CONCOST-HUB 개발',
          name_ko: 'CONCOST-HUB 개발',
          status: 'COMPLETED',
          start_date: '2026-07-06',
          end_date: '2026-08-04',
          completed_at: '2026-08-04',
        },
        {
          id: 'p3',
          name: '웹개발작업',
          name_ko: '웹개발작업',
          status: 'COMPLETED',
          start_date: '2026-06-23',
          end_date: '2026-07-03',
          completed_at: '2026-08-04',
        },
        {
          id: 'p4',
          name: 'ES 프로그램 개발',
          name_ko: 'ES 프로그램 개발',
          status: 'COMPLETED',
          start_date: '2026-05-07',
          end_date: '2026-06-22',
          completed_at: '2026-08-04',
        },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.goto('/projects');
    await page.waitForLoadState('domcontentloaded');

    // Click ALL tab if available or check default list
    const allTab = page.locator('button:has-text("전체"), button:has-text("Tất cả")');
    if (await allTab.isVisible()) {
      await allTab.click();
    }

    // Verify DOM order: GROUPWARE (08-05) -> CONCOST-HUB (07-06) -> 웹개발작업 (06-23) -> ES 프로그램 개발 (05-07)
    const projectCards = page.locator('[data-testid^="project-card-"], [data-testid^="project-row-"]');
    await expect(projectCards.nth(0)).toContainText('GROUPWARE');
    await expect(projectCards.nth(1)).toContainText('CONCOST-HUB');
    await expect(projectCards.nth(2)).toContainText('웹개발작업');
    await expect(projectCards.nth(3)).toContainText('ES 프로그램 개발');
  });
});
