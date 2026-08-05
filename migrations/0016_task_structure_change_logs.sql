-- migrations/0016_task_structure_change_logs.sql
CREATE TABLE IF NOT EXISTS task_structure_change_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  change_type TEXT NOT NULL, -- 'TASK_MOVED_BETWEEN_GROUPS', 'TASK_REORDERED', 'GROUP_REORDERED'
  source_group_id TEXT,
  target_group_id TEXT,
  old_sort_order INTEGER,
  new_sort_order INTEGER,
  changed_by_id TEXT,
  changed_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_struct_logs_project ON task_structure_change_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_task_struct_logs_task ON task_structure_change_logs(task_id);
