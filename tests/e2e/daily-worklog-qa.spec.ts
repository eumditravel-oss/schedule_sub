import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = process.env.CP21_SCREENSHOT_DIR || process.env.CP2_SCREENSHOT_DIR;
async function capture(page: any, fileName: string) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, fileName), fullPage: true });
}

test.describe('Checkpoint 2.1 Worklog QA consistency', () => {
  test('separates draft/stored state and keeps actor context atomic', async ({ page, request }) => {
    await page.goto('/qa/daily-worklog');
    await expect(page.getByText('QA HARNESS')).toBeVisible();
    await expect(page.getByText(/최종 직원 업무일지 UI가 아닙니다/)).toBeVisible();

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Thanh Phuong/ }).click();
    await expect(page.getByTestId('qa-loading')).toHaveCount(0);
    await expect(page.getByTestId('daily-worklog-qa-page')).toHaveAttribute('data-context-key', /wrk_03::2026-08-12::tsk_/);
    await expect(page.getByTestId('qa-revision')).toContainText('3');
    await expect(page.getByTestId('qa-stored-fact')).toContainText('MANAGER_CORRECTED');
    await expect(page.getByTestId('qa-stored-fact')).toContainText('465 min');
    await expect(page.getByTestId('qa-audit')).toContainText('Revision 3 · MANAGER_CORRECTION');
    await expect(page.getByTestId('qa-aggregate')).not.toContainText('{}');
    await expect(page.getByTestId('qa-aggregate')).toContainText('rawActualMinutes');
    await page.getByTestId('qa-actual').fill('540');
    await expect(page.getByTestId('qa-variance')).toContainText('+60');
    await expect(page.getByTestId('qa-stored-fact')).toContainText('465 min');
    await capture(page, '01-draft-stored-separated.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /박용진 수석/ }).click();
    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Thanh Phuong/ }).click();
    await expect(page.getByTestId('daily-worklog-qa-page')).toHaveAttribute('data-context-key', /wrk_03::2026-08-12::tsk_/);
    await expect(page.getByTestId('qa-office')).toContainText('VN · Asia/Ho_Chi_Minh');
    await expect(page.getByTestId('qa-stored-fact')).toContainText('465 min');
    await capture(page, '02-actor-switch-context-consistent.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Manh Cuong/ }).click();
    await expect(page.getByTestId('qa-assignment-role')).toContainText('SUPPORT');
    await expect(page.getByTestId('qa-support-notice')).toBeVisible();
    await expect(page.getByTestId('qa-progress')).toHaveCount(0);
    await expect(page.getByTestId('qa-remaining')).toHaveCount(0);
    await expect(page.getByTestId('qa-role-guard')).toContainText('SUPPORT_PROGRESS_FORBIDDEN');
    await capture(page, '03-support-role-guard.png');

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /Quoc Nhut/ }).click();
    await expect(page.getByTestId('qa-task-select')).toHaveValue('');
    await expect(page.getByTestId('qa-aggregate-empty')).toBeVisible();
    await expect(page.getByTestId('qa-category')).toHaveValue('COMPANY_DUTY');
    await expect(page.getByTestId('qa-progress')).toHaveCount(0);
    await expect(page.getByTestId('qa-role-guard')).toContainText('UNASSIGNED_TASK_WRITE_BLOCKED');
    await capture(page, '04-unassigned-non-task-policy.png');

    const unassignedTask = await request.post('/api/v3/worklogs/new/eod', {
      headers: {
        'Content-Type': 'application/json', 'Idempotency-Key': `cp21-unassigned-${Date.now()}`,
        'x-actor-employee-id': 'wrk_05', 'x-actor-user-id': 'wrk_05', 'x-test-session-id': 'CP21_E2E',
      },
      data: { employee_id: 'wrk_05', local_work_date: '2026-08-13', entries: [{ task_id: 'tsk_1785983270469_00jy', work_category: 'NORMAL_ASSIGNED_TASK', actual_minutes: 60, work_result: 'forbidden' }], gap_reason_code: 'RECORDING_OMISSION', gap_reason_text: 'QA' },
    });
    expect(unassignedTask.status()).toBe(403);
    expect(['WORKLOG_PERMISSION_DENIED', 'ASSIGNMENT_REQUIRED']).toContain((await unassignedTask.json()).error.code);

    await page.getByTestId('worker-select-btn').click();
    await page.getByRole('button', { name: /CEO 보기 전용/ }).click();
    await expect(page.getByTestId('qa-submit-morning')).toHaveCount(0);
    await expect(page.getByTestId('qa-submit-eod')).toHaveCount(0);
    await page.getByTestId('qa-verify-403').click();
    await expect(page.getByTestId('qa-result')).toContainText('WORKLOG_READ_ONLY_ACTOR · HTTP 403');
    await capture(page, '05-executive-readonly-403.png');
  });
});
