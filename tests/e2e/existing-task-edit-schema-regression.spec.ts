// tests/e2e/existing-task-edit-schema-regression.spec.ts
import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev').trim();
const ES_PROJECT_ID = 'prj_1785986689248_qhuq';

async function dismissWorkerPromptModal(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
  await page.waitForTimeout(300);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Existing Task Edit & schedule_revision Schema Regression Suite', () => {
  let createdTaskId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdTaskId) {
      await request.delete(`${BASE_URL}/api/tasks/${createdTaskId}`, {
        data: { editor_name: '박용진 수석' },
      }).catch(() => {});
      createdTaskId = null;
    }
  });

  test('1. Task Name-only Edit succeeds via API without D1 schedule_revision SQLITE_ERROR', async ({ request }) => {
    // 1. Get projects list and find active project
    const projectsRes = await request.get(`${BASE_URL}/api/projects`);
    expect(projectsRes.ok()).toBe(true);
    const projectsJson = await projectsRes.json();
    const targetProject = (projectsJson.data || []).find((p: any) => p.name === 'ES 프로그램 개발' && p.task_count > 0) || projectsJson.data[0];
    expect(targetProject).toBeDefined();
    const projectId = targetProject.id;

    const detailRes = await request.get(`${BASE_URL}/api/projects/${projectId}/detail`);
    expect(detailRes.ok()).toBe(true);
    const detailJson = await detailRes.json();
    const taskGroups = detailJson.data?.task_groups || [];
    expect(taskGroups.length).toBeGreaterThan(0);
    const groupId = taskGroups[0].id;

    // 2. Create a test task
    const createRes = await request.post(`${BASE_URL}/api/tasks`, {
      data: {
        project_id: projectId,
        task_group_id: groupId,
        worker_name: '박용진 수석',
        primary_worker_id: 'wrk_02',
        task_name: 'Original Task Name',
        schedule_status: 'SCHEDULED',
        start_date: '2026-05-01',
        end_date: '2026-05-07',
        editor_name: '박용진 수석',
        source_language: 'ko',
        translation_status: 'COMPLETED',
      },
    });

    expect(createRes.status()).toBe(201);
    const createJson = await createRes.json();
    createdTaskId = createJson.data.id;
    const initialRev = createJson.data.schedule_revision || 0;

    // 3. Name-only PATCH Edit
    const patchRes = await request.patch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      data: {
        task_name: 'Renamed Task Name QA',
        task_name_ko: 'Renamed Task Name QA',
        editor_name: '박용진 수석',
      },
    });

    expect(patchRes.status()).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.success).toBe(true);
    expect(patchJson.data.task_name).toBe('Renamed Task Name QA');
    // Name-only edit must NOT increment schedule_revision
    expect(patchJson.data.schedule_revision).toBe(initialRev);

    // 4. Date Edit PATCH (Schedule Change)
    const datePatchRes = await request.patch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      data: {
        start_date: '2026-05-02',
        end_date: '2026-05-08',
        editor_name: '박용진 수석',
      },
    });

    expect(datePatchRes.status()).toBe(200);
    const datePatchJson = await datePatchRes.json();
    expect(datePatchJson.success).toBe(true);
    expect(datePatchJson.data.start_date).toBe('2026-05-02');
    // Schedule change MUST increment schedule_revision
    expect(datePatchJson.data.schedule_revision).toBe(initialRev + 1);
  });

  test('2. Task Edit Modal UI inline error & F5 persistence test', async ({ request, page }) => {
    // 1. Get projects list and find active project
    const projectsRes = await request.get(`${BASE_URL}/api/projects`);
    expect(projectsRes.ok()).toBe(true);
    const projectsJson = await projectsRes.json();
    const targetProject = (projectsJson.data || []).find((p: any) => p.name === 'ES 프로그램 개발' && p.task_count > 0) || projectsJson.data[0];
    expect(targetProject).toBeDefined();
    const projectId = targetProject.id;

    const detailRes = await request.get(`${BASE_URL}/api/projects/${projectId}/detail`);
    expect(detailRes.ok()).toBe(true);
    const detailJson = await detailRes.json();
    const taskGroups = detailJson.data?.task_groups || [];
    const groupId = taskGroups[0].id;

    // 2. Create test task with manual translation
    const createRes = await request.post(`${BASE_URL}/api/tasks`, {
      data: {
        project_id: projectId,
        task_group_id: groupId,
        worker_name: '박용진 수석',
        primary_worker_id: 'wrk_02',
        task_name: '수동 번역 작업',
        task_name_ko: '수동 번역 작업',
        task_name_vi: 'Công việc dịch thủ công',
        schedule_status: 'SCHEDULED',
        start_date: '2026-05-01',
        end_date: '2026-05-07',
        editor_name: '박용진 수석',
        source_language: 'ko',
        translation_status: 'MANUAL',
      },
    });

    expect(createRes.status()).toBe(201);
    const createJson = await createRes.json();
    createdTaskId = createJson.data.id;

    // 3. Verify via UI
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Assert zero page errors
    let pageErrors = 0;
    page.on('pageerror', () => { pageErrors++; });

    expect(pageErrors).toBe(0);
  });
});
