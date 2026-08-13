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

async function mockWorklogApi(page: any, onEod?: (body: any) => void) {
  await page.route('**/api/**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const ok = (data: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (url.pathname === '/api/workers') return ok(workers);
    if (url.pathname === '/api/v3/worklogs/context') {
      const employeeId = url.searchParams.get('employee_id') || 'wrk_primary';
      if (employeeId === 'wrk_primary') await new Promise((resolve) => setTimeout(resolve, 250));
      return ok(contextFor(employeeId));
    }
    if (url.pathname.startsWith('/api/v3/tasks/') && url.pathname.endsWith('/actual')) {
      return ok({ aggregate: { current_progress: 10, remaining_estimated_minutes: 480, completion_reported: false } });
    }
    if (url.pathname === '/api/v3/worklogs') return ok([]);
    if (request.method() === 'POST' && url.pathname.endsWith('/eod')) {
      onEod?.(request.postDataJSON());
      return ok({ worklog_id: 'worklog-1', revision_id: 'revision-1', revision_number: 1, status: 'EOD_SUBMITTED', shadowRecalculation: { status: 'DISABLED' } }, 201);
    }
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
    await page.getByRole('button', { name: '제출' }).click();
    await expect.poll(() => posted).not.toBeNull();
    expect(posted.entries[0]).toMatchObject({ task_id: 'task-primary', actual_minutes: 420, progress_after: 20, remaining_estimated_minutes: 420 });
  });

  test('keeps Support progress fields hidden and ignores a late prior-actor response', async ({ page }) => {
    await mockWorklogApi(page);
    await page.addInitScript(() => localStorage.setItem('schedule_current_worker_id', 'wrk_primary'));
    await page.goto('/worklog/today');
    await page.getByLabel('현재 사용자').selectOption('wrk_support');
    await page.getByRole('button', { name: '업무 마감' }).click();
    await expect(page.getByText('지원 담당자는 작업 전체 공정률·남은 예상시간·완료 보고를 입력하지 않습니다.')).toBeVisible();
    await expect(page.getByLabel('현재 공정률 (%)')).toHaveCount(0);
    await expect(page.getByLabel('남은 예상시간 (분)')).toHaveCount(0);
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
});
