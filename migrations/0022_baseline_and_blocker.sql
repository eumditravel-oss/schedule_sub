-- migrations/0022_baseline_and_blocker.sql

-- Add Baseline columns to projects
ALTER TABLE projects ADD COLUMN baseline_start_date TEXT;
ALTER TABLE projects ADD COLUMN baseline_end_date TEXT;

-- Add Baseline & Blocker columns to tasks
ALTER TABLE tasks ADD COLUMN baseline_start_date TEXT;
ALTER TABLE tasks ADD COLUMN baseline_end_date TEXT;
ALTER TABLE tasks ADD COLUMN is_blocked INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN blocked_by_task_ids TEXT;

-- Table for baseline version history snapshots
CREATE TABLE IF NOT EXISTS project_baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  baseline_start_date TEXT NOT NULL,
  baseline_end_date TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  note TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_baselines (
  id TEXT PRIMARY KEY,
  baseline_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  baseline_start_date TEXT,
  baseline_end_date TEXT,
  FOREIGN KEY (baseline_id) REFERENCES project_baselines(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
