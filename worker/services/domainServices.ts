// worker/services/domainServices.ts
import { detectCrossProjectWorkerConflictsServer } from './crossProjectConflictServer';
import { resolveWorkDayStatusServer } from './workCalendar';

export interface UpsertProjectPayload {
  source?: string;
  external_id?: string;
  internal_id?: string;
  name: string;
  name_ko?: string;
  name_vi?: string;
  start_date: string;
  end_date: string;
  status?: 'ACTIVE' | 'COMPLETED';
  external_updated_at?: string;
}

export interface UpsertTaskGroupPayload {
  source?: string;
  external_id?: string;
  internal_id?: string;
  project_id?: string;
  project_external_id?: string;
  group_name: string;
  group_name_ko?: string;
  group_name_vi?: string;
  group_sort_order?: number;
  external_updated_at?: string;
}

export interface UpsertTaskPayload {
  source?: string;
  external_id?: string;
  internal_id?: string;
  project_id?: string;
  project_external_id?: string;
  task_group_id?: string;
  task_group_external_id?: string;
  task_name: string;
  task_name_ko?: string;
  task_name_vi?: string;
  start_date?: string | null;
  end_date?: string | null;
  schedule_status?: 'SCHEDULED' | 'UNSCHEDULED';
  primary_worker_id?: string;
  worker_name?: string;
  assignees?: Array<{
    worker_id: string;
    name?: string;
    allocation_percent?: number;
  }>;
  availability_policy?: 'AUTO_SHIFTABLE' | 'FIXED_DATE';
  progress?: number;
  progress_mode?: 'AUTO' | 'MANUAL';
  task_sort_order?: number;
  confirm_cross_project_conflicts?: string[];
  external_updated_at?: string;
}

export async function resolveEntityLink(
  db: any,
  source: string,
  entityType: 'PROJECT' | 'TASK_GROUP' | 'TASK',
  externalId: string
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT internal_id FROM integration_entity_links WHERE source = ? AND entity_type = ? AND external_id = ?`
    )
    .bind(source, entityType, externalId)
    .first();
  return row ? row.internal_id : null;
}

export async function recordEntityLink(
  db: any,
  apiKeyId: string,
  source: string,
  entityType: 'PROJECT' | 'TASK_GROUP' | 'TASK',
  externalId: string,
  internalId: string,
  externalUpdatedAt?: string,
  payloadHash?: string
): Promise<void> {
  const id = `link_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await db
    .prepare(
      `INSERT INTO integration_entity_links (
        id, api_key_id, source, entity_type, external_id, internal_id, external_updated_at, last_payload_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source, entity_type, external_id) DO UPDATE SET
        api_key_id = excluded.api_key_id,
        internal_id = excluded.internal_id,
        external_updated_at = excluded.external_updated_at,
        last_payload_hash = excluded.last_payload_hash,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(id, apiKeyId, source, entityType, externalId, internalId, externalUpdatedAt || null, payloadHash || null)
    .run();
}

export async function upsertProjectService(
  db: any,
  env: any,
  apiKeyId: string,
  payload: UpsertProjectPayload,
  editorName: string
): Promise<{ project: any; created: boolean }> {
  const source = payload.source || 'api';
  let internalId = payload.internal_id;

  if (!internalId && payload.external_id) {
    internalId = (await resolveEntityLink(db, source, 'PROJECT', payload.external_id)) || undefined;
  }

  let existing: any = null;
  if (internalId) {
    existing = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(internalId).first();
  }

  const nameKo = payload.name_ko || payload.name;
  const nameVi = payload.name_vi || payload.name;
  const status = payload.status || (existing ? existing.status : 'ACTIVE');

  let created = false;
  if (!existing) {
    created = true;
    internalId = internalId || `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db
      .prepare(
        `INSERT INTO projects (
          id, name, name_ko, name_vi, start_date, end_date, status, created_by_name, updated_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        internalId,
        payload.name,
        nameKo,
        nameVi,
        payload.start_date,
        payload.end_date,
        status,
        editorName,
        editorName
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE projects SET
          name = ?, name_ko = ?, name_vi = ?, start_date = ?, end_date = ?, status = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
      )
      .bind(
        payload.name,
        nameKo,
        nameVi,
        payload.start_date,
        payload.end_date,
        status,
        editorName,
        internalId
      )
      .run();
  }

  if (payload.external_id) {
    await recordEntityLink(db, apiKeyId, source, 'PROJECT', payload.external_id, internalId!, payload.external_updated_at);
  }

  const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(internalId).first();
  return { project, created };
}

export async function upsertTaskGroupService(
  db: any,
  env: any,
  apiKeyId: string,
  payload: UpsertTaskGroupPayload,
  editorName: string
): Promise<{ group: any; created: boolean }> {
  const source = payload.source || 'api';
  let internalId = payload.internal_id;

  if (!internalId && payload.external_id) {
    internalId = (await resolveEntityLink(db, source, 'TASK_GROUP', payload.external_id)) || undefined;
  }

  let projectId = payload.project_id;
  if (!projectId && payload.project_external_id) {
    projectId = (await resolveEntityLink(db, source, 'PROJECT', payload.project_external_id)) || undefined;
  }

  if (!projectId) {
    throw new Error('PROJECT_NOT_FOUND: project_id or valid project_external_id is required.');
  }

  let existing: any = null;
  if (internalId) {
    existing = await db.prepare(`SELECT * FROM task_groups WHERE id = ?`).bind(internalId).first();
  }

  const groupNameKo = payload.group_name_ko || payload.group_name;
  const groupNameVi = payload.group_name_vi || payload.group_name;
  const sortOrder = payload.group_sort_order !== undefined ? payload.group_sort_order : (existing ? existing.group_sort_order : 0);

  let created = false;
  if (!existing) {
    created = true;
    internalId = internalId || `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db
      .prepare(
        `INSERT INTO task_groups (
          id, project_id, group_name, group_name_ko, group_name_vi, group_sort_order, created_by_name, updated_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        internalId,
        projectId,
        payload.group_name,
        groupNameKo,
        groupNameVi,
        sortOrder,
        editorName,
        editorName
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE task_groups SET
          project_id = ?, group_name = ?, group_name_ko = ?, group_name_vi = ?, group_sort_order = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
      )
      .bind(
        projectId,
        payload.group_name,
        groupNameKo,
        groupNameVi,
        sortOrder,
        editorName,
        internalId
      )
      .run();
  }

  if (payload.external_id) {
    await recordEntityLink(db, apiKeyId, source, 'TASK_GROUP', payload.external_id, internalId!, payload.external_updated_at);
  }

  const group = await db.prepare(`SELECT * FROM task_groups WHERE id = ?`).bind(internalId).first();
  return { group, created };
}

export async function upsertTaskService(
  db: any,
  env: any,
  apiKeyId: string,
  payload: UpsertTaskPayload,
  editorName: string
): Promise<{ task: any; created: boolean; conflict_warning?: any }> {
  const source = payload.source || 'api';
  let internalId = payload.internal_id;

  if (!internalId && payload.external_id) {
    internalId = (await resolveEntityLink(db, source, 'TASK', payload.external_id)) || undefined;
  }

  let projectId = payload.project_id;
  if (!projectId && payload.project_external_id) {
    projectId = (await resolveEntityLink(db, source, 'PROJECT', payload.project_external_id)) || undefined;
  }

  let taskGroupId = payload.task_group_id;
  if (!taskGroupId && payload.task_group_external_id) {
    taskGroupId = (await resolveEntityLink(db, source, 'TASK_GROUP', payload.task_group_external_id)) || undefined;
  }

  let existing: any = null;
  if (internalId) {
    existing = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(internalId).first();
  }

  if (!projectId && existing) {
    projectId = existing.project_id;
  }

  if (!projectId) {
    throw new Error('PROJECT_NOT_FOUND: Valid project_id or project_external_id is required.');
  }

  const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) {
    throw new Error('PROJECT_NOT_FOUND: Target project does not exist.');
  }

  // Handle UNSCHEDULED status or missing dates
  const isUnscheduled =
    payload.schedule_status === 'UNSCHEDULED' ||
    !payload.start_date ||
    !payload.end_date;

  const targetStatus = isUnscheduled ? 'UNSCHEDULED' : 'SCHEDULED';
  const finalStart = isUnscheduled ? null : payload.start_date!;
  const finalEnd = isUnscheduled ? null : payload.end_date!;

  // Worker & Assignees resolution
  const workersRes = await db.prepare(`SELECT * FROM workers`).all();
  const allWorkers: any[] = workersRes.results || [];

  let primaryWorkerId = payload.primary_worker_id;
  let workerName = payload.worker_name;

  if (!primaryWorkerId && payload.assignees && payload.assignees.length > 0) {
    primaryWorkerId = payload.assignees[0].worker_id;
    workerName = payload.assignees[0].name;
  }

  if (primaryWorkerId && !workerName) {
    const w = allWorkers.find((item) => item.id === primaryWorkerId || item.name === primaryWorkerId);
    if (w) {
      primaryWorkerId = w.id;
      workerName = w.name;
    }
  }

  if (!primaryWorkerId) {
    primaryWorkerId = allWorkers[0]?.id || 'wrk_03';
    workerName = allWorkers[0]?.name || 'Thanh Phuong';
  }

  const assigneesJson = JSON.stringify(
    (payload.assignees || [{ worker_id: primaryWorkerId, name: workerName, allocation_percent: 100 }]).map((a) => {
      const w = allWorkers.find((item) => item.id === a.worker_id || item.name === a.worker_id);
      return {
        worker_id: w ? w.id : a.worker_id,
        name: w ? w.name : (a.name || a.worker_id),
        allocation_percent: a.allocation_percent == null ? 100 : Number(a.allocation_percent),
      };
    })
  );

  const taskNameKo = payload.task_name_ko || payload.task_name;
  const taskNameVi = payload.task_name_vi || payload.task_name;
  const availabilityPolicy = payload.availability_policy || (existing ? existing.availability_policy : 'AUTO_SHIFTABLE');
  const progressMode = payload.progress_mode || (existing ? existing.progress_mode : 'AUTO');
  const sortOrder = payload.task_sort_order !== undefined ? payload.task_sort_order : (existing ? existing.task_sort_order : 0);

  // Cross-project conflict check
  let conflictWarning: any = undefined;
  if (!isUnscheduled && finalStart && finalEnd) {
    const prospectiveTask = {
      id: internalId || 'temp_upsert_id',
      project_id: projectId,
      task_name: payload.task_name,
      start_date: finalStart,
      end_date: finalEnd,
      schedule_status: 'SCHEDULED',
      primary_worker_id: primaryWorkerId,
      worker_name: workerName,
      assignees: JSON.parse(assigneesJson),
    };

    const [allActiveProjectsRes, allActiveTasksRes, holidaysRes, overridesRes, ackRes] = await Promise.all([
      db.prepare(`SELECT * FROM projects WHERE status = 'ACTIVE'`).all(),
      db.prepare(`SELECT * FROM tasks`).all(),
      db.prepare(`SELECT * FROM country_holidays`).all(),
      db.prepare(`SELECT * FROM calendar_overrides`).all(),
      db.prepare(`SELECT * FROM conflict_acknowledgements`).all().catch(() => ({ results: [] })),
    ]);

    const otherTasks = (allActiveTasksRes.results || []).filter((t: any) => t.id !== internalId);
    const prospectiveTasks = [...otherTasks, prospectiveTask];

    const conflictData = detectCrossProjectWorkerConflictsServer(
      allActiveProjectsRes.results || [],
      prospectiveTasks,
      allWorkers,
      holidaysRes.results || [],
      overridesRes.results || [],
      projectId,
      ackRes.results || []
    );

    const unackNewConflicts = conflictData.groups.filter((g) => !g.acknowledged);

    if (unackNewConflicts.length > 0) {
      conflictWarning = {
        code: 'CROSS_PROJECT_CONFLICT_CONFIRMATION_REQUIRED',
        message: '담당자의 업무 배정 비중이 100%를 초과합니다.',
        fingerprints: unackNewConflicts.map((g) => g.fingerprint),
        conflicts: unackNewConflicts,
      };

      if (Array.isArray(payload.confirm_cross_project_conflicts)) {
        for (const fp of payload.confirm_cross_project_conflicts) {
          const ackId = `ack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await db.prepare(`
            INSERT INTO conflict_acknowledgements (id, conflict_fingerprint, policy_version, worker_id, project_ids_json, overlap_start_date, overlap_end_date, acknowledged_by_id, acknowledged_by_name)
            VALUES (?, ?, 'cross_project_v1', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conflict_fingerprint) DO UPDATE SET
              acknowledged_by_id = excluded.acknowledged_by_id,
              acknowledged_by_name = excluded.acknowledged_by_name,
              acknowledged_at = CURRENT_TIMESTAMP
          `).bind(ackId, fp, primaryWorkerId, JSON.stringify([projectId]), '2000-01-01', '2099-12-31', 'api', editorName).run();
        }
      }
    }
  }

  // Revision calculation
  let created = false;
  let nextRevision = existing ? (existing.schedule_revision || 0) : 0;
  if (existing) {
    const isDateChanged = existing.start_date !== finalStart || existing.end_date !== finalEnd;
    const isStatusChanged = existing.schedule_status !== targetStatus;
    if (isDateChanged || isStatusChanged) {
      nextRevision += 1;
    }
  }

  if (!existing) {
    created = true;
    internalId = internalId || `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db
      .prepare(
        `INSERT INTO tasks (
          id, project_id, task_group_id, task_name, task_name_ko, task_name_vi, start_date, end_date, schedule_status, primary_worker_id, worker_name, assignees_json, availability_policy, progress, progress_mode, task_sort_order, schedule_revision, created_by_name, updated_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        internalId,
        projectId,
        taskGroupId || null,
        payload.task_name,
        taskNameKo,
        taskNameVi,
        finalStart,
        finalEnd,
        targetStatus,
        primaryWorkerId,
        workerName,
        assigneesJson,
        availabilityPolicy,
        payload.progress || 0,
        progressMode,
        sortOrder,
        nextRevision,
        editorName,
        editorName
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE tasks SET
          project_id = ?, task_group_id = ?, task_name = ?, task_name_ko = ?, task_name_vi = ?, start_date = ?, end_date = ?, schedule_status = ?, primary_worker_id = ?, worker_name = ?, assignees_json = ?, availability_policy = ?, progress = ?, progress_mode = ?, task_sort_order = ?, schedule_revision = ?, updated_by_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
      )
      .bind(
        projectId,
        taskGroupId || existing.task_group_id || null,
        payload.task_name,
        taskNameKo,
        taskNameVi,
        finalStart,
        finalEnd,
        targetStatus,
        primaryWorkerId,
        workerName,
        assigneesJson,
        availabilityPolicy,
        payload.progress !== undefined ? payload.progress : existing.progress,
        progressMode,
        sortOrder,
        nextRevision,
        editorName,
        internalId
      )
      .run();
  }

  if (payload.external_id) {
    await recordEntityLink(db, apiKeyId, source, 'TASK', payload.external_id, internalId!, payload.external_updated_at);
  }

  const task = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(internalId).first();
  return { task, created, conflict_warning: conflictWarning };
}
