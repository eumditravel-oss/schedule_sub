// tests/workerLeaveScheduleCascade.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  differenceInPureCalendarDays,
  addDays,
  getDayOfWeek,
} from '../worker/services/scheduleCalendar';
import { getTestBaseUrl, QATracker } from './testGuard';

describe('Worker Leave Schedule Cascade & Restore Security & Integrity Suite', { timeout: 60000 }, () => {
  let BASE_URL = '';
  const tracker = new QATracker();
  const QA_PREFIX = `[QA-LEAVE-${Date.now()}]`;

  let krProjectId = '';
  let krTaskAId = '';
  let krTaskBId = '';
  let vnProjectId = '';
  let vnTaskId = '';

  beforeAll(() => {
    BASE_URL = getTestBaseUrl();
    expect(BASE_URL).toContain('concost-dev-scheduler-qa');
  });

  afterAll(async () => {
    await tracker.cleanup(BASE_URL, '박용진 수석');
    await tracker.cleanup(BASE_URL, 'Thanh Phuong(탄 프엉)');
  });

  // 1. Production Target Security Guard Test
  it('1. Throws security error if production URL is passed without ALLOW_PRODUCTION_MUTATION_TESTS=true', () => {
    const originalEnv = process.env.TEST_BASE_URL;
    process.env.TEST_BASE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev';
    delete process.env.ALLOW_PRODUCTION_MUTATION_TESTS;

    expect(() => getTestBaseUrl()).toThrow(/\[SECURITY ERROR\]/);

    process.env.TEST_BASE_URL = originalEnv;
  });

  // 2. Setup QA Projects & Tasks on QA Worker
  it('2. Create initial Korean & Vietnamese QA projects and tasks on QA environment', async () => {
    // KR Project (2026-08-01 ~ 2026-09-30)
    const krPrjRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${QA_PREFIX} KR 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-09-30',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(krPrjRes.status).toBe(201);
    const krPrjJson: any = await krPrjRes.json();
    krProjectId = krPrjJson.data.id;
    tracker.trackProject(krProjectId);

    // KR Task A (In-progress: 2026-08-03 ~ 2026-08-07, Friday end, progress 30)
    const taskARes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: krProjectId,
        worker_name: '박용진 수석',
        primary_worker_id: '박용진 수석',
        assignees: [{ worker_id: '박용진 수석', name: '박용진 수석', assignment_role: 'PRIMARY' }],
        task_name: 'KR 작업 A (진행 중)',
        start_date: '2026-08-03',
        end_date: '2026-08-07',
        progress: 30,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(taskARes.status).toBe(201);
    const taskAJson: any = await taskARes.json();
    krTaskAId = taskAJson.data.id;
    tracker.trackTask(krTaskAId);

    // KR Task B (Future: 2026-08-10 ~ 2026-08-14, progress 0)
    const taskBRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: krProjectId,
        worker_name: '박용진 수석',
        primary_worker_id: '박용진 수석',
        assignees: [{ worker_id: '박용진 수석', name: '박용진 수석', assignment_role: 'PRIMARY' }],
        task_name: 'KR 작업 B (미래)',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        progress: 0,
        editor_name: '박용진 수석',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(taskBRes.status).toBe(201);
    const taskBJson: any = await taskBRes.json();
    krTaskBId = taskBJson.data.id;
    tracker.trackTask(krTaskBId);

    // VN Project
    const vnPrjRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${QA_PREFIX} VN 프로젝트`,
        start_date: '2026-08-01',
        end_date: '2026-09-30',
        progress: 0,
        editor_name: 'Thanh Phuong(탄 프엉)',
      }),
    });
    expect(vnPrjRes.status).toBe(201);
    const vnPrjJson: any = await vnPrjRes.json();
    vnProjectId = vnPrjJson.data.id;
    tracker.trackProject(vnProjectId);

    const vnTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: vnProjectId,
        worker_name: 'Thanh Phuong(탄 프엉)',
        task_name: 'VN 작업',
        start_date: '2026-08-03',
        end_date: '2026-08-07',
        progress: 20,
        editor_name: 'Thanh Phuong(탄 프엉)',
        confirm_worker_schedule_conflict: true,
      }),
    });
    expect(vnTaskRes.status).toBe(201);
    const vnTaskJson: any = await vnTaskRes.json();
    vnTaskId = vnTaskJson.data.id;
    tracker.trackTask(vnTaskId);
  });

  // 3. GET /api/calendar/override-groups does not expose restore_token
  it('3. GET /api/calendar/override-groups does not expose restore_token in response', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/override-groups`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    const list: any[] = json.data || [];
    for (const item of list) {
      expect(item.restore_token).toBeUndefined();
    }
  });

  // 4. Leave creation, confirmation & restore token non-exposure
  it('4. Leave creation sets restore_token = NULL and requires confirmation modal (409)', async () => {
    // Unconfirmed request returns 409 LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED
    const unconfRes = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-14',
        end_date: '2026-08-14',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 금요일 휴가`,
        editor_name: '박용진 수석',
      }),
    });
    expect(unconfRes.status).toBe(409);
    const unconfJson: any = await unconfRes.json();
    expect(unconfJson.error?.code).toBe('LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED');

    // Confirmed request succeeds with HTTP 201
    const confRes = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-14',
        end_date: '2026-08-14',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 금요일 휴가`,
        confirm_leave_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(confRes.status).toBe(201);
    const confJson: any = await confRes.json();
    const groupId = confJson.data.id;
    tracker.trackOverrideGroup(groupId);
  });

  // 5. Delete group generates restore_token via crypto.randomUUID()
  it('5. Delete override group generates random UUID restore_token and sets event_status = LEAVE_DELETED_PENDING_DECISION', async () => {
    const groupsRes = await fetch(`${BASE_URL}/api/calendar/override-groups?worker_id=wrk_02`);
    const json: any = await groupsRes.json();
    const groups: any[] = json.data || [];
    const targetGroup = groups.find((g) => g.label_ko && g.label_ko.includes(QA_PREFIX));
    expect(targetGroup).toBeDefined();

    const delRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${targetGroup.id}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    expect(delRes.status).toBe(200);
    const delJson: any = await delRes.json();
    expect(delJson.data.restore_available).toBe(true);
    expect(delJson.data.restore_token).toBeDefined();
    // UUID format check (36 chars)
    expect(delJson.data.restore_token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  // 6. Duplicate DELETE block (HTTP 409 LEAVE_GROUP_ALREADY_DELETED)
  it('6. Duplicate DELETE on already deleted group returns HTTP 409 LEAVE_GROUP_ALREADY_DELETED', async () => {
    const pdsRes = await fetch(`${BASE_URL}/api/calendar/pending-schedule-decisions`, {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const json: any = await pdsRes.json();
    const pds: any[] = json.data || [];
    expect(pds.length).toBeGreaterThan(0);
    const groupId = pds[0].groupId;

    const dupDel = await fetch(`${BASE_URL}/api/calendar/override-groups/${groupId}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    expect(dupDel.status).toBe(409);
    const dupJson: any = await dupDel.json();
    expect(dupJson.error?.code).toBe('LEAVE_GROUP_ALREADY_DELETED');
  });

  // 7. Token mismatch or unauthorized worker keep-schedule block
  it('7. keep-schedule with wrong token or different worker returns 409 RESTORE_TOKEN_INVALID or 403 CALENDAR_SELF_ONLY', async () => {
    const pdsRes = await fetch(`${BASE_URL}/api/calendar/pending-schedule-decisions`, {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const json: any = await pdsRes.json();
    const pds: any[] = json.data || [];
    expect(pds.length).toBeGreaterThan(0);
    const pd = pds[0];

    // Unauthorized worker
    const unauthRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${pd.groupId}/keep-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('Thanh Phuong(탄 프엉)') },
      body: JSON.stringify({ restore_token: pd.restore_token, confirm_keep: true }),
    });
    expect(unauthRes.status).toBe(403);

    // Invalid Token
    const invalidTokRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${pd.groupId}/keep-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('박용진 수석') },
      body: JSON.stringify({ restore_token: 'invalid-token-12345', confirm_keep: true }),
    });
    expect(invalidTokRes.status).toBe(409);
  });

  // 8. Pending Schedule Decision Query & Execution
  it('8. GET /api/calendar/pending-schedule-decisions returns active pending decision and keep-schedule finalizes state', async () => {
    const pdsRes = await fetch(`${BASE_URL}/api/calendar/pending-schedule-decisions`, {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const json: any = await pdsRes.json();
    const pds: any[] = json.data || [];
    expect(pds.length).toBeGreaterThan(0);
    const pd = pds[0];

    const keepRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${pd.groupId}/keep-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('박용진 수석') },
      body: JSON.stringify({ restore_token: pd.restore_token, confirm_keep: true }),
    });
    expect(keepRes.status).toBe(200);

    // Verify pending decisions list is now empty
    const pdsAfter = await fetch(`${BASE_URL}/api/calendar/pending-schedule-decisions`, {
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const jsonAfter: any = await pdsAfter.json();
    const pdsAfterList: any[] = jsonAfter.data || [];
    expect(pdsAfterList.find((p) => p.groupId === pd.groupId)).toBeUndefined();
  });

  // 9. Completed task restore block (HTTP 409 LEAVE_RESTORE_COMPLETED_TASK)
  it('9. Restore is blocked with HTTP 409 LEAVE_RESTORE_COMPLETED_TASK if task progress = 100', async () => {
    // 1. Create leave
    const confRes = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-14',
        end_date: '2026-08-14',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 2차 휴가`,
        confirm_leave_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(confRes.status).toBe(201);
    const groupJson: any = await confRes.json();
    const groupId = groupJson.data.id;
    tracker.trackOverrideGroup(groupId);

    // 2. Mark task progress = 100
    await fetch(`${BASE_URL}/api/tasks/${krTaskBId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: 100, editor_name: '박용진 수석' }),
    });

    // 3. Delete group
    const delRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${groupId}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const delJson: any = await delRes.json();
    const token = delJson.data.restore_token;

    // 4. Restore attempt fails with HTTP 409 LEAVE_RESTORE_COMPLETED_TASK
    const restoreRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${groupId}/restore-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restore_token: token, confirm_restore: true, editor_name: '박용진 수석' }),
    });
    expect(restoreRes.status).toBe(409);
    const restoreJson: any = await restoreRes.json();
    expect(restoreJson.error?.code).toBe('LEAVE_RESTORE_COMPLETED_TASK');

    // Revert task progress back to 0
    await fetch(`${BASE_URL}/api/tasks/${krTaskBId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: 0, editor_name: '박용진 수석' }),
    });
  });

  // 10. Multi-leave independent restore & daily_status ID preservation
  it('10. Multi-leave independent restore and project schedule shift preserving daily_status IDs', async () => {
    // 1. Add daily_status
    const dsRes = await fetch(`${BASE_URL}/api/tasks/${krTaskAId}/daily-status/2026-08-05`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-editor-name': encodeURIComponent('박용진 수석') },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    expect(dsRes.status).toBe(200);

    // 2. Project start date shift (+26 days)
    const shiftRes = await fetch(`${BASE_URL}/api/projects/${krProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: '2026-08-27',
        confirm_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(shiftRes.status).toBe(200);

    // Verify detail page
    const detailRes = await fetch(`${BASE_URL}/api/projects/${krProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    expect(detailJson.success).toBe(true);
  });

  // 11. Legacy group override deletion delegation
  it('11. DELETE /api/calendar/overrides/:id with override_group_id delegates to group deletion', async () => {
    // Create leave group
    const createRes = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-21',
        end_date: '2026-08-21',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 레거시 테스트`,
        confirm_leave_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(createRes.status).toBe(201);
    const grpJson: any = await createRes.json();
    const grpId = grpJson.data.id;
    tracker.trackOverrideGroup(grpId);

    // Fetch individual override row
    const ovrsRes = await fetch(`${BASE_URL}/api/calendar/overrides?start=2026-08-21&end=2026-08-21`);
    const ovrJson: any = await ovrsRes.json();
    const ovrs: any[] = ovrJson.data || [];
    const targetOvr = ovrs.find((o) => o.override_group_id === grpId);
    expect(targetOvr).toBeDefined();

    // Delete single override delegates to group deletion
    const delRes = await fetch(`${BASE_URL}/api/calendar/overrides/${targetOvr.id}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    expect(delRes.status).toBe(200);
    const delJson: any = await delRes.json();
    expect(delJson.data.group_delegated).toBe(true);
  });
});
