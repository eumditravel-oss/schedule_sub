import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
const QA_BASE_URL = TEST_BASE_URL;
assertMutationSafety(TEST_BASE_URL, 'upcoming-progress-ux');

async function dismissAllModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const modal = page.locator('[data-testid="calendar-manager-modal"], [data-testid="project-delete-confirm-modal"]').first();
    if (await modal.isVisible({ timeout: 300 }).catch(() => false)) {
      const closeBtn = modal.locator('button').first();
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

test.describe('Upcoming Task Pre-Start Progress UX Integration Suite', () => {
  let projectId = '';
  let taskId = '';
  const runId = Date.now();

  test.beforeAll(async () => {
    // Create a project starting far in the future (2031-10-01 ~ 2031-10-31)
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-UPCOMING-${runId}] Pre-Start UX Project`,
        start_date: '2031-10-01',
        end_date: '2031-10-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    projectId = prjJson.id || prjJson.data?.id;

    // Create an UPCOMING AUTO_TIME task
    const tskRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: projectId,
        task_name: `UPCOMING_TASK_${runId}`,
        primary_worker_id: 'wrk_02',
        worker_name: '박용진 수석',
        start_date: '2031-10-10',
        end_date: '2031-10-15',
        progress_mode: 'AUTO_TIME',
        schedule_status: 'SCHEDULED',
        editor_name: '박용진 수석',
      }),
    });
    expect(tskRes.status).toBe(201);
    const tskJson: any = await tskRes.json();
    taskId = tskJson.id || tskJson.data?.id;
  });

  test.afterAll(async () => {
    if (projectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
      }).catch(() => {});
    }
  });

  test('Verify UPCOMING Task Displays 0% Progress, UPCOMING State, Schedule Bar, and Pre-Start Badge', async ({ page }) => {
    // Direct Detail API Check
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectId}/detail`);
    expect(detailRes.status).toBe(200);
    const detailJson: any = await detailRes.json();
    const tasks = detailJson.tasks || detailJson.data?.tasks || [];
    const task = tasks.find((t: any) => t.id === taskId);
    expect(task).toBeTruthy();
    expect(task.actual_progress).toBe(0);
    expect(task.schedule_state).toBe('UPCOMING');

    // UI Render Check
    await page.goto(`${QA_BASE_URL}/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Verify task row and upcoming badge
    const taskRow = page.locator(`[data-testid="task-row-${taskId}"]`);
    await expect(taskRow).toBeVisible({ timeout: 10000 });

    const upcomingBadge = page.locator(`[data-testid="task-row-${taskId}"] [data-testid="upcoming-task-badge"]`);
    await expect(upcomingBadge).toBeVisible();
    await expect(upcomingBadge).toContainText('시작 전');

    // Verify Schedule Bar
    const scheduleBarTrack = page.locator(`[data-testid="gantt-schedule-bar-track-${taskId}"]`);
    await expect(scheduleBarTrack).toBeVisible();
  });
});
