// tests/e2e/unscheduled-task.spec.ts
import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'unscheduled-task');

async function dismissWorkerPromptModal(page: any) {
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const yjwBtn = modal.locator('button:has-text("유종욱")').or(modal.locator('button')).first();
    if (await yjwBtn.isVisible().catch(() => false)) {
      await yjwBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Unscheduled (Backlog) Tasks E2E Verification Suite', () => {
  let createdProjectId = '';
  let unscheduledTaskId = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    // 1. Create QA Project
    const prjRes = await fetch(`${TEST_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        name: `[E2E-UNSCHEDULED-${runId}] 미정 작업 검증 프로젝트`,
        start_date: '2026-05-01',
        end_date: '2026-06-30',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;

    // 2. Create UNSCHEDULED Task via API
    const taskRes = await fetch(`${TEST_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '메뉴 링크 연결. Website: http://con-cost.com/',
        task_name_ko: '메뉴 링크 연결. Website: http://con-cost.com/(미정)',
        task_name_vi: 'Gắn link vào menu. Website: http://con-cost.com/(Chưa xác định)',
        schedule_status: 'UNSCHEDULED',
        start_date: null,
        end_date: null,
        worker_name: 'Thanh Phuong(탄 프엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    if (taskRes.status !== 201) {
      console.log('Task Create Error Status:', taskRes.status, await taskRes.text());
    }
    expect(taskRes.status).toBe(201);
    const taskJson: any = await taskRes.json();
    unscheduledTaskId = taskJson.id || taskJson.task?.id || taskJson.data?.id;
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${TEST_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
    }
  });

  test('Verify Unscheduled Task: Null Dates, Badge Visible, Zero ScheduleBar, F5 Persistence', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${TEST_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Unscheduled badge visible
    const badge = page.locator(`[data-testid="task-row-${unscheduledTaskId}"] [data-testid="unscheduled-task-badge"]`);
    await expect(badge).toBeVisible();

    // No schedule bar for this task
    const bar = page.locator(`[data-testid="gantt-schedule-bar-track-${unscheduledTaskId}"]`);
    await expect(bar).toHaveCount(0);

    // F5 Persistence check
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    await expect(badge).toBeVisible();
    await expect(bar).toHaveCount(0);
  });
});
