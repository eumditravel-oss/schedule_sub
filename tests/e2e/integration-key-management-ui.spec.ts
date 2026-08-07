import { test, expect } from '@playwright/test';

test.describe('P0 Integration API Key Management & QA Bearer Token Suite', () => {
  let createdKeyId: string | null = null;
  let rawToken: string | null = null;

  test('Verify Park Yongjin integration permissions and create/authenticate API Key on QA', async ({ page }) => {
    // 1. Fetch Workers dynamically to verify Park Yongjin's ID and permissions
    const workersRes = await page.request.get('/api/workers');
    expect(workersRes.status()).toBe(200);
    const workers: any[] = (await workersRes.json()).data || [];

    const pyj = workers.find((w) => w.name === '박용진 수석');
    expect(pyj).toBeDefined();
    expect(pyj.is_active).toBe(1);
    expect(Number(pyj.can_manage_integrations)).toBe(1);

    await page.addInitScript((worker) => {
      localStorage.setItem('schedule_current_worker_id', worker.id);
      localStorage.setItem('schedule_current_worker_name', worker.name);
    }, pyj);

    await page.setViewportSize({ width: 1280, height: 720 });

    // Listen for /api/workers response before clicking openApiBtn
    const workersPromise = page.waitForResponse((r) => r.url().includes('/api/workers') && r.status() === 200);
    await page.goto('/projects');
    await workersPromise;
    await page.waitForTimeout(500);

    // 2. Open Integration Modal
    const openApiBtn = page.locator('[data-testid="open-integration-api-btn"]');
    await expect(openApiBtn).toBeVisible({ timeout: 10000 });
    await openApiBtn.click();

    const modal = page.locator('[data-testid="integration-manager-modal"]');
    await expect(modal).toBeVisible();

    // 3. Verify Create API Key button is visible & enabled
    const createBtn = page.locator('[data-testid="create-api-key-btn"]');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await expect(createBtn).toBeEnabled();

    // 4. Fill form to generate QA test key and submit via click
    await createBtn.click();
    const keyNameInput = page.locator('input[placeholder="e.g. Codex CLI Sync"]');
    await expect(keyNameInput).toBeVisible();
    await keyNameInput.fill('QA E2E Integration Key');
    await expect(keyNameInput).toHaveValue('QA E2E Integration Key');

    const submitBtn = page.locator('[data-testid="submit-create-key-btn"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 5. Verify success alert & copy raw token
    const rawTokenContainer = page.locator('[data-testid="generated-raw-token"]');
    await expect(rawTokenContainer).toBeVisible({ timeout: 15000 });
    rawToken = (await rawTokenContainer.innerText()).trim();
    expect(rawToken).toBeTruthy();
    expect(rawToken.startsWith('sched_live_')).toBe(true);

    // 6. Test Bearer Authentication via Integration REST API: GET /api/integrations/v1/projects
    const bearerProjectsRes = await page.request.get('/api/integrations/v1/projects', {
      headers: {
        Authorization: `Bearer ${rawToken}`,
      },
    });
    expect(bearerProjectsRes.status()).toBe(200);

    // 7. Cleanup: Revoke generated QA key via admin API
    const listRes = await page.request.get('/api/admin/integration-keys', {
      headers: {
        'x-editor-name': '박용진 수석',
      },
    });
    const keys: any[] = await listRes.json();
    const testKey = keys.find((k) => k.name === 'QA E2E Integration Key');
    if (testKey) {
      createdKeyId = testKey.id;
      const deleteRes = await page.request.delete(`/api/admin/integration-keys/${createdKeyId}`, {
        headers: {
          'x-editor-name': '박용진 수석',
        },
      });
      expect(deleteRes.status()).toBe(200);
    }
  });
});
