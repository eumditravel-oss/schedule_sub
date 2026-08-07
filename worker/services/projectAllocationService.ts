// worker/services/projectAllocationService.ts
// Handles CRUD operations for Project Worker Allocations & Capacity Engine V2

export interface ProjectAllocationInput {
  worker_id: string;
  allocation_percent: number;
  note?: string;
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
  source: 'MANUAL' | 'INTEGRATION' = 'MANUAL'
): Promise<any[]> {
  // 1. Verify project existence
  const prj = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!prj) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  // 2. Validate allocations (each worker 0~100%)
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

  // 3. Upsert allocations inside transaction
  const existingRes = await db
    .prepare(`SELECT worker_id FROM project_worker_allocations WHERE project_id = ?`)
    .bind(projectId)
    .all();
  const existingWorkerIds = new Set<string>((existingRes.results || []).map((r: any) => String(r.worker_id)));

  const editorId = editorWorker?.id || null;
  const editorName = editorWorker?.name || 'System';

  const queries: any[] = [];

  // Delete removed allocations
  for (const wId of existingWorkerIds) {
    if (!validMap.has(wId)) {
      queries.push(
        db.prepare(`DELETE FROM project_worker_allocations WHERE project_id = ? AND worker_id = ?`).bind(projectId, wId)
      );
    }
  }

  // Upsert current allocations
  for (const [wId, alloc] of validMap.entries()) {
    const id = `pwa_${projectId}_${wId}`;
    queries.push(
      db.prepare(
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
      ).bind(id, projectId, wId, alloc.allocation_percent, alloc.note || null, source, editorId, editorName, editorId, editorName)
    );
  }

  if (queries.length > 0) {
    await db.batch(queries);
  }

  return getProjectAllocations(db, projectId);
}
