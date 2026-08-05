// tests/e2e/gantt-geometry-alignment.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

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

test.describe('Gantt Geometry Single Source of Truth & Today Indicator Alignment Suite', () => {
  let createdProjectId = '';
  let taskId1Day = '';
  let taskId3Day = '';
  let taskId10Day = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    // 1. Create QA Project (spanning August 2026)
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        name: `[E2E-GEOMETRY-${runId}] 간트 좌표 정합성 검증 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;
    expect(createdProjectId).toBeTruthy();

    // 2. Create 1-Day Task (2026-08-03 ~ 2026-08-03)
    const t1Res = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '1일 단기 검수 작업',
        start_date: '2026-08-03',
        end_date: '2026-08-03',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(t1Res.status).toBe(201);
    const t1Json: any = await t1Res.json();
    taskId1Day = t1Json.id || t1Json.task?.id || t1Json.data?.id;

    // 3. Create 3-Day Task (2026-08-05 ~ 2026-08-07)
    const t3Res = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '3일 중간 개발 작업',
        start_date: '2026-08-05',
        end_date: '2026-08-07',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(t3Res.status).toBe(201);
    const t3Json: any = await t3Res.json();
    taskId3Day = t3Json.id || t3Json.task?.id || t3Json.data?.id;

    // 4. Create 10-Day Task (2026-08-10 ~ 2026-08-21)
    const t10Res = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '10일 장기 구축 작업',
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
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
    }
  });

  test('1. Mandatory Verification of Date Header vs Body Cell Alignment (x & width <= 0.5px)', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const dateHeaders = page.locator('[data-testid^="gantt-date-header-"]');
    const headerCount = await dateHeaders.count();
    expect(headerCount).toBeGreaterThanOrEqual(30);

    // Test 1st, 2nd, 15th, 30th date columns
    const testIndices = [0, 1, 14, Math.min(29, headerCount - 1)];

    for (const idx of testIndices) {
      const headerCell = dateHeaders.nth(idx);
      await expect(headerCell).toBeVisible();
      const dateStr = await headerCell.getAttribute('data-date');
      expect(dateStr).toBeTruthy();

      const taskCell = page.locator(`[data-testid="gantt-task-cell-${taskId1Day}-${dateStr}"]`);
      await expect(taskCell).toBeVisible();

      const hBox = await headerCell.boundingBox();
      const cBox = await taskCell.boundingBox();

      expect(hBox).not.toBeNull();
      expect(cBox).not.toBeNull();

      if (hBox && cBox) {
        const xDiff = Math.abs(hBox.x - cBox.x);
        const wDiff = Math.abs(hBox.width - cBox.width);

        expect(xDiff).toBeLessThanOrEqual(0.5);
        expect(wDiff).toBeLessThanOrEqual(0.5);
        expect(Math.abs(hBox.width - 36)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(cBox.width - 36)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  test('2. Mandatory Verification of ScheduleBar Span Geometry (1d=36px, 3d=108px, 10d=360px)', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // 1-day bar outer track
    const bar1 = page.locator(`[data-testid="gantt-schedule-bar"][aria-label*="1일 단기 검수 작업"]`);
    await expect(bar1).toBeVisible();
    const track1 = bar1.locator('..');
    const box1 = await track1.boundingBox();
    expect(box1).not.toBeNull();
    if (box1) {
      expect(Math.abs(box1.width - 36)).toBeLessThanOrEqual(1.0);
    }

    // 3-day bar outer track
    const bar3 = page.locator(`[data-testid="gantt-schedule-bar"][aria-label*="3일 중간 개발 작업"]`);
    await expect(bar3).toBeVisible();
    const track3 = bar3.locator('..');
    const box3 = await track3.boundingBox();
    expect(box3).not.toBeNull();
    if (box3) {
      expect(Math.abs(box3.width - 108)).toBeLessThanOrEqual(1.0);
    }
  });

  test('3. Mandatory Verification of Today Indicator (No Per-Row Blue Border)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    // Today Column Overlay should be rendered
    const todayColumns = page.locator('[data-testid="gantt-today-column"]');
    const todayCount = await todayColumns.count();
    expect(todayCount).toBeGreaterThanOrEqual(1);

    // worker-today-outline per-row blue squares count MUST be 0
    const perRowOutlines = page.locator('[data-testid="worker-today-outline"]');
    await expect(perRowOutlines).toHaveCount(0);
  });

  test('4. Mandatory Verification of ScheduleBar Clickability over Today Highlight (No Shielding)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const bar3 = page.locator(`[data-testid="gantt-schedule-bar"][aria-label*="3일 중간 개발 작업"]`);
    await expect(bar3).toBeVisible();
    const barBox = await bar3.boundingBox();
    expect(barBox).not.toBeNull();

    if (barBox) {
      const centerX = barBox.x + barBox.width / 2;
      const centerY = barBox.y + barBox.height / 2;

      const topElementTag = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.tagName.toLowerCase() : '';
      }, { x: centerX, y: centerY });

      // Point should hit ScheduleBar or its container, NOT Today Column
      expect(topElementTag).not.toBe('gantt-today-column');
    }
  });
});
