import { test, expect } from '@playwright/test';

test.use({
  baseURL: 'https://concost-dev-scheduler-qa.eumditravel.workers.dev',
  extraHTTPHeaders: { 'x-editor-name': encodeURIComponent('박용진 수석') },
});

test.describe('Task V2 Support & Assignment Normalization Suite', () => {
  const createdTaskIds: string[] = [];
  let testProjectId: string = '';
  let activeEditors: any[] = [];

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_01');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    const projectsRes = await page.request.get('/api/projects', {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const projectsJson = await projectsRes.json();
    const projects = Array.isArray(projectsJson) ? projectsJson : (projectsJson.data || []);
    const activeProject = projects.find((p: any) => p.status === 'ACTIVE') || projects[0];
    testProjectId = activeProject?.id || 'prj_demo_1';

    const workersRes = await page.request.get('/api/workers', {
      headers: { 'x-editor-name': 'Park Yongjin' },
    });
    const workersJson = await workersRes.json();
    const workers = Array.isArray(workersJson) ? workersJson : (workersJson.data || []);
    activeEditors = workers.filter(
      (w: any) => Number(w.is_active) === 1 && w.access_role === 'EDITOR' && w.name !== 'CEO' && w.name !== 'COO'
    );
  });

  test.afterEach(async ({ page }) => {
    // Teardown: Delete ONLY the test-created tasks on QA
    for (const taskId of createdTaskIds) {
      await page.request.delete(`/api/tasks/${taskId}`, {
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      }).catch(() => {});
    }
    createdTaskIds.length = 0;
  });

  test('1. CASE A: PIC only task save succeeds with 0 allocation errors', async ({ page }) => {
    const pic = activeEditors[0];
    const res = await page.request.post('/api/tasks', {
      headers: { 'x-editor-name': 'Park Yongjin' },
      data: {
        project_id: testProjectId,
        task_name: `V2 PIC Only Test Task ${Date.now()}`,
        primary_worker_id: pic.id,
        pic_worker_id: pic.id,
        support_worker_ids: [],
        schedule_status: 'SCHEDULED',
        start_date: '2026-08-15',
        end_date: '2026-08-20',
      },
    });

    expect(res.status()).toBe(200);
    const taskData = await res.json();
    createdTaskIds.push(taskData.id);

    expect(taskData.assignees.length).toBe(1);
    expect(taskData.assignees[0].assignment_role).toBe('PRIMARY');
    expect(taskData.assignees[0].allocation_percent).toBe(100);
  });

  test('2. CASE B & C: PIC + 1 Support and PIC + 4 Support save succeed without allocation errors', async ({ page }) => {
    expect(activeEditors.length).toBeGreaterThanOrEqual(5);

    const pic = activeEditors[0];
    const supports = activeEditors.slice(1, 5).map((w) => w.id);

    // Test CASE B: PIC + 1 Support
    const resB = await page.request.post('/api/tasks', {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      data: {
        project_id: testProjectId,
        task_name: `V2 PIC+1 Support Task ${Date.now()}`,
        primary_worker_id: pic.id,
        pic_worker_id: pic.id,
        support_worker_ids: [supports[0]],
        schedule_status: 'SCHEDULED',
        start_date: '2026-08-15',
        end_date: '2026-08-20',
      },
    });

    expect(resB.status()).toBe(200);
    const taskB = await resB.json();
    createdTaskIds.push(taskB.id);

    expect(taskB.assignees.length).toBe(2);
    const primaryB = taskB.assignees.find((a: any) => a.assignment_role === 'PRIMARY');
    const supportB = taskB.assignees.find((a: any) => a.assignment_role === 'CO_ASSIGNEE');
    expect(primaryB.allocation_percent).toBe(100);
    expect(supportB.allocation_percent).toBe(0);

    // Test CASE C: PIC + 4 Support
    const resC = await page.request.post('/api/tasks', {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      data: {
        project_id: testProjectId,
        task_name: `V2 PIC+4 Support Task ${Date.now()}`,
        primary_worker_id: pic.id,
        pic_worker_id: pic.id,
        support_worker_ids: supports,
        schedule_status: 'SCHEDULED',
        start_date: '2026-08-15',
        end_date: '2026-08-20',
      },
    });

    expect(resC.status()).toBe(200);
    const taskC = await resC.json();
    createdTaskIds.push(taskC.id);

    expect(taskC.assignees.length).toBe(5);
  });

  test('3. CASE D: 5th Support worker addition is rejected with MAX_SUPPORT_EXCEEDED', async ({ page }) => {
    if (activeEditors.length < 6) return;

    const pic = activeEditors[0];
    const supports = activeEditors.slice(1, 6).map((w) => w.id);

    const res = await page.request.post('/api/tasks', {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      data: {
        project_id: testProjectId,
        task_name: `V2 5 Support Task ${Date.now()}`,
        primary_worker_id: pic.id,
        pic_worker_id: pic.id,
        support_worker_ids: supports,
        schedule_status: 'SCHEDULED',
        start_date: '2026-08-15',
        end_date: '2026-08-20',
      },
    });

    expect(res.status()).toBe(400);
    const errData = await res.json();
    expect(errData.code || errData.error?.code).toBe('MAX_SUPPORT_EXCEEDED');
  });

  test('4. CASE E: Support worker calendar change does NOT impact planned_working_days, progress or state', async ({ page }) => {
    const pic = activeEditors[0];
    const krSupport = activeEditors.find((w) => w.country_code === 'KR' && w.id !== pic.id) || activeEditors[1];
    const vnSupport = activeEditors.find((w) => w.country_code === 'VN' && w.id !== pic.id) || activeEditors[2];

    // Create task with PIC only
    const resA = await page.request.post('/api/tasks', {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      data: {
        project_id: testProjectId,
        task_name: `V2 Support Progress Neutrality Task ${Date.now()}`,
        primary_worker_id: pic.id,
        pic_worker_id: pic.id,
        support_worker_ids: [],
        schedule_status: 'SCHEDULED',
        start_date: '2026-08-10',
        end_date: '2026-08-20',
      },
    });
    const taskDataA = await resA.json();
    createdTaskIds.push(taskDataA.id);

    // Add KR Support
    const resB = await page.request.put(`/api/tasks/${taskDataA.id}`, {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      data: {
        ...taskDataA,
        support_worker_ids: [krSupport.id],
      },
    });
    const taskDataB = await resB.json();

    // Add VN Support
    const resC = await page.request.put(`/api/tasks/${taskDataA.id}`, {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      data: {
        ...taskDataA,
        support_worker_ids: [vnSupport.id],
      },
    });
    const taskDataC = await resC.json();

    // Verify planned_working_days, actual_progress, schedule_state are 100% IDENTICAL
    expect(taskDataB.planned_working_days).toBe(taskDataA.planned_working_days);
    expect(taskDataC.planned_working_days).toBe(taskDataA.planned_working_days);

    expect(taskDataB.actual_progress).toBe(taskDataA.actual_progress);
    expect(taskDataC.actual_progress).toBe(taskDataA.actual_progress);

    expect(taskDataB.schedule_state).toBe(taskDataA.schedule_state);
    expect(taskDataC.schedule_state).toBe(taskDataA.schedule_state);
  });
});
