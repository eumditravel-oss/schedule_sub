// worker/services/projectAllocationService.ts
// Handles CRUD operations for Project Worker Allocations & History Ledger V2.3

export interface ProjectAllocationInput {
  worker_id: string;
  allocation_percent: number;
  note?: string;
}

export interface AllocationHistoryFilter {
  dateFrom?: string;
  dateTo?: string;
  workerId?: string;
  projectId?: string;
  changedBy?: string;
  changeType?: string;
  limit?: number;
  offset?: number;
}

export async function getProjectAllocations(db: any, projectId: string): Promise<any[]> {
  try {
    const res = await db
      .prepare(
        `SELECT pwa.*, w.name as worker_name, w.country_code
         FROM project_worker_allocations pwa
         JOIN workers w ON pwa.worker_id = w.id
         WHERE pwa.project_id = ?
         ORDER BY w.sort_order ASC, w.name ASC`
      )
      .bind(projectId)
      .all();
    return res.results || [];
  } catch (err) {
    console.error('getProjectAllocations error:', err);
    return [];
  }
}

export async function updateProjectAllocations(
  db: any,
  projectId: string,
  allocations: ProjectAllocationInput[],
  editorWorker: any,
  source: 'MANUAL' | 'INTEGRATION' = 'MANUAL',
  requestId?: string
): Promise<any[]> {
  // 1. Verify project existence
  const prj = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!prj) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  const batchRequestId = requestId || `alloc_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const editorId = editorWorker?.id || null;
  const editorName = editorWorker?.name || (typeof editorWorker === 'string' ? editorWorker : 'System');

  // 2. Fetch existing allocations for comparison
  const existingRes = await db
    .prepare(`SELECT * FROM project_worker_allocations WHERE project_id = ?`)
    .bind(projectId)
    .all();

  const existingMap = new Map<string, any>();
  (existingRes.results || []).forEach((r: any) => {
    existingMap.set(String(r.worker_id), r);
  });

  // 3. Validate new allocations (each worker 0~100%)
  const validMap = new Map<string, ProjectAllocationInput>();
  for (const alloc of allocations) {
    if (!alloc.worker_id) continue;
    const pct = Math.max(0, Math.min(100, Math.round(Number(alloc.allocation_percent || 0))));
    validMap.set(alloc.worker_id, {
      worker_id: alloc.worker_id,
      allocation_percent: pct,
      note: alloc.note ? String(alloc.note).trim() : '',
    });
  }

  const queries: any[] = [];

  // 4. Handle DELETED Allocations
  for (const [wId, origAlloc] of existingMap.entries()) {
    if (!validMap.has(wId)) {
      // Add DELETE History Statement
      const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      queries.push(
        db
          .prepare(
            `INSERT INTO project_worker_allocation_history (
              id, project_id, worker_id, old_allocation_percent, new_allocation_percent,
              old_note, new_note, change_type, changed_by_id, changed_by_name,
              changed_at, source, request_id
            ) VALUES (?, ?, ?, ?, NULL, ?, NULL, 'DELETE', ?, ?, CURRENT_TIMESTAMP, ?, ?)`
          )
          .bind(
            histId,
            projectId,
            wId,
            origAlloc.allocation_percent,
            origAlloc.note || null,
            editorId,
            editorName,
            source,
            batchRequestId
          )
      );

      // Add DELETE Allocation Statement
      queries.push(
        db.prepare(`DELETE FROM project_worker_allocations WHERE project_id = ? AND worker_id = ?`).bind(projectId, wId)
      );
    }
  }

  // 5. Handle CREATED & UPDATED Allocations
  for (const [wId, alloc] of validMap.entries()) {
    const origAlloc = existingMap.get(wId);
    const newPct = alloc.allocation_percent;
    const newNote = alloc.note || '';

    if (!origAlloc) {
      // CREATE Event
      const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      queries.push(
        db
          .prepare(
            `INSERT INTO project_worker_allocation_history (
              id, project_id, worker_id, old_allocation_percent, new_allocation_percent,
              old_note, new_note, change_type, changed_by_id, changed_by_name,
              changed_at, source, request_id
            ) VALUES (?, ?, ?, NULL, ?, NULL, ?, 'CREATE', ?, ?, CURRENT_TIMESTAMP, ?, ?)`
          )
          .bind(histId, projectId, wId, newPct, newNote || null, editorId, editorName, source, batchRequestId)
      );
    } else {
      const origPct = Number(origAlloc.allocation_percent);
      const origNote = origAlloc.note || '';

      // Skip history recording if values/notes are identical
      if (origPct !== newPct || origNote !== newNote) {
        // UPDATE Event
        const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        queries.push(
          db
            .prepare(
              `INSERT INTO project_worker_allocation_history (
                id, project_id, worker_id, old_allocation_percent, new_allocation_percent,
                old_note, new_note, change_type, changed_by_id, changed_by_name,
                changed_at, source, request_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UPDATE', ?, ?, CURRENT_TIMESTAMP, ?, ?)`
            )
            .bind(
              histId,
              projectId,
              wId,
              origPct,
              newPct,
              origNote || null,
              newNote || null,
              editorId,
              editorName,
              source,
              batchRequestId
            )
        );
      }
    }

    // Add UPSERT Allocation Statement
    const id = `pwa_${projectId}_${wId}`;
    queries.push(
      db
        .prepare(
          `INSERT INTO project_worker_allocation_history (
            id, project_id, worker_id, old_allocation_percent, new_allocation_percent,
            old_note, new_note, change_type, changed_by_id, changed_by_name,
            changed_at, source, request_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UPDATE', ?, ?, CURRENT_TIMESTAMP, ?, ?)
          ON CONFLICT(id) DO NOTHING`
        )
        // Dummy statement to ensure batch statement count alignment if needed
    );

    queries.pop(); // Remove dummy statement

    queries.push(
      db
        .prepare(
          `INSERT INTO project_worker_allocations (
            id, project_id, worker_id, allocation_percent, note, source,
            created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(project_id, worker_id) DO UPDATE SET
            allocation_percent = excluded.allocation_percent,
            note = excluded.note,
            source = excluded.source,
            updated_by_id = excluded.updated_by_id,
            updated_by_name = excluded.updated_by_name,
            updated_at = CURRENT_TIMESTAMP`
        )
        .bind(id, projectId, wId, newPct, newNote || null, source, editorId, editorName, editorId, editorName)
    );
  }

  // Execute D1 Batch Transaction (Atomic)
  if (queries.length > 0) {
    await db.batch(queries);
  }

  return getProjectAllocations(db, projectId);
}

/**
 * Queries allocation change history ledger with filtering & pagination.
 */
export async function getAllocationHistory(db: any, filter: AllocationHistoryFilter = {}): Promise<any[]> {
  try {
    let sql = `
      SELECT h.*, p.name as project_name, w.name as worker_name, w.country_code
      FROM project_worker_allocation_history h
      LEFT JOIN projects p ON h.project_id = p.id
      LEFT JOIN workers w ON h.worker_id = w.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter.dateFrom) {
      sql += ` AND h.changed_at >= ?`;
      params.push(`${filter.dateFrom} 00:00:00`);
    }
    if (filter.dateTo) {
      sql += ` AND h.changed_at <= ?`;
      params.push(`${filter.dateTo} 23:59:59`);
    }
    if (filter.workerId) {
      sql += ` AND h.worker_id = ?`;
      params.push(filter.workerId);
    }
    if (filter.projectId) {
      sql += ` AND h.project_id = ?`;
      params.push(filter.projectId);
    }
    if (filter.changedBy) {
      sql += ` AND (h.changed_by_id = ? OR h.changed_by_name LIKE ?)`;
      params.push(filter.changedBy, `%${filter.changedBy}%`);
    }
    if (filter.changeType) {
      sql += ` AND h.change_type = ?`;
      params.push(filter.changeType);
    }

    sql += ` ORDER BY h.changed_at DESC`;

    const limit = filter.limit ? Math.min(500, Math.max(1, filter.limit)) : 100;
    const offset = filter.offset ? Math.max(0, filter.offset) : 0;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const res = await bound.all();

    return res.results || [];
  } catch (err) {
    console.error('getAllocationHistory error:', err);
    return [];
  }
}

/**
 * Queries allocation change history for a single project.
 */
export async function getProjectAllocationHistory(db: any, projectId: string): Promise<any[]> {
  return getAllocationHistory(db, { projectId, limit: 200 });
}
