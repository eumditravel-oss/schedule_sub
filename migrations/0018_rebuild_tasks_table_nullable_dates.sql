-- migrations/0018_rebuild_tasks_table_nullable_dates.sql
-- Rebuild tasks table to allow NULL start_date and end_date for UNSCHEDULED tasks

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_group_id TEXT,
  task_sort_order INTEGER DEFAULT 1,
  worker_name TEXT NOT NULL,
  primary_worker_id TEXT,
  task_name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  progress REAL DEFAULT 0,
  progress_mode TEXT DEFAULT 'AUTO_TIME',
  availability_policy TEXT DEFAULT 'ANY_AVAILABLE',
  completion_confirmed INTEGER DEFAULT 0,
  schedule_status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_by_name TEXT,
  updated_by_name TEXT,
  task_name_ko TEXT,
  task_name_vi TEXT,
  source_language TEXT,
  translation_status TEXT DEFAULT 'PENDING',
  translation_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO tasks_new (
  id, project_id, task_group_id, task_sort_order, worker_name, primary_worker_id, task_name,
  start_date, end_date, progress, progress_mode, availability_policy, completion_confirmed,
  schedule_status, created_by_name, updated_by_name, task_name_ko, task_name_vi,
  source_language, translation_status, translation_error, created_at, updated_at
)
SELECT
  id, project_id, task_group_id, task_sort_order, worker_name, primary_worker_id, task_name,
  start_date, end_date, progress, progress_mode, availability_policy, completion_confirmed,
  schedule_status, created_by_name, updated_by_name, task_name_ko, task_name_vi,
  source_language, translation_status, translation_error, created_at, updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
