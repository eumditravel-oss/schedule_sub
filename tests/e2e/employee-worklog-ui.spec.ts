import { expect, test } from '@playwright/test';

const workers = [
  { id: 'wrk_primary', name: 'Park Primary', country_code: 'KR', access_role: 'EDITOR', ui_language: 'ko', is_active: 1, sort_order: 1 },
  { id: 'wrk_support', name: 'Thanh Support', country_code: 'VN', access_role: 'EDITOR', ui_language: 'vi', is_active: 1, sort_order: 2 },
  { id: 'wrk_ceo', name: 'CEO', country_code: 'KR', access_role: 'VIEWER', ui_language: 'ko', is_active: 1, sort_order: 3 },
];

function contextFor(employeeId: string) {
  const support = employeeId === 'wrk_support';
  const ceo = employeeId === 'wrk_ceo';
  const task = support
    ? { task_id: 'task-support', project_id: 'project-1', project_name: 'GROUPWARE', task_name: 'API 지원', assignment_id: 'assign-support', assignment_role: 'CO_ASSIGNEE', official_forecast_start: '2026-08-13', official_forecast_end: '2026-08-13' }
    : { task_id: 'task-primary', project_id: 'project-1', project_name: 'GROUPWARE', task_name: 'API 개발', assignment_id: 'assign-primary', assignment_role: 'PRIMARY', official_forecast_start: '2026-08-13', official_forecast_end: '2026-08-13' };
  return {
    actor: { employee_id: employeeId, access_role: ceo ? 'VIEWER' : 'EDITOR', is_manager: false },
    subject: { id: employeeId, name: workers.find((worker) => worker.id === employeeId)?.name || employeeId, country_code: support ? 'VN' : 'KR', ui_language: support ? 'vi' : 'ko' },
    subject_employee_id: employeeId, local_work_date: '2026-08-13',
    capacity: { office_code: support ? 'VN' : 'KR', timezone: support ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul', work_start_local: support ? '08:00' : '09:00', work_end_local: '17:00', lunch_start_local: '12:00', lunch_end_local: '13:00', effective_capacity_minutes: support ? 480 : 420 },
    permissions: { can_read: true, can_write_self: !ceo, can_manager_correct: false, is_read_only: ceo },
    scheduled_tasks: ceo ? [] : [task], eligible_tasks: ceo ? [] : [task],
    worklog: { status: 'NOT_CREATED', current_revision_number: 0 },
  };
}

async function mockWorklogApi(page: any, onEod?: (body: any) => void, options: { delayEod?: boolean; shadowStatus?: string; currentEod?: boolean; delayHistoryDetail?: boolean; eodKeys?: string[] } = {}) {
  await page.route('**/api/**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const ok = (data: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (url.pathname === '/api/workers') return ok(workers);
    if (url.pathname === '/api/v3/worklogs/context') {
      const employeeId = url.searchParams.get('employee_id') || 'wrk_primary';
      if (employeeId === 'wrk_primary') await new Promise((resolve) => setTimeout(resolve, 250));
      const context = contextFor(employeeId);
      if (options.currentEod && employeeId === 'wrk_primary') {
        context.worklog = {
          id: 'saved-worklog', status: 'EOD_SUBMITTED', current_revision_number: 2,
          current_eod_revision_id: 'saved-eod', entries: [{ id: 'saved-entry', phase: 'EOD', revision_id: 'saved-eod', task_id: 'task-primary', project_id: 'project-1', assignment_id: 'assign-primary', assignment_role: 'PRIMARY', work_category: 'NORMAL_ASSIGNED_TASK', actual_minutes: 240, progress_after: 25, remaining_estimated_minutes: 300, work_result: 'authoritative server entry' }],
        };
      }
      return ok(context);
    }
    if (url.pathname.startsWith('/api/v3/tasks/') && url.pathname.endsWith('/actual')) {
      return ok({ aggregate: { current_progress: 10, remaining_estimated_minutes: 480, completion_reported: false } });
    }
    if (url.pathname === '/api/v3/worklogs') return ok([{ id: 'history-primary', local_work_date: '2026-08-12', status: 'EOD_SUBMITTED', current_revision_number: 1, actual_recorded_minutes: 420 }]);
    if (url.pathname === '/api/v3/worklogs/history-primary') {
      if (options.delayHistoryDetail) await new Promise((resolve) => setTimeout(resolve, 350));
      return ok({ id: 'history-primary', local_work_date: '2026-08-12', status: 'EOD_SUBMITTED', timezone: 'Asia/Seoul', revisions: [], entries: [{ id: 'history-entry', phase: 'EOD', work_category: 'NORMAL_ASSIGNED_TASK', actual_minutes: 420, work_result: 'primary confidential history' }] });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/eod')) {
      onEod?.(request.postDataJSON());
      options.eodKeys?.push(request.headers()['idempotency-key'] || '');
      if (options.delayEod) await new Promise((resolve) => setTimeout(resolve, 350));
      return ok({ worklog_id: 'worklog-1', revision_id: 'revision-1', revision_number: 1, status: 'EOD_SUBMITTED', shadowRecalculation: { status: options.shadowStatus || 'DISABLED', requestId: 'shadow-request-1' } }, 201);
    }
    if (url.pathname === '/api/v3/worklogs/worklog-1/shadow-status') return ok({ request: { request_id: 'shadow-request-1', status: options.shadowStatus || 'PENDING' }, run: null, versions: [], impacts: [] });
    if (request.method() === 'POST' && url.pathname === '/api/v3/worklogs/morning') return ok({ worklog_id: 'worklog-1', revision_id: 'revision-1', revision_number: 1, status: 'MORNING_SUBMITTED' }, 201);
    return ok({});
  });
}

test.describe('Checkpoint 4 employee worklog UI', () => {
  test('submits Primary EOD through the formal UI without a QA harness', async ({ page }) => {
    let posted: any = null;
    await mockWorklogApi(page, (body) => { posted = body; });
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await expect(page.getByTestId('employee-worklog-page')).toBeVisible();
    await expect(page.getByText('QA HARNESS')).toHaveCount(0);
    await page.getByRole('button', { name: '업무 마감' }).click();
    await page.getByLabel('실제 작업시간 (분)').fill('420');
    await page.getByLabel('현재 공정률 (%)').fill('20');
    await page.getByLabel('남은 예상시간 (분)').fill('420');
    await page.getByLabel('오늘 수행내용').fill('API endpoint implementation');
    await page.getByRole('button', { name: '오늘 업무 마감' }).click();
    await expect(page.getByRole('dialog', { name: '제출 전 확인' })).toBeVisible();
    await page.getByRole('button', { name: '제출', exact: true }).click();
    await expect.poll(() => posted).not.toBeNull();
    expect(posted.entries[0]).toMatchObject({ task_id: 'task-primary', actual_minutes: 420, progress_after: 20, remaining_estimated_minutes: 420 });
  });

  test('keeps Support progress fields hidden and ignores a late prior-actor response', async ({ page }) => {
    await mockWorklogApi(page);
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await page.getByLabel('현재 사용자').selectOption('wrk_support');
    await page.getByTestId('worklog-mode-eod').click();
    await expect(page.locator('p').filter({ hasText: /작업 전체 공정률|tiến độ tổng/ })).toBeVisible();
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await page.waitForTimeout(350);
    await expect(page.getByText('API 지원')).toBeVisible();
    await expect(page.getByText('API 개발')).toHaveCount(0);
  });

  test('renders CEO as read-only and fits mobile width without horizontal overflow', async ({ page }) => {
    await mockWorklogApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_ceo'));
    await page.goto('/worklog/today');
    await expect(page.locator('div').filter({ hasText: /^조회 전용 사용자입니다\.$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '오늘 업무계획 제출' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '오늘 업무 마감' })).toHaveCount(0);
    const metrics = await page.locator('body').evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  });

  test('does not leak a delayed Primary submission into the next actor view', async ({ page }) => {
    await mockWorklogApi(page, undefined, { delayEod: true });
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await page.getByTestId('worklog-mode-eod').click();
    await page.getByTestId('worklog-eod-minutes').fill('420');
    await page.getByTestId('worklog-progress-after').fill('20');
    await page.getByTestId('worklog-remaining-minutes').fill('420');
    await page.getByTestId('worklog-work-result').fill('delayed primary save');
    await page.getByTestId('worklog-open-submit-review').click();
    await page.locator('[role="dialog"] button').last().click();
    await page.locator('select').first().selectOption('wrk_support');
    await page.waitForTimeout(500);
    await expect(page.locator('select').first()).toHaveValue('wrk_support');
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByTestId('schedule-impact-result')).toHaveCount(0);
  });

  test('keeps the authoritative EOD revision ahead of an old browser draft', async ({ page }) => {
    await mockWorklogApi(page, undefined, { currentEod: true });
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_primary');
      localStorage.setItem('worklog-draft:v1:wrk_primary:2026-08-13:EOD', JSON.stringify([{ id: 'stale', category: 'ADMINISTRATION', actualMinutes: 420, workResult: 'stale local draft' }]));
    });
    await page.goto('/worklog/today?date=2026-08-13');
    await expect(page.getByTestId('worklog-work-result')).toHaveValue('authoritative server entry');
    await expect(page.getByTestId('worklog-work-result')).not.toHaveValue('stale local draft');
  });

  test('shows an initial Shadow failure without polling it as pending', async ({ page }) => {
    let statusReads = 0;
    await mockWorklogApi(page, undefined, { shadowStatus: 'FAILED_RETRYABLE' });
    await page.route('**/api/v3/worklogs/worklog-1/shadow-status', async (route: any) => { statusReads += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) }); });
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await page.getByTestId('worklog-mode-eod').click();
    await page.getByTestId('worklog-eod-minutes').fill('420');
    await page.getByTestId('worklog-progress-after').fill('20');
    await page.getByTestId('worklog-remaining-minutes').fill('420');
    await page.getByTestId('worklog-work-result').fill('save with failed shadow');
    await page.getByTestId('worklog-open-submit-review').click();
    await page.locator('[role="dialog"] button').last().click();
    await expect(page.getByTestId('schedule-impact-result')).toBeVisible();
    await expect.poll(() => statusReads).toBe(0);
  });

  test('uses the VN employee local date when no date is supplied', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-13T16:30:00.000Z') });
    await mockWorklogApi(page);
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_support'));
    await page.goto('/worklog/today');
    await expect(page.locator('input[type="date"]')).toHaveValue('2026-08-13');
  });

  test('does not display a delayed prior Actor history modal after switching Actor', async ({ page }) => {
    await mockWorklogApi(page, undefined, { delayHistoryDetail: true });
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await page.getByRole('button', { name: /최근|gần đây/i }).click();
    await page.getByText('2026-08-12').click();
    await page.locator('select').first().selectOption('wrk_support');
    await page.waitForTimeout(500);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.getByText('primary confidential history')).toHaveCount(0);
  });

  test('uses a new EOD idempotency key after the Actor changes', async ({ page }) => {
    const eodKeys: string[] = [];
    await mockWorklogApi(page, undefined, { delayEod: true, eodKeys });
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await page.getByTestId('worklog-mode-eod').click();
    await page.getByTestId('worklog-eod-minutes').fill('420');
    await page.getByTestId('worklog-progress-after').fill('20');
    await page.getByTestId('worklog-remaining-minutes').fill('420');
    await page.getByTestId('worklog-work-result').fill('first actor');
    await page.getByTestId('worklog-open-submit-review').click(); await page.locator('[role="dialog"] button').last().click();
    await page.locator('select').first().selectOption('wrk_support');
    await page.waitForTimeout(500);
    await page.getByTestId('worklog-mode-eod').click();
    await page.getByTestId('worklog-eod-minutes').fill('480');
    await page.getByTestId('worklog-work-result').fill('second actor');
    await page.getByTestId('worklog-open-submit-review').click(); await page.locator('[role="dialog"] button').last().click();
    await expect.poll(() => eodKeys.length).toBe(2);
    expect(eodKeys[0]).not.toBe(eodKeys[1]);
  });
});
