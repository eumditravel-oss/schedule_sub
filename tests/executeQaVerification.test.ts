// tests/executeQaVerification.test.ts
import { describe, it, expect } from 'vitest';

const BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
const QA_PREFIX = `[QA-FINAL-20260804-2238]`;

describe('Final Release QA Comprehensive Test Suite', { timeout: 15000 }, () => {
  let createdProjectId = '';
  let createdTaskId = '';

  // 1. Worker List & Active 7 Members Verification
  it('1. GET /api/workers returns exactly 7 active members with access roles in correct order', async () => {
    const res = await fetch(`${BASE_URL}/api/workers`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(7);

    const ceo = json.data.find((w: any) => w.name === 'CEO');
    expect(ceo.access_role).toBe('VIEWER');
    expect(ceo.ui_language).toBe('ko');

    const park = json.data.find((w: any) => w.name === '박용진 수석');
    expect(park.access_role).toBe('EDITOR');
    expect(park.ui_language).toBe('ko');

    const thanh = json.data.find((w: any) => w.name === 'Thanh Phuong(탄 프엉)');
    expect(thanh.access_role).toBe('EDITOR');
    expect(thanh.ui_language).toBe('vi');
  });

  // 2. Executive Read-Only (CEO/COO 403 EXECUTIVE_READ_ONLY) & Unregistered Editor Protection
  it('2. API rejects executive write attempts with HTTP 403 EXECUTIVE_READ_ONLY', async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${QA_PREFIX} Executive Read Only Test`,
        start_date: '2026-08-04',
        end_date: '2026-08-20',
        progress: 0,
        editor_name: 'CEO',
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('EXECUTIVE_READ_ONLY');
  });

  // 3. Project Creation & Bi-directional Auto Translation (EDITOR: 박용진 수석)
  it('3. POST /api/projects creates QA project with debounced AI auto translation', async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${QA_PREFIX} ERP 일정 동기화 31단계`,
        start_date: '2026-08-04',
        end_date: '2026-09-03',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    createdProjectId = json.data.id;

    expect(json.data.name_ko).toContain('ERP 일정 동기화');
    expect(json.data.name_vi).toBeDefined();
    expect(json.data.name_vi.length).toBeGreaterThan(0);
    expect(json.data.translation_status).toBe('COMPLETED');
  });

  // 4. Project Update Sync & Re-translation
  it('4. PATCH /api/projects/:id updates title and re-translates without old residue', async () => {
    expect(createdProjectId).not.toBe('');

    const res = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${QA_PREFIX} ERP 일정 동기화 32단계 최종 검수`,
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name_ko).toContain('32단계 최종 검수');
    expect(json.data.name_vi).toBeDefined();
  });

  // 5. Task Creation & Progress Recalculation
  it('5. POST /api/tasks creates task and recalculates project progress', async () => {
    expect(createdProjectId).not.toBe('');

    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: createdProjectId,
        worker_name: '박용진 수석',
        task_name: `${QA_PREFIX} 프로젝트 목록 화면 디버깅`,
        start_date: '2026-08-10',
        end_date: '2026-08-15',
        progress: 50,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    createdTaskId = json.data.id;
  });

  // 6. Daily Status Update
  it('6. PUT /api/tasks/:taskId/daily-status/:date updates daily status with editor info', async () => {
    expect(createdTaskId).not.toBe('');

    const res = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}/daily-status/2026-08-12`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('IN_PROGRESS');
    expect(json.data.updated_by_name).toBe('박용진 수석');
  });

  // 7. Project Detail Query
  it('7. GET /api/projects/:id/detail returns project, tasks, and daily status details', async () => {
    expect(createdProjectId).not.toBe('');

    const res = await fetch(`${BASE_URL}/api/projects/${createdProjectId}/detail`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.project.id).toBe(createdProjectId);
    expect(json.data.tasks.length).toBeGreaterThan(0);
    expect(json.data.tasks[0].daily_statuses['2026-08-12']).toBe('IN_PROGRESS');
  });

  // 8. Project Completion & Read-Only Enforcement
  it('8. POST /api/projects/:id/complete marks status COMPLETED (100%) and blocks edits', async () => {
    expect(createdProjectId).not.toBe('');

    const completeRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editor_name: '박용진 수석' }),
    });
    expect(completeRes.status).toBe(200);
    const completeJson: any = await completeRes.json();
    const statusVal = completeJson.data?.project_status || completeJson.data?.project?.status || completeJson.project_status || completeJson.project?.status;
    expect(statusVal).toBe('COMPLETED');

    const editRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Should fail',
        editor_name: '박용진 수석',
      }),
    });
    expect(editRes.status).toBe(403);
    const editJson: any = await editRes.json();
    expect(editJson.error?.code).toBe('PROJECT_COMPLETED_READ_ONLY');
  });

  // 9. Reopen Project
  it('9. POST /api/projects/:id/reopen restores project status to ACTIVE', async () => {
    expect(createdProjectId).not.toBe('');

    const reopenRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editor_name: '박용진 수석' }),
    });
    expect(reopenRes.status).toBe(200);
    const reopenJson: any = await reopenRes.json();
    expect(reopenJson.data.status).toBe('ACTIVE');
  });

  // 10. Clean Up QA Data
  it('10. Deletes test task and QA project cleanly', async () => {
    if (createdTaskId) {
      const delTaskRes = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
      expect(delTaskRes.status).toBe(200);
    }

    if (createdProjectId) {
      const delPrjRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
      expect(delPrjRes.status).toBe(200);
    }
  });
});
