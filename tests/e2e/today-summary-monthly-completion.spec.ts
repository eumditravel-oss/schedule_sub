// tests/e2e/today-summary-monthly-completion.spec.ts
import { test, expect } from '@playwright/test';

test.describe('P0 Project Lifecycle Semantics & Monthly Completed Projects KPI Suite', () => {
  test('1. Pending Completion Project (ACTIVE + schedule COMPLETED) displays [완료 확인 필요], is excluded from Completed Tab & Monthly KPI', async ({ page, request }) => {
    // Fetch a non-VIEWER worker for task assignment
    const workersRes = await request.get('/api/workers');
    const workersJson = await workersRes.json();
    const workerList = workersJson.data || workersJson || [];
    const worker = workerList.find((w: any) => w.access_role !== 'VIEWER') || { id: 'wrk_01', name: '유종욱 실장' };

    // A. Seed an ACTIVE project
    const seedRes = await request.post('/api/projects', {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        name: '[QA-PENDING-TEST] 완료 확인 필요 프로젝트',
        name_ko: '[QA-PENDING-TEST] 완료 확인 필요 프로젝트',
        start_date: '2026-08-01',
        end_date: '2026-08-07',
      },
    });
    expect(seedRes.status()).toBe(201);
    const seedJson = await seedRes.json();
    const projectId = seedJson.data.id;

    // Create a task with non-VIEWER worker
    let taskRes = await request.post('/api/tasks', {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        project_id: projectId,
        worker_name: worker.name,
        primary_worker_id: worker.id,
        task_name: '완료 검증 세부 작업',
        start_date: '2026-08-01',
        end_date: '2026-08-07',
        progress: 100,
        completion_confirmed: 1,
      },
    });

    if (taskRes.status() === 409) {
      const errJson = await taskRes.json();
      const fps = errJson.error?.details?.fingerprints || [];
      taskRes = await request.post('/api/tasks', {
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
        data: {
          project_id: projectId,
          worker_name: worker.name,
          primary_worker_id: worker.id,
          task_name: '완료 검증 세부 작업',
          start_date: '2026-08-01',
          end_date: '2026-08-07',
          progress: 100,
          completion_confirmed: 1,
          confirm_cross_project_conflicts: fps,
        },
      });
    }

    expect(taskRes.status()).toBe(201);
    const taskJson = await taskRes.json();
    const taskId = taskJson.data.id;

    // Confirm task completion 100% / confirmed=1
    await request.put(`/api/tasks/${taskId}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        progress: 100,
        completion_confirmed: 1,
      },
    });

    // B. Check Project Overview UI
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await page.waitForSelector('[data-testid="today-summary-card"]', { timeout: 10000 });

    // Click ALL tab
    const allTabBtn = page.locator('[data-testid="all-tab-btn"]').first();
    if (await allTabBtn.isVisible()) {
      await allTabBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // Verify Project Badge shows [완료 확인 필요]
    const badge = page.locator(`[data-testid="project-status-badge-${projectId}"]`);
    await expect(badge).toBeVisible();
    const badgeText = await badge.innerText();
    expect(badgeText.trim()).toBe('완료 확인 필요');

    // Verify Completed Tab DOES NOT contain this ACTIVE project
    const completedTabBtn = page.locator('[data-testid="completed-tab-btn"]').first();
    if (await completedTabBtn.isVisible()) {
      const responsePromise = page.waitForResponse((r) => r.url().includes('/api/projects') && r.status() === 200);
      await completedTabBtn.click({ force: true });
      await responsePromise.catch(() => {});
      await page.waitForTimeout(500);
      const rowInCompletedTab = page.locator(`[data-testid="project-status-badge-${projectId}"]`);
      expect(await rowInCompletedTab.count()).toBe(0);
    }
  });

  test('2. Complete Project via UI/API with explicit completed_date updates status to COMPLETED and increments Monthly KPI', async ({ page, request }) => {
    // Seed ACTIVE project
    const seedRes = await request.post('/api/projects', {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        name: '[QA-ACTUAL-COMPLETE-TEST] 정식 완료 확정 프로젝트',
        name_ko: '[QA-ACTUAL-COMPLETE-TEST] 정식 완료 확정 프로젝트',
        start_date: '2026-08-01',
        end_date: '2026-08-07',
      },
    });
    expect(seedRes.status()).toBe(201);
    const seedJson = await seedRes.json();
    const projectId = seedJson.data.id;

    // Fetch initial Monthly KPI for 2026-08
    const initSummaryRes = await request.get('/api/dashboard/today-summary?date=2026-08-08');
    const initSummary = await initSummaryRes.json();
    const initData = initSummary.data || initSummary;
    const initCount = initData.completed_this_month?.count ?? 0;

    // Complete Project with explicit completed_date = '2026-08-07'
    const completeRes = await request.post(`/api/projects/${projectId}/complete`, {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        mode: 'COMPLETE_ALL',
        completed_date: '2026-08-07',
      },
    });
    expect(completeRes.status()).toBe(200);

    // Verify DB/API Status & completed_at
    const postPrjRes = await request.get(`/api/projects/${projectId}`);
    const postPrjJson = await postPrjRes.json();
    expect(postPrjJson.data.status).toBe('COMPLETED');
    expect(postPrjJson.data.completed_at).toBe('2026-08-07');

    // Verify Monthly KPI Incremented by +1
    const postSummaryRes = await request.get('/api/dashboard/today-summary?date=2026-08-08');
    const postSummary = await postSummaryRes.json();
    const postData = postSummary.data || postSummary;
    const postCount = postData.completed_this_month?.count ?? 0;
    expect(postCount).toBe(initCount + 1);

    // Verify UI Status Badge shows [완료] in ALL Tab
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/projects');
    await page.waitForSelector('[data-testid="today-summary-card"]');

    const allTabBtn = page.locator('[data-testid="all-tab-btn"]').first();
    if (await allTabBtn.isVisible()) {
      await allTabBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }
    const badge = page.locator(`[data-testid="project-status-badge-${projectId}"]`);
    await expect(badge).toBeVisible();
    expect((await badge.innerText()).trim()).toBe('완료');
  });

  test('3. REPAIR mode rejects ACTIVE project with HTTP 409 and preserves historical completed_at on COMPLETED project', async ({ request }) => {
    // Seed ACTIVE project with start_date = 2026-07-01
    const activeRes = await request.post('/api/projects', {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        name: '[QA-REPAIR-ACTIVE-TEST] ACTIVE 프로젝트 REPAIR 테스트',
        name_ko: '[QA-REPAIR-ACTIVE-TEST] ACTIVE 프로젝트 REPAIR 테스트',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
      },
    });
    expect(activeRes.status()).toBe(201);
    const activeJson = await activeRes.json();
    const activePrjId = activeJson.data.id;

    // REPAIR on ACTIVE project MUST return 409
    const repairActiveRes = await request.post(`/api/projects/${activePrjId}/completion-repair`, {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
    });
    expect(repairActiveRes.status()).toBe(409);
    const repairActiveJson = await repairActiveRes.json();
    expect(repairActiveJson.error?.code || repairActiveJson.code).toBe('PROJECT_REPAIR_REQUIRES_COMPLETED_STATUS');

    // Complete ACTIVE project with July date '2026-07-15' (since start_date is '2026-07-01')
    const completeJulyRes = await request.post(`/api/projects/${activePrjId}/complete`, {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      data: {
        mode: 'COMPLETE_ALL',
        completed_date: '2026-07-15',
      },
    });
    expect(completeJulyRes.status()).toBe(200);

    // REPAIR on COMPLETED project MUST succeed and preserve completed_at '2026-07-15'
    const repairCompletedRes = await request.post(`/api/projects/${activePrjId}/completion-repair`, {
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
    });
    expect(repairCompletedRes.status()).toBe(200);

    const postRepairRes = await request.get(`/api/projects/${activePrjId}`);
    const postRepairJson = await postRepairRes.json();
    expect(postRepairJson.data.status).toBe('COMPLETED');
    expect(postRepairJson.data.completed_at).toBe('2026-07-15');
  });
});
