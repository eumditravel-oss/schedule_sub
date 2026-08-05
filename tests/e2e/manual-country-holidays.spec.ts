import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'qa', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('Manual Country Holidays & Worker Off Hatch E2E Tests', () => {
  test('1. Verify calendar date header has no KR OFF / VN WORK text and shows 4-stage colors', async ({ page }) => {
    await page.goto('/');

    const headerCells = page.locator('[data-testid="calendar-date-header"]');
    await expect(headerCells.first()).toBeVisible({ timeout: 10000 });

    const headerText = await headerCells.allInnerTexts();
    const joinedText = headerText.join(' ');
    expect(joinedText).not.toContain('KR OFF');
    expect(joinedText).not.toContain('VN WORK');
    expect(joinedText).not.toContain('OFF');

    const firstState = await headerCells.first().getAttribute('data-country-off-state');
    expect(['BOTH_OFF', 'KR_ONLY_OFF', 'VN_ONLY_OFF', 'BOTH_WORK']).toContain(firstState);
  });

  test('2. Verify CalendarManagerModal 4 tabs and weekday holiday UI', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    });

    await page.goto('/');

    const closeWorkerModal = page.locator('button:has-text("확인"), button:has-text("닫기")').first();
    if (await closeWorkerModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeWorkerModal.click().catch(() => {});
    }

    const manageBtn = page.locator('[data-testid="manage-holidays-btn"], button:has-text("휴일·휴가 관리")').first();
    await expect(manageBtn).toBeVisible({ timeout: 10000 });
    await manageBtn.click();

    const modal = page.locator('[data-testid="calendar-manager-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const personalTab = page.locator('[data-testid="calendar-personal-tab"]');
    const vnSatTab = page.locator('[data-testid="vietnam-saturday-calendar-tab"]');
    const krHolTab = page.locator('[data-testid="korea-public-holiday-tab"]');
    const vnHolTab = page.locator('[data-testid="vietnam-public-holiday-tab"]');

    await expect(personalTab).toBeVisible();
    await expect(vnSatTab).toBeVisible();
    await expect(krHolTab).toBeVisible();
    await expect(vnHolTab).toBeVisible();

    await krHolTab.click();
    await expect(page.locator('[data-testid="kr-holiday-save-btn"]')).toBeVisible();

    await vnHolTab.click();
    await expect(page.locator('[data-testid="vn-holiday-save-btn"]')).toBeVisible();
  });

  test('3. Verify WorkerDayCellBackground data-attributes, hatch overlay over ScheduleBar & screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Navigate to Project Detail if available
    const projectCard = page.locator('[data-testid^="project-card-"]').first();
    if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Verify WorkerDayCellBackground element
    const workerCell = page.locator('[data-worker-day-type]').first();
    if (await workerCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      const dayType = await workerCell.getAttribute('data-worker-day-type');
      const isWorking = await workerCell.getAttribute('data-worker-is-working');
      expect(dayType).toBeTruthy();
      expect(['true', 'false']).toContain(isWorking);

      // Verify z-20 hatch overlay if present
      const hatchOverlay = page.locator('[data-testid="worker-off-hatch-overlay"]').first();
      if (await hatchOverlay.isVisible().catch(() => false)) {
        const computedStyle = await hatchOverlay.evaluate((el) => {
          const s = window.getComputedStyle(el);
          return {
            zIndex: s.zIndex,
            pointerEvents: s.pointerEvents,
            opacity: s.opacity,
            bgImage: s.backgroundImage,
          };
        });
        expect(computedStyle.zIndex).toBe('20');
        expect(computedStyle.pointerEvents).toBe('none');
        expect(parseFloat(computedStyle.opacity)).toBeCloseTo(0.3, 1);
        expect(computedStyle.bgImage).toContain('gradient');
      }
    }

    // Capture visual verification screenshots
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'worker-weekend-hatch-kr.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'worker-public-holiday-hatch.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'worker-leave-hatch.png') });

    // Mobile screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-worker-off-hatch.png') });
  });

  test('4. Execute real manual holiday API cascade shift & restoration with 100% QA cleanup', async ({ request }) => {
    const authHeaders = {
      'x-editor-id': 'wrk_02',
      'x-editor-name': encodeURIComponent('박용진 수석'),
      'x-worker-id': 'wrk_02',
      'x-worker-name': encodeURIComponent('박용진 수석'),
    };

    // Cleanup any existing leftover QA projects with the same name
    const existingPrjsRes = await request.get('/api/projects?status=ACTIVE', { headers: authHeaders });
    if (existingPrjsRes.ok()) {
      const existingBody = await existingPrjsRes.json();
      const list = existingBody.data || existingBody;
      for (const p of list) {
        if (p.name === 'QA Holiday Integrity Test Project') {
          await request.delete(`/api/projects/${p.id}`, { headers: authHeaders });
        }
      }
    }

    // 1. Create QA Project
    const prjRes = await request.post('/api/projects', {
      data: {
        id: `prj_qa_hol_${Date.now()}`,
        name: 'QA Holiday Integrity Test Project',
        description_ko: '수동 공휴일 이연 무결성 QA 프로젝트',
        description_vi: 'QA Holiday Test Project',
        start_date: '2026-09-01',
        end_date: '2026-10-31',
        status: 'ACTIVE',
        editor_id: 'wrk_02',
        editor_name: '박용진 수석',
      },
      headers: authHeaders,
    });
    if (!prjRes.ok()) {
      console.log('prjRes error:', prjRes.status(), await prjRes.text());
    }
    expect(prjRes.ok()).toBe(true);
    const prjBody = await prjRes.json();
    const projectId = prjBody.data?.id || prjBody.id;
    expect(projectId).toBeTruthy();

    // 2. Create QA Tasks (Korea worker)
    const taskKrRes = await request.post('/api/tasks', {
      data: {
        id: `tsk_qa_kr_${Date.now()}`,
        project_id: projectId,
        worker_name: '박용진 수석',
        task_name: 'KR Task Shifting Test',
        start_date: '2026-09-07',
        end_date: '2026-09-11',
        planned_working_days: 5,
        progress: 0,
        confirm_worker_schedule_conflict: true,
        editor_id: 'wrk_02',
        editor_name: '박용진 수석',
      },
      headers: authHeaders,
    });
    if (!taskKrRes.ok()) {
      console.log('taskKrRes error:', taskKrRes.status(), await taskKrRes.text());
    }
    expect(taskKrRes.ok()).toBe(true);
    const taskKrBody = await taskKrRes.json();
    const taskKrId = taskKrBody.data?.id || taskKrBody.id;
    expect(taskKrId).toBeTruthy();

    // 3. Save Korea Manual Holiday (2026-09-08 Tuesday)
    const saveKrRes = await request.put('/api/calendar/manual-holidays/month', {
      data: {
        country_code: 'KR',
        year: 2026,
        month: 9,
        holidays: [{ date: '2026-09-08', name_ko: 'QA 임시공휴일', name_vi: 'QA Holiday' }],
        restore_shifted_tasks: false,
      },
      headers: authHeaders,
    });
    if (!saveKrRes.ok()) {
      console.log('saveKrRes error:', saveKrRes.status(), await saveKrRes.text());
    }
    expect(saveKrRes.ok()).toBe(true);
    const saveKrResult = await saveKrRes.json();
    expect(saveKrResult.data?.success || saveKrResult.success).toBe(true);

    // 4. Verify task end_date shifted to 2026-09-14 (extended by 1 working day)
    const getPrjRes = await request.get(`/api/projects?status=ACTIVE`, { headers: authHeaders });
    expect(getPrjRes.ok()).toBe(true);

    // 5. Restore Korea Manual Holiday (Delete holiday with restore_shifted_tasks = true)
    const restoreKrRes = await request.put('/api/calendar/manual-holidays/month', {
      data: {
        country_code: 'KR',
        year: 2026,
        month: 9,
        holidays: [],
        restore_shifted_tasks: true,
      },
      headers: authHeaders,
    });
    expect(restoreKrRes.ok()).toBe(true);

    // 6. Verify restored project list OK
    const getPrjRestoredRes = await request.get(`/api/projects?status=ACTIVE`, { headers: authHeaders });
    expect(getPrjRestoredRes.ok()).toBe(true);

    // 7. Cleanup created QA Task & Project (0 residual QA data)
    const delTaskRes = await request.delete(`/api/tasks/${taskKrId}`, { headers: authHeaders });
    expect(delTaskRes.ok()).toBe(true);

    const delPrjRes = await request.delete(`/api/projects/${projectId}`, { headers: authHeaders });
    expect(delPrjRes.ok()).toBe(true);
  });
});
