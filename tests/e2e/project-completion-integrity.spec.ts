// tests/e2e/project-completion-integrity.spec.ts
import { test, expect } from '@playwright/test';

const QA_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('P0 Project Completion Atomic Transaction & Integrity E2E Suite', () => {
  test('Verify Strict Mode 409, Atomic Complete All Transaction, and 0 Inconsistency Risks', async ({ request, page }) => {
    // 1. Create Test Project on QA
    const prjRes = await request.post(`${QA_URL}/api/projects`, {
      headers: { 'x-editor-name': 'Park Yongjin' },
      data: {
        name: 'QA Project Completion Transaction Test',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress_mode: 'AUTO_TIME',
      },
    });
    expect(prjRes.ok()).toBe(true);
    const prjJson = await prjRes.json();
    const projectId = prjJson.data.id;

    // 2. Create 3 Incomplete Tasks
    for (let i = 1; i <= 3; i++) {
      const taskRes = await request.post(`${QA_URL}/api/tasks`, {
        headers: { 'x-editor-name': 'Park Yongjin' },
        data: {
          project_id: projectId,
          task_name: `Completion Test Task ${i}`,
          start_date: '2026-08-01',
          end_date: '2026-08-10',
          progress_mode: 'AUTO_TIME',
          progress: 50,
          completion_confirmed: 0,
        },
      });
      expect(taskRes.ok()).toBe(true);
    }

    // 3. Test STRICT Mode Complete API -> Must return 409 PROJECT_HAS_INCOMPLETE_TASKS
    const strictRes = await request.post(`${QA_URL}/api/projects/${projectId}/complete`, {
      headers: { 'x-editor-name': 'Park Yongjin' },
      data: { mode: 'STRICT' },
    });
    expect(strictRes.status()).toBe(409);
    const strictJson = await strictRes.json();
    expect(strictJson.error?.code).toBe('PROJECT_HAS_INCOMPLETE_TASKS');
    expect(strictJson.error?.details?.incomplete_tasks).toBe(3);

    // 4. Test COMPLETE_ALL Mode Complete API -> Single Atomic Transaction
    const completeRes = await request.post(`${QA_URL}/api/projects/${projectId}/complete`, {
      headers: { 'x-editor-name': 'Park Yongjin' },
      data: { mode: 'COMPLETE_ALL' },
    });
    expect(completeRes.status()).toBe(200);
    const completeJson = await completeRes.json();
    expect(completeJson.data?.status).toBe('COMPLETED');
    expect(completeJson.data?.completed_tasks).toBe(3);

    // 5. Verify Server Postcondition: All tasks confirmed 1 and 100% progress
    const detailRes = await request.get(`${QA_URL}/api/projects/${projectId}/detail`);
    expect(detailRes.ok()).toBe(true);
    const detailJson = await detailRes.json();
    expect(detailJson.data?.project?.status).toBe('COMPLETED');
    const tasks = detailJson.data?.tasks || [];
    expect(tasks.length).toBe(3);
    tasks.forEach((t: any) => {
      expect(Number(t.completion_confirmed)).toBe(1);
      expect(Number(t.actual_progress ?? t.progress)).toBe(100);
    });

    // 6. UI Verification: Load QA page, select Park Yongjin worker, verify Completed project badge
    await page.goto(`${QA_URL}/projects`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const workerSelect = page.locator('header select').first();
    if (await workerSelect.isVisible()) {
      await workerSelect.selectOption({ label: 'Park Yongjin (박용진)' });
    }

    // Navigate to COMPLETED tab
    const completedTab = page.locator('button:has-text("완료")').first();
    if (await completedTab.isVisible()) {
      await completedTab.click();
    }

    // Verify Project row presence
    const prjCard = page.locator(`text=${prjJson.data.name}`).first();
    await expect(prjCard).toBeVisible({ timeout: 5000 });

    // Clean up QA test project
    await request.delete(`${QA_URL}/api/projects/${projectId}`, {
      headers: { 'x-editor-name': 'Park Yongjin' },
    });
  });
});
