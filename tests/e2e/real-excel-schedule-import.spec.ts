// tests/e2e/real-excel-schedule-import.spec.ts
import { test, expect } from '@playwright/test';
import { assertMutationSafety } from './productionMutationGuard';

const QA_BASE_URL = (process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev').trim();
assertMutationSafety(QA_BASE_URL, 'real-excel-schedule-import');

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

test.describe('Real Excel Schedule Manifest Pre-flight QA Validation', () => {
  let createdProjectId = '';

  test.beforeAll(async () => {
    const runId = Date.now();
    // Create QA Project representing ES Program Development
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        name: `[QA-EXCEL-TEST-${runId}] ES 프로그램 개발 QA 검증`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.project?.id || prjJson.data?.id;

    // Create Representative Task (08-03 ~ 08-05)
    await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: '시스템 프로세스 및 업무 분석',
        start_date: '2026-08-03',
        end_date: '2026-08-05',
        worker_name: 'Thanh Phuong(탄 프엉)',
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
    }
  });

  test('Verify QA UI ScheduleBar rendering and F5 persistence for Excel representative task', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    const bar = page.locator(`[data-testid="gantt-schedule-bar"][aria-label*="시스템 프로세스 및 업무 분석"]`);
    await expect(bar).toBeVisible({ timeout: 15000 });

    const track = bar.locator('..');
    await expect(track).toBeVisible();
    const box = await track.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(0);
    }

    // F5 Persistence test
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissWorkerPromptModal(page);

    await expect(bar).toBeVisible();
  });
});
