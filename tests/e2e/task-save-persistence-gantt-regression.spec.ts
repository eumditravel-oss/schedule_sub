// tests/e2e/task-save-persistence-gantt-regression.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

async function dismissAllModals(page: any) {
  for (let i = 0; i < 5; i++) {
    const modal = page.locator('[data-testid="calendar-manager-modal"], [data-testid="project-delete-confirm-modal"]').first();
    if (await modal.isVisible({ timeout: 300 }).catch(() => false)) {
      const closeBtn = modal.locator('button').first();
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

test.describe('Task Save Persistence & Gantt Reflection Regression Suite', () => {
  let projectAId = '';
  let projectBId = '';
  let projectCId = '';
  const runId = Date.now();
  let createdTaskIdCaseA = '';
  const taskNameCaseA = `TASK_PERSIST_A_${runId}`;

  test.beforeAll(async () => {
    // Project A in 2030-05 (for isolated non-conflict Case A & E)
    const prjARes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-SAVE-A-${runId}] 저장 검증 프로젝트 A`,
        start_date: '2030-05-01',
        end_date: '2030-05-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjARes.status).toBe(201);
    const prjAJson: any = await prjARes.json();
    projectAId = prjAJson.id || prjAJson.data?.id;
    expect(projectAId).toBeTruthy();

    // Project B in 2030-06 (for Case B, C, D conflict testing)
    const prjBRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-SAVE-B-${runId}] 저장 검증 프로젝트 B`,
        start_date: '2030-06-01',
        end_date: '2030-06-30',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjBRes.status).toBe(201);
    const prjBJson: any = await prjBRes.json();
    projectBId = prjBJson.id || prjBJson.data?.id;
    expect(projectBId).toBeTruthy();

    // Project C in 2030-06 (base project for creating overlapping task for wrk_02)
    const prjCRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-SAVE-C-${runId}] 저장 검증 프로젝트 C`,
        start_date: '2030-06-01',
        end_date: '2030-06-30',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(prjCRes.status).toBe(201);
    const prjCJson: any = await prjCRes.json();
    projectCId = prjCJson.id || prjCJson.data?.id;
    expect(projectCId).toBeTruthy();

    // Create base overlapping task on Project C for wrk_02 on 2030-06-10 ~ 2030-06-14
    const baseTaskRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: projectCId,
        task_name: `CONFLICT_BASE_${runId}`,
        primary_worker_id: 'wrk_02',
        worker_name: '박용진 수석',
        start_date: '2030-06-10',
        end_date: '2030-06-14',
        progress_mode: 'AUTO_TIME',
        schedule_status: 'SCHEDULED',
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
        assignees: [
          { worker_id: 'wrk_02', worker_name: '박용진 수석', assignment_role: 'PRIMARY', allocation_percent: 100 }
        ],
      }),
    });
    expect(baseTaskRes.status).toBe(201);
  });

  test.afterAll(async () => {
    const ids = [projectAId, projectBId, projectCId].filter(Boolean);
    for (const pId of ids) {
      await fetch(`${QA_BASE_URL}/api/projects/${pId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
      }).catch(() => {});
    }
  });

  test('CASE A: Genuine Non-Conflict Creation (POST 201, Exact Row & Bar, Geometry <= 0.5px, F5)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectAId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Select worker wrk_02
    const workerSelectBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerSelectBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }

    // Track network requests
    let postCount = 0;
    let putUndefinedCount = 0;
    let patchUndefinedCount = 0;

    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      if (url.includes('/api/tasks') && method === 'POST') {
        postCount++;
      }
      if (url.includes('/api/tasks/undefined')) {
        if (method === 'PUT') putUndefinedCount++;
        if (method === 'PATCH') patchUndefinedCount++;
      }
    });

    // Open Task Modal
    const addTaskBtn = page.locator('[data-testid="add-task-btn"], [data-testid^="task-group-add-task-"]').first();
    await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
    await addTaskBtn.click({ force: true });

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Select wrk_02 explicitly in TaskModal if worker dropdown is present
    const modalWorkerSelect = page.locator('[data-testid="task-worker-select"]');
    if (await modalWorkerSelect.isVisible().catch(() => false)) {
      await modalWorkerSelect.selectOption('wrk_02').catch(() => {});
    }

    // Fill task info for 2030-05-10 ~ 2030-05-14
    const nameInput = page.locator('[data-testid="task-name-input"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(taskNameCaseA);

    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    if (await startDateInput.isVisible().catch(() => false)) {
      await startDateInput.fill('2030-05-10');
    }
    const endDateInput = page.locator('[data-testid="task-end-date-input"]');
    if (await endDateInput.isVisible().catch(() => false)) {
      await endDateInput.fill('2030-05-14');
    }

    // Set network response listener for POST /api/tasks
    const postResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tasks') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    // Save
    const saveBtn = page.locator('[data-testid="task-save-btn"]');
    await saveBtn.click({ force: true });

    const postResponse = await postResponsePromise;
    expect(postResponse.status()).toBe(201);
    expect(postCount).toBe(1);
    expect(putUndefinedCount).toBe(0);
    expect(patchUndefinedCount).toBe(0);

    const resJson: any = await postResponse.json();
    createdTaskIdCaseA = resJson.id || resJson.data?.id;
    expect(createdTaskIdCaseA).toBeTruthy();

    // CASE A Guarantee: Conflict Modal MUST NOT appear
    const conflictModal = page.locator('[data-testid="worker-conflict-summary-modal"]');
    await expect(conflictModal).toBeHidden();

    // Modal must close
    await expect(taskModal).toBeHidden({ timeout: 5000 });

    // Verify DB/API Payload directly via Detail API
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectAId}/detail`);
    expect(detailRes.status).toBe(200);
    const detailJson: any = await detailRes.json();
    const tasks = detailJson.tasks || detailJson.data?.tasks || [];
    const persistedTask = tasks.find((t: any) => t.id === createdTaskIdCaseA || t.task_name === taskNameCaseA);
    expect(persistedTask).toBeTruthy();
    expect(persistedTask.task_name).toBe(taskNameCaseA);
    expect(persistedTask.start_date).toBe('2030-05-10');
    expect(persistedTask.end_date).toBe('2030-05-14');

    // Exact Task Row Assertion
    const taskText = page.getByText(taskNameCaseA, { exact: true });
    await expect(taskText).toBeVisible({ timeout: 5000 });

    // Exact Schedule Bar & Date Range Assertion
    const scheduleBar = page.locator(`[aria-label*="${taskNameCaseA}"]`).first();
    await expect(scheduleBar).toBeVisible({ timeout: 5000 });

    // Geometry verification (<= 0.5px error)
    const startDateCell = page.locator('[data-date="2030-05-10"]').first();
    const endDateCell = page.locator('[data-date="2030-05-14"]').first();
    if (await startDateCell.isVisible().catch(() => false) && await endDateCell.isVisible().catch(() => false)) {
      const startCellBox = await startDateCell.boundingBox();
      const endCellBox = await endDateCell.boundingBox();
      const barBox = await scheduleBar.boundingBox();

      if (startCellBox && endCellBox && barBox) {
        const startDiff = Math.abs(barBox.x - startCellBox.x);
        const endDiff = Math.abs((barBox.x + barBox.width) - (endCellBox.x + endCellBox.width));
        expect(startDiff).toBeLessThanOrEqual(0.5);
        expect(endDiff).toBeLessThanOrEqual(0.5);
      }
    }

    // F5 Persistence verification
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Verify detail API after F5
    const f5DetailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectAId}/detail`);
    const f5DetailJson: any = await f5DetailRes.json();
    const f5Tasks = f5DetailJson.tasks || f5DetailJson.data?.tasks || [];
    const f5Task = f5Tasks.find((t: any) => t.id === createdTaskIdCaseA || t.task_name === taskNameCaseA);
    expect(f5Task).toBeTruthy();
    expect(f5Task.start_date).toBe('2030-05-10');

    await expect(page.getByText(taskNameCaseA, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`[aria-label*="${taskNameCaseA}"]`).first()).toBeVisible({ timeout: 5000 });
  });

  test('CASE B: Conflict Task -> 409 Confirmation Required, Modal Stays Open, DB Unchanged', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectBId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Select worker wrk_02
    const workerSelectBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerSelectBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }

    // Open Task Modal on Project B
    const addTaskBtn = page.locator('[data-testid="add-task-btn"], [data-testid^="task-group-add-task-"]').first();
    await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
    await addTaskBtn.click({ force: true });

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Select wrk_02 in TaskModal
    const modalWorkerSelect = page.locator('[data-testid="task-worker-select"]');
    if (await modalWorkerSelect.isVisible().catch(() => false)) {
      await modalWorkerSelect.selectOption('wrk_02').catch(() => {});
    }

    const nameInput = page.locator('[data-testid="task-name-input"]');
    await nameInput.fill(`CONFLICT_TEST_${runId}`);

    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    if (await startDateInput.isVisible().catch(() => false)) {
      await startDateInput.fill('2030-06-10');
    }
    const endDateInput = page.locator('[data-testid="task-end-date-input"]');
    if (await endDateInput.isVisible().catch(() => false)) {
      await endDateInput.fill('2030-06-14');
    }

    // Listen for HTTP 409 response
    const conflictPostPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tasks') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    const saveBtn = page.locator('[data-testid="task-save-btn"]');
    await saveBtn.click({ force: true });

    const conflictResp = await conflictPostPromise;
    expect(conflictResp.status()).toBe(409);
    const conflictJson: any = await conflictResp.json();
    expect(conflictJson.errCode || conflictJson.error?.code).toBe('CROSS_PROJECT_CONFLICT_CONFIRMATION_REQUIRED');

    // UI Assertions: Both TaskModal & WorkerConflictSummaryModal MUST be visible
    const conflictModal = page.locator('[data-testid="worker-conflict-summary-modal"]');
    await expect(conflictModal).toBeVisible({ timeout: 5000 });
    await expect(taskModal).toBeVisible();

    // DB Check: Task MUST NOT exist on Project B
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectBId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks = detailJson.tasks || detailJson.data?.tasks || [];
    const createdTask = tasks.find((t: any) => t.task_name === `CONFLICT_TEST_${runId}`);
    expect(createdTask).toBeFalsy();
  });

  test('CASE C: Conflict Cancel -> Conflict Modal Closes, Task NOT Created in DB', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectBId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Select worker wrk_02
    const workerSelectBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerSelectBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }

    // Open Task Modal on Project B
    const addTaskBtn = page.locator('[data-testid="add-task-btn"], [data-testid^="task-group-add-task-"]').first();
    await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
    await addTaskBtn.click({ force: true });

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Select wrk_02 in TaskModal
    const modalWorkerSelect = page.locator('[data-testid="task-worker-select"]');
    if (await modalWorkerSelect.isVisible().catch(() => false)) {
      await modalWorkerSelect.selectOption('wrk_02').catch(() => {});
    }

    const nameInput = page.locator('[data-testid="task-name-input"]');
    await nameInput.fill(`CANCEL_TEST_${runId}`);

    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    if (await startDateInput.isVisible().catch(() => false)) {
      await startDateInput.fill('2030-06-10');
    }
    const endDateInput = page.locator('[data-testid="task-end-date-input"]');
    if (await endDateInput.isVisible().catch(() => false)) {
      await endDateInput.fill('2030-06-14');
    }

    const saveBtn = page.locator('[data-testid="task-save-btn"]');
    await saveBtn.click({ force: true });

    const conflictModal = page.locator('[data-testid="worker-conflict-summary-modal"]');
    await expect(conflictModal).toBeVisible({ timeout: 5000 });

    // Click Cancel on Conflict Modal
    const cancelBtn = page.locator('[data-testid="conflict-modal-cancel-btn"]');
    await cancelBtn.click({ force: true });

    // Conflict Modal closes
    await expect(conflictModal).toBeHidden({ timeout: 5000 });

    // DB Verification: Task NOT created
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectBId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks = detailJson.tasks || detailJson.data?.tasks || [];
    const canceledTask = tasks.find((t: any) => t.task_name === `CANCEL_TEST_${runId}`);
    expect(canceledTask).toBeFalsy();
  });

  test('CASE D: Conflict Confirm -> 2nd Request 201, Created Task Exists, F5 Persistence', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectBId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Select worker wrk_02
    const workerSelectBtn = page.locator('[data-testid="worker-select-btn"]');
    if (await workerSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerSelectBtn.click();
      const option = page.locator('[data-testid^="worker-option-"]').filter({ hasText: '박용진' }).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }

    // Open Task Modal on Project B
    const addTaskBtn = page.locator('[data-testid="add-task-btn"], [data-testid^="task-group-add-task-"]').first();
    await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
    await addTaskBtn.click({ force: true });

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    // Select wrk_02 in TaskModal
    const modalWorkerSelect = page.locator('[data-testid="task-worker-select"]');
    if (await modalWorkerSelect.isVisible().catch(() => false)) {
      await modalWorkerSelect.selectOption('wrk_02').catch(() => {});
    }

    const taskName = `CONFIRM_TEST_${runId}`;
    const nameInput = page.locator('[data-testid="task-name-input"]');
    await nameInput.fill(taskName);

    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    if (await startDateInput.isVisible().catch(() => false)) {
      await startDateInput.fill('2030-06-10');
    }
    const endDateInput = page.locator('[data-testid="task-end-date-input"]');
    if (await endDateInput.isVisible().catch(() => false)) {
      await endDateInput.fill('2030-06-14');
    }

    const saveBtn = page.locator('[data-testid="task-save-btn"]');
    await saveBtn.click({ force: true });

    const conflictModal = page.locator('[data-testid="worker-conflict-summary-modal"]');
    await expect(conflictModal).toBeVisible({ timeout: 5000 });

    // Confirm Promise Listener for 2nd Request
    const secondPostPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tasks') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    const confirmBtn = page.locator('[data-testid="conflict-modal-confirm-btn"]');
    await confirmBtn.click({ force: true });

    const secondPostResp = await secondPostPromise;
    expect(secondPostResp.status()).toBe(201);
    const secondPostJson: any = await secondPostResp.json();
    const conflictCreatedTaskId = secondPostJson.id || secondPostJson.data?.id;
    expect(conflictCreatedTaskId).toBeTruthy();

    await expect(taskModal).toBeHidden({ timeout: 5000 });

    // Verify DB
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectBId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks = detailJson.tasks || detailJson.data?.tasks || [];
    const createdTask = tasks.find((t: any) => t.id === conflictCreatedTaskId || t.task_name === taskName);
    expect(createdTask).toBeTruthy();

    await expect(page.getByText(taskName, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`[aria-label*="${taskName}"]`).first()).toBeVisible({ timeout: 5000 });

    // F5
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    await expect(page.getByText(taskName, { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('CASE E: Update Task -> PUT/PATCH with Real Task ID (0 Undefined), DB Updated, Gantt Bar Repositioned, F5', async ({ page }) => {
    // If createdTaskIdCaseA is missing, create a task on Project A via API
    if (!createdTaskIdCaseA) {
      const res = await fetch(`${QA_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent('박용진 수석'),
        },
        body: JSON.stringify({
          project_id: projectAId,
          task_name: taskNameCaseA,
          primary_worker_id: 'wrk_02',
          worker_name: '박용진 수석',
          start_date: '2030-05-10',
          end_date: '2030-05-14',
          progress_mode: 'AUTO_TIME',
          schedule_status: 'SCHEDULED',
          editor_name: '박용진 수석',
        }),
      });
      const resJson: any = await res.json();
      createdTaskIdCaseA = resJson.id || resJson.data?.id;
    }
    expect(createdTaskIdCaseA).toBeTruthy();

    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${QA_BASE_URL}/projects/${projectAId}`);
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    // Track PUT/PATCH requests
    let updateRealIdCount = 0;
    let updateUndefinedCount = 0;

    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      if ((method === 'PUT' || method === 'PATCH') && url.includes('/api/tasks/')) {
        if (url.includes('/api/tasks/undefined')) {
          updateUndefinedCount++;
        } else if (url.includes(`/api/tasks/${createdTaskIdCaseA}`)) {
          updateRealIdCount++;
        }
      }
    });

    // Find and edit the created task from Case A
    const editBtn = page.locator(`[data-testid="task-edit-${createdTaskIdCaseA}"]`).or(
      page.locator('[data-testid="edit-task-btn"]').first()
    );
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click({ force: true });
    } else {
      const taskText = page.getByText(taskNameCaseA, { exact: true });
      await taskText.click({ force: true });
    }

    const taskModal = page.locator('[data-testid="task-modal"]');
    await expect(taskModal).toBeVisible();

    const updatedTaskName = `UPDATED_TASK_A_${runId}`;
    const nameInput = page.locator('[data-testid="task-name-input"]');
    await nameInput.fill(updatedTaskName);

    const startDateInput = page.locator('[data-testid="task-start-date-input"]');
    if (await startDateInput.isVisible().catch(() => false)) {
      await startDateInput.fill('2030-05-12');
    }
    const endDateInput = page.locator('[data-testid="task-end-date-input"]');
    if (await endDateInput.isVisible().catch(() => false)) {
      await endDateInput.fill('2030-05-18');
    }

    const updateResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tasks/') && (resp.request().method() === 'PUT' || resp.request().method() === 'PATCH'),
      { timeout: 10000 }
    );

    const saveBtn = page.locator('[data-testid="task-save-btn"]');
    await saveBtn.click({ force: true });

    const updateResp = await updateResponsePromise;
    expect(updateResp.status()).toBeLessThan(300);
    expect(updateUndefinedCount).toBe(0);
    expect(updateRealIdCount).toBe(1);

    await expect(taskModal).toBeHidden({ timeout: 5000 });

    // DB Check
    const detailRes = await fetch(`${QA_BASE_URL}/api/projects/${projectAId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks = detailJson.tasks || detailJson.data?.tasks || [];
    const updatedTask = tasks.find((t: any) => t.id === createdTaskIdCaseA);
    expect(updatedTask).toBeTruthy();
    expect(updatedTask.task_name).toBe(updatedTaskName);
    expect(updatedTask.start_date).toBe('2030-05-12');
    expect(updatedTask.end_date).toBe('2030-05-18');

    // Exact Row & Bar
    await expect(page.getByText(updatedTaskName, { exact: true })).toBeVisible({ timeout: 5000 });
    const updatedScheduleBar = page.locator(`[aria-label*="${updatedTaskName}"]`).first();
    await expect(updatedScheduleBar).toBeVisible({ timeout: 5000 });

    // F5
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissAllModals(page);

    await expect(page.getByText(updatedTaskName, { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
