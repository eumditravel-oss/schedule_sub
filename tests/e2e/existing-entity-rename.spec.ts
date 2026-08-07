// tests/e2e/existing-entity-rename.spec.ts
import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev').trim();

async function dismissWorkerPromptModal(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('schedule_current_worker_id', 'wrk_02');
      window.localStorage.setItem('schedule_current_worker_name', '박용진 수석');
    } catch {}
  });
  await page.waitForTimeout(300);
  const modal = page.locator('[data-testid="worker-prompt-modal"]');
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pyjBtn = modal.locator('button:has-text("박용진")').or(modal.locator('button')).first();
    if (await pyjBtn.isVisible().catch(() => false)) {
      await pyjBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Existing Entity Rename & Manual Translation Protection Suite', () => {
  let createdProjectId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdProjectId) {
      await request.delete(`${BASE_URL}/api/projects/${createdProjectId}`, {
        data: { editor_name: '박용진 수석' },
      }).catch(() => {});
      createdProjectId = null;
    }
  });

  test('1. Name-only PATCH edit succeeds without date change or schedule cascade', async ({ request }) => {
    // 1. Create a test project
    const createRes = await request.post(`${BASE_URL}/api/projects`, {
      data: {
        name: 'E2E Rename Test Base',
        start_date: '2026-05-01',
        end_date: '2026-05-31',
        progress: 0,
        editor_name: '박용진 수석',
        source_language: 'ko',
        translation_status: 'COMPLETED',
      },
    });
    expect(createRes.ok()).toBe(true);
    const createJson = await createRes.json();
    createdProjectId = createJson.data.id;

    // 2. Perform Name-only PATCH
    const patchRes = await request.patch(`${BASE_URL}/api/projects/${createdProjectId}`, {
      data: {
        name: 'E2E Rename Test Changed',
        name_ko: 'E2E Rename Test Changed',
        editor_name: '박용진 수석',
      },
    });

    expect(patchRes.status()).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.success).toBe(true);
    expect(patchJson.data.id).toBe(createdProjectId);
    expect(patchJson.data.name).toBe('E2E Rename Test Changed');
    expect(patchJson.data.start_date).toBe('2026-05-01');
    expect(patchJson.data.end_date).toBe('2026-05-31');

    // 3. Verify project details via API
    const detailRes = await request.get(`${BASE_URL}/api/projects/${createdProjectId}/detail`);
    expect(detailRes.ok()).toBe(true);
    const detailJson = await detailRes.json();
    expect(detailJson.data.project.name).toBe('E2E Rename Test Changed');
    expect(detailJson.data.project.start_date).toBe('2026-05-01');
    expect(detailJson.data.project.end_date).toBe('2026-05-31');
  });

  test('2. Manual translation values (KO + VI) are preserved and NOT overwritten by AI', async ({ request, page }) => {
    // 1. Create test project with MANUAL translation
    const createRes = await request.post(`${BASE_URL}/api/projects`, {
      data: {
        name: '테스트 프로젝트 수동 번역',
        name_ko: '테스트 프로젝트 수동 번역',
        name_vi: 'Dự án kiểm thử đổi tên thủ công',
        source_language: 'ko',
        translation_status: 'MANUAL',
        start_date: '2026-05-01',
        end_date: '2026-05-31',
        editor_name: '박용진 수석',
      },
    });
    expect(createRes.ok()).toBe(true);
    const createJson = await createRes.json();
    createdProjectId = createJson.data.id;

    // 2. Perform Name PATCH with manual target translation
    const patchRes = await request.patch(`${BASE_URL}/api/projects/${createdProjectId}`, {
      data: {
        name: '테스트 프로젝트 수동 번역 수정',
        name_ko: '테스트 프로젝트 수동 번역 수정',
        name_vi: 'Dự án kiểm thử đổi tên thủ công (Updated)',
        source_language: 'ko',
        translation_status: 'MANUAL',
        editor_name: '박용진 수석',
      },
    });

    expect(patchRes.status()).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.data.name_ko).toBe('테스트 프로젝트 수동 번역 수정');
    expect(patchJson.data.name_vi).toBe('Dự án kiểm thử đổi tên thủ công (Updated)');
    expect(patchJson.data.translation_status).toBe('MANUAL');

    // 3. UI F5 Persistence Verification
    await dismissWorkerPromptModal(page);
    await page.goto(`${BASE_URL}/projects/${createdProjectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const titleEl = page.locator('h1, h2, [data-testid="project-title"]').first();
    const titleText = await titleEl.innerText();
    expect(titleText).toContain('테스트 프로젝트 수동 번역 수정');

    // Reload page (F5) and assert title persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const titleTextAfterF5 = await titleEl.innerText();
    expect(titleTextAfterF5).toContain('테스트 프로젝트 수동 번역 수정');
  });
});
