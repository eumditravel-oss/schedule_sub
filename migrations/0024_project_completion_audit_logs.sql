-- migrations/0024_project_completion_audit_logs.sql
CREATE TABLE IF NOT EXISTS project_completion_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  completed_task_count INTEGER NOT NULL,
  total_task_count INTEGER NOT NULL,
  editor_id TEXT,
  editor_name TEXT,
  is_repair INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
