// tests/e2e/workforce-allocation-history.spec.ts
import { test, expect } from '@playwright/test';

const QA_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('P1 Workforce Allocation Change Ledger & History UI E2E Suite', () => {
  test('Verify Allocation History API logging, filtering, and History Tab rendering', async ({ request, page }) => {
    // 1. Fetch QA projects and workers
    const prjRes = await request.get(`${QA_URL}/api/projects?status=ACTIVE`);
    expect(prjRes.ok()).toBe(true);
    const prjs = await prjRes.json();
    const testPrj = (prjs.data || prjs)[0];

    const wrkRes = await request.get(`${QA_URL}/api/workers`);
    expect(wrkRes.ok()).toBe(true);
    const wrks = await wrkRes.json();
    const testWrk = (wrks.data || wrks).find((w: any) => w.access_role === 'EDITOR' && w.name !== 'CEO');

    if (testPrj && testWrk) {
      // 2. Put allocation change via API
      const putRes = await request.put(`${QA_URL}/api/projects/${testPrj.id}/worker-allocations`, {
        headers: { 'x-editor-name': 'Park Yongjin' },
        data: {
          allocations: [{ worker_id: testWrk.id, allocation_percent: 70, note: 'E2E History Test Note' }],
        },
      });
      expect(putRes.ok()).toBe(true);

      // 3. Fetch Allocation History API
      const histRes = await request.get(`${QA_URL}/api/workforce/allocation-history?project_id=${testPrj.id}`);
      expect(histRes.ok()).toBe(true);
      const histLogs = await histRes.json();
      expect(Array.isArray(histLogs)).toBe(true);
      expect(histLogs.length).toBeGreaterThan(0);
      const firstLog = histLogs[0];
      expect(firstLog.project_id).toBe(testPrj.id);
      expect(firstLog.change_type).toBeDefined();
    }

    // 4. UI Verification: Open Workforce Capacity page, click History Tab
    await page.goto(`${QA_URL}/capacity`);
    await page.evaluate(() => {
      localStorage.setItem('concost_worker_id', 'wrk_park');
    });
    await page.reload();

    const historyTabBtn = page.locator('button:has-text("변경 이력"), button:has-text("Lịch sử")').first();
    await expect(historyTabBtn).toBeVisible({ timeout: 5000 });
    await historyTabBtn.click();

    // Verify History Table Presence
    const tableHeader = page.locator('th:has-text("변경 일시"), th:has-text("유형")').first();
    await expect(tableHeader).toBeVisible();

    // Verify Immutable Audit Log indicator
    const auditIndicator = page.locator('text=Immutable Audit Log Enabled').first();
    await expect(auditIndicator).toBeVisible();
  });
});
