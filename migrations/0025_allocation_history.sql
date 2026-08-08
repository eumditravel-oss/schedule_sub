-- migrations/0025_allocation_history.sql
CREATE TABLE IF NOT EXISTS project_worker_allocation_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  old_allocation_percent REAL,
  new_allocation_percent REAL,
  old_note TEXT,
  new_note TEXT,
  change_type TEXT NOT NULL, -- 'INITIAL_SNAPSHOT' | 'CREATE' | 'UPDATE' | 'DELETE'
  changed_by_id TEXT,
  changed_by_name TEXT,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'MANUAL', -- 'MANUAL' | 'INTEGRATION'
  request_id TEXT
);

-- Backfill initial snapshot of existing allocations
INSERT INTO project_worker_allocation_history (
  id,
  project_id,
  worker_id,
  old_allocation_percent,
  new_allocation_percent,
  old_note,
  new_note,
  change_type,
  changed_by_id,
  changed_by_name,
  changed_at,
  source,
  request_id
)
SELECT
  'hist_init_' || id,
  project_id,
  worker_id,
  NULL,
  allocation_percent,
  NULL,
  note,
  'INITIAL_SNAPSHOT',
  'system',
  'System Migration',
  '2026-08-08 00:00:00',
  'SYSTEM',
  'init_snapshot_20260808'
FROM project_worker_allocations;
