-- migrations/0023_integration_sync_runs.sql

CREATE TABLE IF NOT EXISTS integration_sync_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT DEFAULT 'CLI_INTEGRATION',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  dry_run INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  request_id TEXT,
  summary_json TEXT
);
