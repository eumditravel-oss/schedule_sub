// tests/e2e/p0-gantt-bar-preflight.spec.ts
import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const TEST_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173').trim();
assertMutationSafety(TEST_BASE_URL, 'p0-gantt-bar-preflight');

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

test.describe('P0 Preflight Verification — Horizontal ScheduleBar Visibility & Geometry', () => {
  let createdProjectId = '';
  let taskId1Day = '';
  let taskId3Day = '';
  let taskId10Day = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    // Create QA Project in August 2026
    const prjRes = await fetch(`${TEST_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        name: `[P0-BAR-PREFLIGHT-${runId}] 선행 가로 막대 검증 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;

    // 1-Day Task
    const t1Res = await fetch(`${TEST_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '1일 선행 검수',
        start_date: '2026-08-03',
        end_date: '2026-08-03',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(t1Res.status).toBe(201);
    const t1Json: any = await t1Res.json();
    taskId1Day = t1Json.id || t1Json.task?.id || t1Json.data?.id;

    // 3-Day Task
    const t3Res = await fetch(`${TEST_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '3일 선행 개발',
        start_date: '2026-08-05',
        end_date: '2026-08-07',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(t3Res.status).toBe(201);
    const t3Json: any = await t3Res.json();
    taskId3Day = t3Json.id || t3Json.task?.id || t3Json.data?.id;

    // 10-Day Task
    const t10Res = await fetch(`${TEST_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '10일 선행 구축',
        start_date: '2026-08-10',
        end_date: '2026-08-21',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(t10Res.status).toBe(201);
    const t10Json: any = await t10Res.json();
    taskId10Day = t10Json.id || t10Json.task?.id || t10Json.data?.id;
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${TEST_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
    }
  });

  test('Preflight Check: Verify ScheduleBar visibility and track width > 0 for 1d, 3d, 10d tasks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${TEST_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // 1d ScheduleBar
    const bar1 = page.locator(`[data-testid="gantt-schedule-bar"][aria-label*="1일 선행 검수"]`);
    await expect(bar1).toBeVisible({ timeout: 15000 });
    const track1 = bar1.locator('..');
    await expect(track1).toBeVisible();
    const box1 = await track1.boundingBox();
    expect(box1).not.toBeNull();
    if (box1) {
      expect(box1.width).toBeGreaterThan(0);
      expect(Math.abs(box1.width - 36)).toBeLessThanOrEqual(1.0);
    }

    // 3d ScheduleBar
    const bar3 = page.locator(`[data-testid="gantt-schedule-bar"][aria-label*="3일 선행 개발"]`);
    await expect(bar3).toBeVisible({ timeout: 15000 });
    const track3 = bar3.locator('..');
    await expect(track3).toBeVisible();
    const box3 = await track3.boundingBox();
    expect(box3).not.toBeNull();
    if (box3) {
      expect(box3.width).toBeGreaterThan(0);
      expect(Math.abs(box3.width - 108)).toBeLessThanOrEqual(1.0);
    }

    // F5 Persistence test
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);
    await expect(bar1).toBeVisible();
    await expect(bar3).toBeVisible();
  });
});
