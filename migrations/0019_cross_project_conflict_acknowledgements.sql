-- migrations/0019_cross_project_conflict_acknowledgements.sql
CREATE TABLE IF NOT EXISTS conflict_acknowledgements (
  id TEXT PRIMARY KEY,
  conflict_fingerprint TEXT UNIQUE NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'cross_project_v1',
  worker_id TEXT NOT NULL,
  project_ids_json TEXT NOT NULL,
  overlap_start_date DATE NOT NULL,
  overlap_end_date DATE NOT NULL,
  acknowledged_by_id TEXT NOT NULL,
  acknowledged_by_name TEXT NOT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conflict_ack_fingerprint ON conflict_acknowledgements(conflict_fingerprint);
CREATE INDEX IF NOT EXISTS idx_conflict_ack_worker ON conflict_acknowledgements(worker_id);
