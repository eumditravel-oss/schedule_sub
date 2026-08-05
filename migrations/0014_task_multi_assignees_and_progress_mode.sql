-- 0014_task_multi_assignees_and_progress_mode.sql

-- 1. Create task_assignees table
CREATE TABLE IF NOT EXISTS task_assignees (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  assignment_role TEXT NOT NULL DEFAULT 'PRIMARY',
  allocation_percent INTEGER NOT NULL DEFAULT 100,
  sort_order INTEGER NOT NULL DEFAULT 0,
  assigned_by_id TEXT,
  assigned_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  UNIQUE(task_id, worker_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_worker ON task_assignees(worker_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_role ON task_assignees(task_id, assignment_role);

-- 2. Add columns to tasks table
ALTER TABLE tasks ADD COLUMN primary_worker_id TEXT;
ALTER TABLE tasks ADD COLUMN progress_mode TEXT NOT NULL DEFAULT 'AUTO_TIME';
ALTER TABLE tasks ADD COLUMN availability_policy TEXT NOT NULL DEFAULT 'ANY_AVAILABLE';
ALTER TABLE tasks ADD COLUMN completion_confirmed INTEGER NOT NULL DEFAULT 0;

-- 3. Create progress mode change log table
CREATE TABLE IF NOT EXISTS task_progress_mode_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  old_mode TEXT NOT NULL,
  new_mode TEXT NOT NULL,
  old_actual_progress REAL NOT NULL,
  new_actual_progress REAL NOT NULL,
  changed_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_progress_mode_logs_task ON task_progress_mode_logs(task_id);
