import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const evidenceDir = process.env.CP3A_SCREENSHOT_DIR || path.join(process.cwd(), 'qa', 'checkpoint3a-evidence');

async function capture(locator: any, fileName: string) {
  await mkdir(evidenceDir, { recursive: true });
  await locator.screenshot({ path: path.join(evidenceDir, fileName) });
}

test.describe('Checkpoint 3A live QA Shadow schedule evidence', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('captures manager Shadow preview, graph states, constraint, cross-project and build evidence', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      localStorage.setItem('schedule_current_worker_name', '박용진 수석');
      localStorage.setItem('schedule_test_session_id', 'CHECKPOINT3A_QA_SCREENSHOT');
    });
    await page.goto('/projects/v3qa_project_main/shadow-schedule', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('shadow-schedule-page')).toBeVisible();
    await expect(page.getByTestId('official-forecast-unchanged-notice')).toContainText('현재 공식 Forecast 일정은 변경되지 않았습니다.');
    await expect(page.getByTestId('shadow-gantt')).toBeVisible();
    await expect(page.getByLabel('Baseline').first()).toBeVisible();
    await expect(page.getByLabel('Official Forecast').first()).toBeVisible();
    await expect(page.getByLabel('Shadow Candidate').first()).toBeVisible();
    const layerZ = await page.evaluate(() => ({
      hatch: getComputedStyle(document.querySelector('[data-testid^="shadow-hatch-"]')!).zIndex,
      today: getComputedStyle(document.querySelector('[data-testid="shadow-today-line"]')!).zIndex,
      baseline: getComputedStyle(document.querySelector('[aria-label="Baseline"]')!).zIndex,
      official: getComputedStyle(document.querySelector('[aria-label="Official Forecast"]')!).zIndex,
      shadow: getComputedStyle(document.querySelector('[aria-label="Shadow Candidate"]')!).zIndex,
      actual: getComputedStyle(document.querySelector('[aria-label="Actual Progress"]')!).zIndex,
    }));
    expect(layerZ).toEqual({ hatch: '2', today: '3', baseline: '4', official: '5', shadow: '6', actual: '7' });

    const dependencySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Dependency 후보 검토' }) });
    await expect(dependencySection.getByText('PROPOSED').first()).toBeVisible();
    await expect(dependencySection.getByText('CONFIRMED').first()).toBeVisible();
    await expect(dependencySection.getByLabel('confirm dependency').first()).toBeVisible();
    await capture(dependencySection, '01-dependency-proposed-list.png');
    await capture(dependencySection, '02-dependency-confirmed-list.png');

    const diffSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Task Before / After Diff' }) });
    const earlyRow = diffSection.locator('tr').filter({ hasText: '1. 조기 완료 선행' });
    await expect(earlyRow).toContainText('-1');
    await capture(earlyRow, '03-early-completion-shadow-preview.png');

    const delayedRow = diffSection.locator('tr').filter({ hasText: 'Cross-project 동일 직원' });
    await expect(delayedRow).toContainText('+6');
    await expect(delayedRow).toContainText('APPROVAL_REQUIRED');
    await capture(delayedRow, '04-capacity-delay-shadow-preview.png');

    await expect(page.getByTestId('cross-project-warning')).toBeVisible();
    await capture(page.getByTestId('cross-project-warning'), '05-cross-project-impact.png');

    const constraintSection = page.locator('section').filter({ hasText: 'Task Constraint 설정' });
    await expect(constraintSection).toBeVisible();
    const notBeforeRow = diffSection.locator('tr').filter({ hasText: 'NOT_BEFORE' });
    await expect(notBeforeRow).toContainText('2026-08-20');
    await capture(page.locator('main').filter({ has: constraintSection }), '06-constraint-not-before.png');

    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Build:/).first()).toBeVisible();
    await capture(page.getByText(/Build:/).first().locator('..'), '08-build-fingerprint-qa.png');
  });

  test('captures CEO view-only Shadow preview', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('schedule_current_worker_id', 'wrk_00_ceo');
      localStorage.setItem('schedule_current_worker_name', 'CEO 보기 전용');
      localStorage.setItem('schedule_test_session_id', 'CHECKPOINT3A_QA_CEO_SCREENSHOT');
    });
    await page.goto('/projects/v3qa_project_main/shadow-schedule', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('shadow-executive-readonly')).toContainText('보기 전용');
    await expect(page.getByTestId('run-shadow-button')).toHaveCount(0);
    await expect(page.getByTestId('generate-dependency-button')).toHaveCount(0);
    await expect(page.getByLabel('confirm dependency')).toHaveCount(0);
    await capture(page.locator('body'), '07-ceo-view-only.png');
  });
});
