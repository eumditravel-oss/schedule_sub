import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = process.env.CP2_SCREENSHOT_DIR;

async function capture(page: any, fileName: string) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, fileName), fullPage: true });
}

test.describe('Checkpoint 2 Daily Worklog QA Harness', () => {
  test('shows VN/KR office policy and separates executive read-only mode', async ({ page, request }) => {
    await page.goto('/qa/daily-worklog');
    await expect(page.getByTestId('daily-worklog-qa-page')).toBeVisible();
    await expect(page.getByText('Checkpoint 2: Actual / Capacity Foundation')).toBeVisible();

    await expect(page.getByTestId('qa-office')).toContainText('KR · Asia/Seoul');
    await expect(page.getByTestId('qa-capacity')).toContainText('420 min');
    await capture(page, '02-korea-capacity-420.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Thanh Phuong/ }).click();
    await expect(page.getByTestId('qa-office')).toContainText('VN · Asia/Ho_Chi_Minh');
    await expect(page.getByTestId('qa-hours')).toContainText('08:00–17:00 · 12:00–13:00');
    await expect(page.getByTestId('qa-capacity')).toContainText('480 min');
    await expect(page.getByTestId('qa-assignment-role')).toContainText('PRIMARY');
    await expect(page.getByTestId('qa-role-guard')).toContainText('PRIMARY_PROGRESS_ALLOWED');
    await expect(page.getByTestId('qa-stored-fact')).toContainText('Stored Actual');
    await capture(page, '01-vietnam-capacity-480.png');
    await capture(page, '03-primary-eod-actual-progress-revision.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Manh Cuong/ }).click();
    await expect(page.getByTestId('qa-assignment-role')).toContainText('CO_ASSIGNEE');
    await expect(page.getByTestId('qa-role-guard')).toContainText('SUPPORT_PROGRESS_FORBIDDEN');
    await capture(page, '05-support-progress-forbidden.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Quoc Nhut/ }).click();
    await expect(page.getByTestId('qa-stored-fact')).toContainText('60 min · PENDING_REVIEW');
    await capture(page, '04-overtime-pending-review.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /CEO 보기 전용/ }).click();
    await expect(page.getByTestId('qa-office')).toContainText('KR · Asia/Seoul');
    await expect(page.getByTestId('qa-hours')).toContainText('09:00–17:00 · 12:00–13:00');
    await expect(page.getByTestId('qa-capacity')).toContainText('420 min');
    await expect(page.getByTestId('qa-readonly-guard')).toBeVisible();
    await expect(page.getByTestId('qa-submit-morning')).toBeDisabled();
    await expect(page.getByTestId('qa-submit-eod')).toBeDisabled();
    await expect(page.getByTestId('qa-role-guard')).toContainText('WORKLOG_READ_ONLY_ACTOR');
    await capture(page, '06-ceo-read-only-403.png');

    const response = await request.post('/api/v3/worklogs/morning', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `e2e-ceo-${Date.now()}`,
        'x-actor-employee-id': 'wrk_00_ceo',
        'x-actor-user-id': 'wrk_00_ceo',
        'x-selected-view-employee-id': 'wrk_03',
        'x-test-session-id': 'CP2_E2E_READ_ONLY',
      },
      data: { employee_id: 'wrk_00_ceo', local_work_date: '2026-08-12', entries: [{ work_category: 'COMPANY_DUTY', planned_minutes: 60 }] },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe('WORKLOG_READ_ONLY_ACTOR');
  });
});
