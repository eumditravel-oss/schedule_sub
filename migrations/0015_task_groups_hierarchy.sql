-- 0015_task_groups_hierarchy.sql
-- Task Group (공정 대분류) table and hierarchy fields for tasks

-- 1. Create task_groups table
CREATE TABLE IF NOT EXISTS task_groups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  group_name_ko TEXT,
  group_name_vi TEXT,
  source_language TEXT NOT NULL DEFAULT 'ko',
  translation_status TEXT NOT NULL DEFAULT 'COMPLETED',
  color_key TEXT NOT NULL DEFAULT 'BLUE',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT,
  created_by_name TEXT,
  updated_by_id TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_groups_project ON task_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_task_groups_project_order ON task_groups(project_id, sort_order);

-- 2. Add hierarchy columns to tasks table
ALTER TABLE tasks ADD COLUMN task_group_id TEXT;
ALTER TABLE tasks ADD COLUMN task_sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(task_group_id);

-- 3. Backfill: Create a default task group for every existing project
-- Each project gets "기존 작업 / Công việc hiện có" group
INSERT INTO task_groups (
  id, project_id, group_name, group_name_ko, group_name_vi,
  source_language, translation_status, color_key, sort_order,
  created_by_name, created_at
)
SELECT
  'tgrp_' || REPLACE(LOWER(HEX(RANDOMBLOB(8))), '-', ''),
  id,
  '기존 작업',
  '기존 작업',
  'Công việc hiện có',
  'ko',
  'COMPLETED',
  'BLUE',
  1,
  'system_migration',
  CURRENT_TIMESTAMP
FROM projects
WHERE id NOT IN (SELECT DISTINCT project_id FROM task_groups WHERE deleted_at IS NULL);

-- 4. Backfill: Assign all existing tasks to their project's default group
UPDATE tasks
SET task_group_id = (
  SELECT tg.id FROM task_groups tg
  WHERE tg.project_id = tasks.project_id
    AND tg.deleted_at IS NULL
  ORDER BY tg.sort_order ASC
  LIMIT 1
),
task_sort_order = (
  SELECT COUNT(*) FROM tasks t2
  WHERE t2.project_id = tasks.project_id
    AND t2.created_at <= tasks.created_at
    AND t2.id <= tasks.id
)
WHERE task_group_id IS NULL;

-- 5. Backfill: task_assignees PRIMARY from worker_name (if not already done)
-- Match by workers.id = tasks.worker_name OR workers.name = tasks.worker_name
INSERT OR IGNORE INTO task_assignees (
  id, task_id, worker_id, assignment_role, allocation_percent,
  sort_order, assigned_by_name, created_at
)
SELECT
  'ta_' || REPLACE(LOWER(HEX(RANDOMBLOB(8))), '-', ''),
  t.id,
  w.id,
  'PRIMARY',
  100,
  0,
  'system_migration',
  CURRENT_TIMESTAMP
FROM tasks t
JOIN workers w ON (w.id = t.worker_name OR w.name = t.worker_name)
WHERE t.id NOT IN (
  SELECT DISTINCT task_id FROM task_assignees
  WHERE assignment_role = 'PRIMARY' AND deleted_at IS NULL
)
AND t.worker_name IS NOT NULL
AND t.worker_name != '';

-- 6. Backfill: primary_worker_id in tasks
UPDATE tasks
SET primary_worker_id = (
  SELECT worker_id FROM task_assignees
  WHERE task_id = tasks.id
    AND assignment_role = 'PRIMARY'
    AND deleted_at IS NULL
  LIMIT 1
)
WHERE primary_worker_id IS NULL;

-- 7. Backfill: progress_mode based on daily_status existence
-- Tasks with any daily_status entries → STATUS_BASED; others → AUTO_TIME (already default)
UPDATE tasks
SET progress_mode = 'STATUS_BASED'
WHERE id IN (
  SELECT DISTINCT task_id FROM daily_status WHERE status != 'NONE'
)
AND progress_mode = 'AUTO_TIME';
