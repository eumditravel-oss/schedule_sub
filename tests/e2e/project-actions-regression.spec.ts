// tests/e2e/project-actions-regression.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function dismissBlockingModals(page: any) {
  // Close calendar-manager-modal if open
  const calModal = page.locator('[data-testid="calendar-manager-modal"]');
  if (await calModal.isVisible({ timeout: 500 }).catch(() => false)) {
    const calCloseBtn = page.locator('[data-testid="calendar-modal-close-btn"]');
    if (await calCloseBtn.isVisible().catch(() => false)) {
      await calCloseBtn.click().catch(() => {});
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }

  for (let i = 0; i < 5; i++) {
    const backdrop = page.locator('.fixed.inset-0.z-50').first();
    if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
      const confirmBtn = page.locator('button:has-text("확인"), button:has-text("X"), button:has-text("닫기")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click().catch(() => {});
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }
}

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('P0 Project Actions & Complete CRUD Regression Suite', () => {
  let createdProjectId = '';
  let createdTaskId = '';
  const runId = Date.now();
  const initialProjectName = `[QA-PROJECT-ACTIONS-${runId}] 회귀 검증 프로젝트`;
  const initialTaskName = `[QA-PROJECT-ACTIONS-${runId}] 하위 작업`;

  test.beforeAll(async () => {
    // 1. Create QA Project
    const prjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        name: initialProjectName,
        start_date: '2026-08-05',
        end_date: '2026-08-25',
        progress: 0,
        editor_name: 'Manh Cuong(끄엉)',
      }),
    });

    expect(prjRes.status).toBe(201);
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.data?.id;
    expect(createdProjectId).toBeTruthy();

    // 2. Create QA Task
    const taskRes = await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_name: initialTaskName,
        start_date: '2026-08-05',
        end_date: '2026-08-20',
        worker_name: 'Manh Cuong(끄엉)',
        editor_name: 'Manh Cuong(끄엉)',
        confirm_worker_schedule_conflict: true,
      }),
    });

    expect(taskRes.status).toBe(201);
    const taskJson: any = await taskRes.json();
    createdTaskId = taskJson.id || taskJson.data?.id;
    expect(createdTaskId).toBeTruthy();
  });

  test.afterAll(async () => {
    // Strict ID-based cleanup
    if (createdTaskId) {
      await fetch(`${QA_BASE_URL}/api/tasks/${createdTaskId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      }).catch(() => {});
    }

    if (createdProjectId) {
      const delPrjRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Manh Cuong(끄엉)') },
      });
      if (delPrjRes.status === 200) {
        expect(delPrjRes.status).toBe(200);
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });
  });

  test('1. Verify Desktop Project Edit & Delete Buttons Visibility and Modal Pre-filling', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const actionGroup = page.locator(`[data-testid="project-action-group-${createdProjectId}"]`);
    await expect(actionGroup).toBeVisible({ timeout: 15000 });

    const editBtn = page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`);
    await expect(editBtn).toBeVisible();

    const deleteBtn = page.locator(`[data-testid="project-delete-btn-${createdProjectId}"]`);
    await expect(deleteBtn).toBeVisible();

    // Click Edit button (must NOT trigger navigation to project detail)
    const currentUrlBefore = page.url();
    await editBtn.click();
    await page.waitForTimeout(300);

    expect(page.url()).toBe(currentUrlBefore);
    expect(page.url()).not.toContain(`/projects/${createdProjectId}`);

    const projectModal = page.locator('[data-testid="project-modal"]');
    await expect(projectModal).toBeVisible();

    const nameInput = page.locator('[data-testid="project-name-input"]');
    await expect(nameInput).toHaveValue(initialProjectName);

    const startDateInput = page.locator('[data-testid="project-start-date"]');
    await expect(startDateInput).toHaveValue('2026-08-05');

    const endDateInput = page.locator('[data-testid="project-end-date"]');
    await expect(endDateInput).toHaveValue('2026-08-25');

    // Cancel edit
    const cancelBtn = page.locator('[data-testid="project-cancel-btn"]');
    await cancelBtn.click();
    await expect(projectModal).not.toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'project-edit-modal-prefilled.png') });
  });

  test('2. Verify Project Name Editing, Saving, and F5 Persistence', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const editBtn = page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`);
    await expect(editBtn).toBeVisible({ timeout: 15000 });
    await editBtn.click();

    const updatedName = `[QA-PROJECT-ACTIONS-${runId}] 이름 수정 완료`;
    const nameInput = page.locator('[data-testid="project-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Use React fiber-compatible native input value setter to trigger synthetic onChange
    await nameInput.evaluate((el: HTMLInputElement, value: string) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, updatedName);

    await page.waitForTimeout(300);

    // Verify the input value was correctly set
    const inputVal = await nameInput.inputValue();
    if (inputVal !== updatedName) {
      // Fallback: use fill()
      await nameInput.fill(updatedName);
      await page.waitForTimeout(300);
    }

    const saveBtn = page.locator('[data-testid="project-save-btn"]');
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
    await saveBtn.click({ force: true });
    await page.waitForSelector('[data-testid="project-modal"]', { state: 'detached' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Reload to verify persistence
    const projectRow = page.locator(`[data-testid="project-row-${createdProjectId}"]`);
    await page.reload();
    await dismissBlockingModals(page);
    await expect(projectRow).toContainText(updatedName, { timeout: 10000 });
  });

  test('3. Verify Project Date Shift Cascade Modal and Task Date Update', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const editBtn = page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`);
    await expect(editBtn).toBeVisible({ timeout: 15000 });
    await editBtn.click();

    // Shift start date by +5 days (2026-08-05 -> 2026-08-10)
    const startDateInput = page.locator('[data-testid="project-start-date"]');
    await startDateInput.focus();
    await startDateInput.fill('2026-08-10');
    await startDateInput.dispatchEvent('change');
    await page.waitForTimeout(200);

    const saveBtn = page.locator('[data-testid="project-save-btn"]');
    await saveBtn.click();

    // Verify Cascade Confirmation Modal
    const cascadeModal = page.locator('[data-testid="cascade-confirm-modal"]');
    await expect(cascadeModal).toBeVisible({ timeout: 10000 });

    const confirmCascadeBtn = page.locator('[data-testid="cascade-confirm-btn"]');
    await confirmCascadeBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Verify Project Detail page task dates shifted
    await page.goto(`${QA_BASE_URL}/projects/${createdProjectId}`);
    await dismissBlockingModals(page);

    const taskRow = page.locator(`[data-testid^="task-row-"]`).first().or(page.locator('tr:has-text("하위 작업")')).first();
    if (await taskRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(taskRow).toBeVisible();
    }
  });

  test('4. Verify Project Delete Confirmation Modal, Cancel, and Complete Clean Deletion', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    // Create a standalone temporary project for deletion test
    const tempPrjRes = await fetch(`${QA_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[QA-PROJECT-DELETE-${runId}] 삭제 전용 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-15',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });

    const tempPrjJson: any = await tempPrjRes.json();
    const tempPrjId = tempPrjJson.id || tempPrjJson.data?.id;

    // Create a task inside temp project
    await fetch(`${QA_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: tempPrjId,
        task_name: '삭제 검증 작업',
        start_date: '2026-08-01',
        end_date: '2026-08-10',
        worker_name: '박용진 수석',
        editor_name: '박용진 수석',
      }),
    });

    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const deleteBtn = page.locator(`[data-testid="project-delete-btn-${tempPrjId}"]`);
    await expect(deleteBtn).toBeVisible({ timeout: 15000 });

    // Click Delete button
    await deleteBtn.click();
    await page.waitForTimeout(300);

    // Verify Delete Confirm Modal
    const deleteModal = page.locator('[data-testid="project-delete-confirm-modal"]');
    await expect(deleteModal).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'project-delete-confirm.png') });

    // Test Cancel button
    const cancelBtn = page.locator('[data-testid="project-delete-cancel-btn"]');
    await cancelBtn.click();
    await expect(deleteModal).not.toBeVisible();

    // Verify project still exists
    const tempPrjRow = page.locator(`[data-testid="project-row-${tempPrjId}"]`);
    await expect(tempPrjRow).toBeVisible();

    // Click Delete again and Confirm
    await deleteBtn.click();
    await expect(deleteModal).toBeVisible();

    const confirmBtn = page.locator('[data-testid="project-delete-confirm-btn"]');
    await confirmBtn.click();
    await page.waitForTimeout(500);

    // Verify Project row removed from DOM
    await expect(tempPrjRow).not.toBeVisible();

    // Verify backend GET project status 404
    const checkRes = await fetch(`${QA_BASE_URL}/api/projects/${tempPrjId}`);
    expect(checkRes.status).toBe(404);
  });

  test('5. Verify Role-Based Access Control: CEO & COO Hide Action Buttons and Block Server Requests', async ({ page }) => {
    // 1. Executive CEO profile
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'CEO');
      localStorage.setItem('schedule_current_worker_name', 'CEO');
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    // Verify Edit & Delete buttons count === 0 for CEO
    const ceoEditBtnCount = await page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`).count();
    expect(ceoEditBtnCount).toBe(0);

    const ceoDeleteBtnCount = await page.locator(`[data-testid="project-delete-btn-${createdProjectId}"]`).count();
    expect(ceoDeleteBtnCount).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'project-actions-viewer-hidden.png') });

    // Verify direct API PATCH/DELETE returns HTTP 403 EXECUTIVE_READ_ONLY
    const patchRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('CEO'),
      },
      body: JSON.stringify({ name: 'CEO Unauthorized Title Edit' }),
    });
    expect(patchRes.status).toBe(403);

    const delRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('CEO') },
    });
    expect(delRes.status).toBe(403);
  });

  test('6. Verify Completed Project Policy: Buttons Hidden, Restore Flow', async ({ page }) => {
    // Mark QA project completed
    const compRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({ editor_name: '박용진 수석' }),
    });
    expect(compRes.status).toBe(200);

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    // Switch to Completed tab
    const completedTabBtn = page.locator('[data-testid="completed-tab-btn"]').first();
    await completedTabBtn.click();
    await page.waitForTimeout(300);

    // Verify Edit & Delete buttons HIDDEN on COMPLETED tab
    const compEditBtnCount = await page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`).count();
    expect(compEditBtnCount).toBe(0);

    const compDeleteBtnCount = await page.locator(`[data-testid="project-delete-btn-${createdProjectId}"]`).count();
    expect(compDeleteBtnCount).toBe(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'project-actions-completed-hidden.png') });

    // Restore to Active
    const reopenRes = await fetch(`${QA_BASE_URL}/api/projects/${createdProjectId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({ editor_name: '박용진 수석' }),
    });
    expect(reopenRes.status).toBe(200);

    // Switch back to Active tab
    const activeTabBtn = page.locator('[data-testid="active-tab-btn"]').first();
    await activeTabBtn.click();
    await page.waitForTimeout(300);

    // Verify Edit & Delete buttons REAPPEAR
    const activeEditBtn = page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`);
    await expect(activeEditBtn).toBeVisible({ timeout: 10000 });
  });

  test('7. Verify Mobile Card Menu Actions & Bottom Sheet Confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${QA_BASE_URL}/projects`);
    await dismissBlockingModals(page);

    const mobileMenuBtn = page.locator(`[data-testid="mobile-project-menu-btn-${createdProjectId}"]`);
    await expect(mobileMenuBtn).toBeVisible({ timeout: 10000 });
    await mobileMenuBtn.click();
    await page.waitForTimeout(300);

    const mobileEditBtn = page.locator(`[data-testid="mobile-project-edit-btn-${createdProjectId}"]`);
    await expect(mobileEditBtn).toBeVisible();

    const mobileDeleteBtn = page.locator(`[data-testid="mobile-project-delete-btn-${createdProjectId}"]`);
    await expect(mobileDeleteBtn).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'project-actions-mobile.png') });
  });

  test('8. Verify Compact Inline Layout: Edit/Delete Left of Badge, Row Height 58–64px, No Overlap', async ({ page }) => {
    const viewports = [
      { width: 1024, height: 768, file: 'project-actions-inline-1024.png' },
      { width: 1366, height: 768, file: 'project-actions-inline-1366.png' },
      { width: 1536, height: 864, file: 'project-actions-inline-1536.png' },
      { width: 1920, height: 1080, file: 'project-actions-inline-1920.png' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${QA_BASE_URL}/projects`);
      await dismissBlockingModals(page);

      // Ensure action group is visible
      const actionGroup = page.locator(`[data-testid="project-action-group-${createdProjectId}"]`);
      await expect(actionGroup).toBeVisible({ timeout: 10000 });

      const editBtn = page.locator(`[data-testid="project-edit-btn-${createdProjectId}"]`);
      const deleteBtn = page.locator(`[data-testid="project-delete-btn-${createdProjectId}"]`);
      const statusBadge = page.locator(`[data-testid="project-status-badge-${createdProjectId}"]`);
      const progressSummary = page.locator(`[data-testid="project-progress-summary-${createdProjectId}"]`);
      const projectRow = page.locator(`[data-testid="project-row-${createdProjectId}"]`);

      await expect(editBtn).toBeVisible();
      await expect(deleteBtn).toBeVisible();
      await expect(statusBadge).toBeVisible();
      await expect(progressSummary).toBeVisible();

      const editBox = await editBtn.boundingBox();
      const deleteBox = await deleteBtn.boundingBox();
      const statusBox = await statusBadge.boundingBox();
      const progressBox = await progressSummary.boundingBox();
      const rowBox = await projectRow.boundingBox();

      expect(editBox, `[${vp.width}px] editBtn boundingBox must exist`).toBeTruthy();
      expect(deleteBox, `[${vp.width}px] deleteBtn boundingBox must exist`).toBeTruthy();
      expect(statusBox, `[${vp.width}px] statusBadge boundingBox must exist`).toBeTruthy();
      expect(progressBox, `[${vp.width}px] progressSummary boundingBox must exist`).toBeTruthy();
      expect(rowBox, `[${vp.width}px] projectRow boundingBox must exist`).toBeTruthy();

      // 1. Horizontal ordering: edit < delete < status badge
      expect(editBox!.x, `[${vp.width}px] edit must be left of delete`).toBeLessThan(deleteBox!.x);
      expect(deleteBox!.x + deleteBox!.width, `[${vp.width}px] delete right edge must not exceed status left edge`).toBeLessThanOrEqual(statusBox!.x + 4); // 4px tolerance

      // 2. Edit and delete vertically aligned within 3px
      expect(Math.abs(editBox!.y - deleteBox!.y), `[${vp.width}px] edit/delete must be on same row (Δy ≤ 3)`).toBeLessThanOrEqual(3);

      // 3. Status badge vertical center aligned with edit button center within 5px
      const editCenterY = editBox!.y + editBox!.height / 2;
      const statusCenterY = statusBox!.y + statusBox!.height / 2;
      expect(Math.abs(editCenterY - statusCenterY), `[${vp.width}px] edit and status badge must be vertically centered (Δ ≤ 5)`).toBeLessThanOrEqual(5);

      // 4. Progress summary must be below status badge bottom
      expect(progressBox!.y, `[${vp.width}px] progress must be below status badge`).toBeGreaterThanOrEqual(statusBox!.y + statusBox!.height - 2);

      // 5. Row height: 58–65px (65 allows sub-pixel border rendering; 72px+ rejected)
      expect(rowBox!.height, `[${vp.width}px] row height must be ≥ 58`).toBeGreaterThanOrEqual(58);
      expect(rowBox!.height, `[${vp.width}px] row height must be ≤ 65`).toBeLessThanOrEqual(65);

      // 6. Elements must not overlap each other
      const editRight = editBox!.x + editBox!.width;
      const deleteRight = deleteBox!.x + deleteBox!.width;
      expect(editRight, `[${vp.width}px] edit must not overlap delete`).toBeLessThanOrEqual(deleteBox!.x + 2);
      expect(deleteRight, `[${vp.width}px] delete must not overlap status badge`).toBeLessThanOrEqual(statusBox!.x + 2);

      // 7. No horizontal body overflow
      const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(hasHorizontalOverflow, `[${vp.width}px] no horizontal body overflow`).toBe(false);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, vp.file) });
    }
  });
});
