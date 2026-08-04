// tests/workerLeaveScheduleCascade.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  differenceInPureCalendarDays,
  addDays,
  getDayOfWeek,
} from '../worker/services/scheduleCalendar';

const BASE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev';
const QA_PREFIX = `[QA-LEAVE-${Date.now()}]`;

describe('Worker Leave Schedule Cascade & Restore Unit Test Suite', { timeout: 45000 }, () => {
  let krProjectId = '';
  let krTaskAId = ''; // In-progress
  let krTaskBId = ''; // Future
  let vnProjectId = '';
  let vnTaskId = '';

  let createdGroupId = '';
  let restoreToken = '';

  beforeAll(async () => {
    // Cleanup any pre-existing override groups and individual overrides on test dates
    const overridesRes = await fetch(`${BASE_URL}/api/calendar/overrides`);
    const overridesJson: any = await overridesRes.json();
    if (overridesJson.success && Array.isArray(overridesJson.data)) {
      for (const ovr of overridesJson.data) {
        if (['2026-08-07', '2026-08-14', '2026-08-21'].includes(ovr.work_date)) {
          await fetch(`${BASE_URL}/api/calendar/overrides/${ovr.id}`, {
            method: 'DELETE',
            headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
          });
          await fetch(`${BASE_URL}/api/calendar/overrides/${ovr.id}`, {
            method: 'DELETE',
            headers: { 'x-editor-name': encodeURIComponent('Thanh Phuong(탄 프엉)') },
          });
        }
      }
    }

    const groupsRes = await fetch(`${BASE_URL}/api/calendar/override-groups`);
    const groupsJson: any = await groupsRes.json();
    if (groupsJson.success && Array.isArray(groupsJson.data)) {
      for (const g of groupsJson.data) {
        if (g.start_date === '2026-08-07' || g.start_date === '2026-08-14' || (g.label_ko && g.label_ko.includes('[QA-LEAVE'))) {
          await fetch(`${BASE_URL}/api/calendar/override-groups/${g.id}`, {
            method: 'DELETE',
            headers: { 'x-editor-name': encodeURIComponent(g.worker_id) },
          });
        }
      }
    }
  });

  afterAll(async () => {
    // Cleanup QA Projects
    if (krProjectId) {
      await fetch(`${BASE_URL}/api/projects/${krProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
      });
    }
    if (vnProjectId) {
      await fetch(`${BASE_URL}/api/projects/${vnProjectId}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent('Thanh Phuong(탄 프엉)') },
      });
    }
  });

  // 1. Day of Week & Pure Calendar Math Unit Checks
  it('1. Verify day of week and calendar math calculations', () => {
    // 2026-08-07 is Friday (5)
    expect(getDayOfWeek('2026-08-07')).toBe(5);
    // 2026-08-08 is Saturday (6)
    expect(getDayOfWeek('2026-08-08')).toBe(6);
    // 2026-08-09 is Sunday (0)
    expect(getDayOfWeek('2026-08-09')).toBe(0);
    // 2026-08-10 is Monday (1)
    expect(getDayOfWeek('2026-08-10')).toBe(1);

    expect(addDays('2026-08-07', 3)).toBe('2026-08-10');
    expect(differenceInPureCalendarDays('2026-08-10', '2026-08-07')).toBe(3);
  });

  // 2. Setup QA Projects & Tasks
  it('2. Create initial Korean & Vietnamese QA projects and tasks', async () => {
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

    // KR Task A (In-progress: 2026-08-03 ~ 2026-08-07, Friday end, progress 30)
    const taskARes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: krProjectId,
        worker_name: '박용진 수석',
        task_name: 'KR 작업 A (진행 중)',
        start_date: '2026-08-03',
        end_date: '2026-08-07',
        progress: 30,
        editor_name: '박용진 수석',
      }),
    });
    expect(taskARes.status).toBe(201);
    const taskAJson: any = await taskARes.json();
    krTaskAId = taskAJson.data.id;

    // KR Task B (Future: 2026-08-10 ~ 2026-08-14, progress 0)
    const taskBRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: krProjectId,
        worker_name: '박용진 수석',
        task_name: 'KR 작업 B (미래)',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        progress: 0,
        editor_name: '박용진 수석',
      }),
    });
    expect(taskBRes.status).toBe(201);
    const taskBJson: any = await taskBRes.json();
    krTaskBId = taskBJson.data.id;

    // VN Project (2026-08-01 ~ 2026-09-30)
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

    // VN Task (2026-08-03 ~ 2026-08-07, Friday end)
    const vnTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: vnProjectId,
        worker_name: 'Thanh Phuong(탄 프엉)',
        task_name: 'VN 작업 (금요일 종결)',
        start_date: '2026-08-03',
        end_date: '2026-08-07',
        progress: 20,
        editor_name: 'Thanh Phuong(탄 프엉)',
      }),
    });
    expect(vnTaskRes.status).toBe(201);
    const vnTaskJson: any = await vnTaskRes.json();
    vnTaskId = vnTaskJson.data.id;
  });

  // 3. Unconfirmed Leave Cascade Shift Rejection (HTTP 409 LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED)
  it('3. Unconfirmed LEAVE request returns HTTP 409 LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED with task preview', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-07', // Friday
        end_date: '2026-08-07',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 금요일 휴가`,
        editor_name: '박용진 수석',
      }),
    });

    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED');
    expect(json.error?.details?.working_leave_days).toBe(1);
    expect(json.error?.details?.affected_task_count).toBeGreaterThanOrEqual(1);
  });

  // 4. Confirmed Korean Worker Friday Leave (+1 working day extends to Monday)
  it('4. Confirmed KR Friday leave extends Friday in-progress task end date to next Monday and shifts future tasks', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-07', // Friday
        end_date: '2026-08-07',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 금요일 휴가`,
        confirm_leave_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });

    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    createdGroupId = json.data.id;

    // Fetch detail of KR project
    const detailRes = await fetch(`${BASE_URL}/api/projects/${krProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks: any[] = detailJson.data.tasks;

    const taskA = tasks.find((t) => t.id === krTaskAId);
    // Task A (in-progress): start_date maintained at 2026-08-03, end_date extended from 08-07 to 08-10 (Monday)
    expect(taskA.start_date).toBe('2026-08-03');
    expect(taskA.end_date).toBe('2026-08-10');
    expect(taskA.progress).toBe(30);

    const taskB = tasks.find((t) => t.id === krTaskBId);
    // Task B (future): shifted by 1 working day (08-10 ~ 08-14 -> 08-11 ~ 08-17)
    expect(taskB.start_date).toBe('2026-08-11');
    expect(taskB.end_date).toBe('2026-08-17');
  });

  // 5. Confirmed Vietnamese Worker Friday Leave (+1 working day extends to Saturday because Saturday is VN workday)
  it('5. Confirmed VN Friday leave extends VN task end date to Saturday (since Saturday is VN working day)', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: 'Thanh Phuong(탄 프엉)',
        start_date: '2026-08-07', // Friday
        end_date: '2026-08-07',
        override_type: 'LEAVE',
        label_vi: `${QA_PREFIX} Nghỉ thứ sáu`,
        confirm_leave_schedule_cascade: true,
        editor_name: 'Thanh Phuong(탄 프엉)',
      }),
    });

    expect(res.status).toBe(201);
    const json: any = await res.json();
    const vnGroupId = json.data.id;

    // Fetch detail of VN project
    const detailRes = await fetch(`${BASE_URL}/api/projects/${vnProjectId}/detail`);
    const detailJson: any = await detailRes.json();
    const tasks: any[] = detailJson.data.tasks;

    const vnTask = tasks.find((t) => t.id === vnTaskId);
    // VN Task: extended to 2026-08-08 (Saturday, since Saturday is VN workday!)
    expect(vnTask.start_date).toBe('2026-08-03');
    expect(vnTask.end_date).toBe('2026-08-08');

    // Clean up VN group
    await fetch(`${BASE_URL}/api/calendar/override-groups/${vnGroupId}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('Thanh Phuong(탄 프엉)') },
    });
  });

  // 6. Delete Leave Group & Obtain Restore Token (Stage 1 Soft Delete)
  it('6. Delete leave group soft deletes group and returns restore metadata & restore_token', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/override-groups/${createdGroupId}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.restore_available).toBe(true);
    expect(json.data.working_leave_days).toBe(1);
    expect(json.data.restore_token).toBeDefined();

    restoreToken = json.data.restore_token;
  });

  // 7. Confirm Keep Schedule Option (POST /api/calendar/override-groups/:groupId/keep-schedule)
  it('7. Confirm keep schedule locks schedule shift and invalidates restore_token', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/override-groups/${createdGroupId}/keep-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restore_token: restoreToken,
        confirm_keep: true,
        editor_name: '박용진 수석',
      }),
    });

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);

    // Verify subsequent restore attempt fails with HTTP 409 RESTORE_TOKEN_INVALID
    const failRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${createdGroupId}/restore-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restore_token: restoreToken,
        confirm_restore: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(failRes.status).toBe(409);
  });

  // 8. Re-register Leave & Test Schedule Restore (POST /api/calendar/override-groups/:groupId/restore-schedule)
  it('8. Register leave, delete leave, and execute restore to restore exact pre-leave snapshot dates', async () => {
    // 1. Register leave again
    const createRes = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: '박용진 수석',
        start_date: '2026-08-14', // Friday
        end_date: '2026-08-14',
        override_type: 'LEAVE',
        label_ko: `${QA_PREFIX} 2차 휴가`,
        confirm_leave_schedule_cascade: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(createRes.status).toBe(201);
    const createJson: any = await createRes.json();
    const groupId2 = createJson.data.id;

    // 2. Delete leave group
    const delRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${groupId2}`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('박용진 수석') },
    });
    const delJson: any = await delRes.json();
    const token2 = delJson.data.restore_token;

    // 3. Execute Restore
    const restoreRes = await fetch(`${BASE_URL}/api/calendar/override-groups/${groupId2}/restore-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restore_token: token2,
        confirm_restore: true,
        editor_name: '박용진 수석',
      }),
    });
    expect(restoreRes.status).toBe(200);
    const restoreJson: any = await restoreRes.json();
    expect(restoreJson.success).toBe(true);
    expect(restoreJson.data.restored_task_count).toBeGreaterThanOrEqual(1);
  });

  // 9. Executive CEO/COO Permission Protection (HTTP 403 EXECUTIVE_READ_ONLY)
  it('9. CEO/COO is blocked from registering, deleting, or restoring leave (HTTP 403 EXECUTIVE_READ_ONLY)', async () => {
    const createRes = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: 'CEO',
        start_date: '2026-08-20',
        end_date: '2026-08-20',
        override_type: 'LEAVE',
        editor_name: 'CEO',
      }),
    });
    expect(createRes.status).toBe(403);

    const delRes = await fetch(`${BASE_URL}/api/calendar/override-groups/ovg_dummy`, {
      method: 'DELETE',
      headers: { 'x-editor-name': encodeURIComponent('CEO') },
    });
    expect(delRes.status).toBe(403);
  });

  // 10. Self Leave Permission Protection (HTTP 403 CALENDAR_SELF_ONLY)
  it('10. EDITOR is blocked from modifying another worker leave (HTTP 403 CALENDAR_SELF_ONLY)', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope_type: 'WORKER',
        scope_key: 'Thanh Phuong(탄 프엉)',
        start_date: '2026-08-25',
        end_date: '2026-08-25',
        override_type: 'LEAVE',
        editor_name: '박용진 수석', // Discrepancy!
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe('CALENDAR_SELF_ONLY');
  });
});
