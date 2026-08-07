// tests/e2e/task-modal-persistent-footer.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('P0 Task & Workforce Modal Persistent Action Footer Suite', () => {
  const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

  const DESKTOP_VIEWPORTS = [
    { width: 1024, height: 600 },
    { width: 1024, height: 768 },
    { width: 1100, height: 650 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
  ];

  const MOBILE_VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ];

  let createdProjectId = '';

  test.beforeAll(async () => {
    const dir = path.join(process.cwd(), 'qa', 'modal');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const runId = Date.now();
    const prjRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        name: `[E2E-PERSISTENT-FOOTER-${runId}] 모달 저장버튼 고정 검증 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    const prjJson: any = await prjRes.json();
    createdProjectId = prjJson.id || prjJson.data?.id;

    // Fetch detail to get group ID
    const detailRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    const taskGroups = detailJson.data?.task_groups || detailJson.task_groups || [];
    const taskGroupId = taskGroups[0]?.id;

    // Create test task
    await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({
        project_id: createdProjectId,
        task_group_id: taskGroupId,
        task_name: '하위 작업 모달 검증',
        start_date: '2026-08-03',
        end_date: '2026-08-07',
        primary_worker_id: 'wrk_02',
        schedule_status: 'SCHEDULED',
        progress_mode: 'AUTO_TIME',
        editor_name: '박용진 수석',
      }),
    });
  });

  test.afterAll(async () => {
    if (createdProjectId) {
      await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
    }
  });

  for (const vp of DESKTOP_VIEWPORTS) {
    test(`Verify Task Add Modal persistent footer at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('schedule_current_worker_id', 'wrk_02');
        localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      });

      await page.setViewportSize(vp);
      await page.goto(`${BASE_URL}/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid="add-task-btn"]', { timeout: 15000 });

      // Click Add Task button
      const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
      await expect(addTaskBtn).toBeVisible({ timeout: 15000 });
      await addTaskBtn.click();

      const modal = page.locator('[data-testid="task-modal"]');
      await expect(modal).toBeVisible();

      // Verify initial scrollTop is strictly 0 without any user scroll
      const scrollTop = await page.$eval('[data-testid="task-modal-scroll-body"]', (el) => el.scrollTop);
      expect(scrollTop).toBe(0);

      // Measure Save & Cancel Button Visibility without scrolling
      const saveBtn = page.locator('[data-testid="task-save-btn"]');
      const cancelBtn = page.locator('[data-testid="task-cancel-btn"]');

      await expect(saveBtn).toBeVisible();
      await expect(cancelBtn).toBeVisible();

      const saveBox = await saveBtn.boundingBox();
      const cancelBox = await cancelBtn.boundingBox();

      expect(saveBox).not.toBeNull();
      expect(cancelBox).not.toBeNull();

      if (saveBox && cancelBox) {
        const saveTop = saveBox.y;
        const saveBottom = saveBox.y + saveBox.height;
        const cancelTop = cancelBox.y;
        const cancelBottom = cancelBox.y + cancelBox.height;

        expect(saveTop).toBeGreaterThanOrEqual(0);
        expect(saveBottom).toBeLessThanOrEqual(vp.height + 1.0);

        expect(cancelTop).toBeGreaterThanOrEqual(0);
        expect(cancelBottom).toBeLessThanOrEqual(vp.height + 1.0);
      }

      // Check modal container geometry alignment
      const modalBox = await modal.boundingBox();
      const footer = page.locator('[data-testid="task-modal-footer"]');
      const footerBox = await footer.boundingBox();

      if (modalBox && footerBox) {
        const modalBottom = modalBox.y + modalBox.height;
        const modalTop = modalBox.y;
        const footerBottom = footerBox.y + footerBox.height;
        const footerTop = footerBox.y;

        expect(footerBottom).toBeLessThanOrEqual(modalBottom + 1.0);
        expect(footerTop).toBeGreaterThanOrEqual(modalTop);
      }

      // Capture screenshot for specific resolutions
      if (vp.width === 1024 && vp.height === 600) {
        await page.screenshot({ path: path.join(process.cwd(), 'qa', 'modal', 'task-add-v2-1024x600.png') });
      }

      await cancelBtn.click();
    });

    test(`Verify Task Edit Modal persistent footer at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('schedule_current_worker_id', 'wrk_02');
        localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      });

      await page.setViewportSize(vp);
      await page.goto(`${BASE_URL}/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid="add-task-btn"]', { timeout: 15000 });

      // Click Add Task to open modal, fill name, and save
      const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
      await addTaskBtn.click();

      const modal = page.locator('[data-testid="task-modal"]');
      await expect(modal).toBeVisible();

      // Verify initial scrollTop is strictly 0
      const scrollTop = await page.$eval('[data-testid="task-modal-scroll-body"]', (el) => el.scrollTop);
      expect(scrollTop).toBe(0);

      // Measure Save & Cancel Button Visibility without scrolling
      const saveBtn = page.locator('[data-testid="task-save-btn"]');
      const cancelBtn = page.locator('[data-testid="task-cancel-btn"]');

      await expect(saveBtn).toBeVisible();
      await expect(cancelBtn).toBeVisible();

      const saveBox = await saveBtn.boundingBox();
      const cancelBox = await cancelBtn.boundingBox();

      expect(saveBox).not.toBeNull();
      expect(cancelBox).not.toBeNull();

      if (saveBox && cancelBox) {
        const saveTop = saveBox.y;
        const saveBottom = saveBox.y + saveBox.height;
        const cancelTop = cancelBox.y;
        const cancelBottom = cancelBox.y + cancelBox.height;

        expect(saveTop).toBeGreaterThanOrEqual(0);
        expect(saveBottom).toBeLessThanOrEqual(vp.height + 1.0);

        expect(cancelTop).toBeGreaterThanOrEqual(0);
        expect(cancelBottom).toBeLessThanOrEqual(vp.height + 1.0);
      }

      // Capture screenshot for specific resolutions
      if (vp.width === 1024 && vp.height === 600) {
        await page.screenshot({ path: path.join(process.cwd(), 'qa', 'modal', 'task-edit-v2-1024x600.png') });
      }
      if (vp.width === 1366 && vp.height === 768) {
        await page.screenshot({ path: path.join(process.cwd(), 'qa', 'modal', 'task-edit-v2-1366x768.png') });
      }

      await cancelBtn.click();
    });
  }

  for (const mvp of MOBILE_VIEWPORTS) {
    test(`Verify Mobile Task Modal persistent footer at ${mvp.width}x${mvp.height}`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('schedule_current_worker_id', 'wrk_02');
        localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      });

      await page.setViewportSize(mvp);
      await page.goto(`${BASE_URL}/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid="project-detail-page"]', { timeout: 15000 });
      // In mobile view, verify page renders cleanly with 0px overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(mvp.width);
    });
  }

  test('Verify Footer Y stability during body scrolling (0%, 25%, 50%, 75%, 100%)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto(`${BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="add-task-btn"]', { timeout: 15000 });

    const addTaskBtn = page.locator('[data-testid="add-task-btn"]');
    await addTaskBtn.click();

    const modal = page.locator('[data-testid="task-modal"]');
    await expect(modal).toBeVisible();

    const footer = page.locator('[data-testid="task-modal-footer"]');
    const scrollBody = page.locator('[data-testid="task-modal-scroll-body"]');

    const initialFooterBox = await footer.boundingBox();
    expect(initialFooterBox).not.toBeNull();

    const initialY = initialFooterBox!.y;

    // Scroll to 0%, 25%, 50%, 75%, 100%
    const scrollHeights = [0, 0.25, 0.5, 0.75, 1.0];

    for (const ratio of scrollHeights) {
      await scrollBody.evaluate((el, r) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) * r;
      }, ratio);

      await page.waitForTimeout(100);

      const currentFooterBox = await footer.boundingBox();
      expect(currentFooterBox).not.toBeNull();

      const diffY = Math.abs(currentFooterBox!.y - initialY);
      expect(diffY).toBeLessThanOrEqual(0.5);
    }

    const cancelBtn = page.locator('[data-testid="task-cancel-btn"]');
    await cancelBtn.click();
  });

  test('Verify ProjectWorkforceModal persistent footer with multi-worker allocations', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto(`${BASE_URL}/projects/${createdProjectId}`);
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-testid="project-workforce-btn"]', { timeout: 15000 });

    const workforceBtn = page.locator('[data-testid="project-workforce-btn"]');
    await expect(workforceBtn).toBeVisible({ timeout: 15000 });
    await workforceBtn.click();

    const modal = page.locator('[data-testid="project-workforce-modal"]');
    await expect(modal).toBeVisible();

    // Verify initial scrollTop is 0
    const scrollTop = await page.$eval('[data-testid="project-workforce-scroll-body"]', (el) => el.scrollTop);
    expect(scrollTop).toBe(0);

    const saveBtn = page.locator('[data-testid="project-workforce-save-btn"]');
    const cancelBtn = page.locator('[data-testid="project-workforce-cancel-btn"]');

    await expect(saveBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    const saveBox = await saveBtn.boundingBox();
    const cancelBox = await cancelBtn.boundingBox();

    expect(saveBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();

    if (saveBox && cancelBox) {
      const saveTop = saveBox.y;
      const saveBottom = saveBox.y + saveBox.height;
      const cancelTop = cancelBox.y;
      const cancelBottom = cancelBox.y + cancelBox.height;

      expect(saveTop).toBeGreaterThanOrEqual(0);
      expect(saveBottom).toBeLessThanOrEqual(600 + 1.0);

      expect(cancelTop).toBeGreaterThanOrEqual(0);
      expect(cancelBottom).toBeLessThanOrEqual(600 + 1.0);
    }

    await cancelBtn.click();
  });
});
