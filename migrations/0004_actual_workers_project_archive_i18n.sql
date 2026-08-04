-- migrations/0004_actual_workers_project_archive_i18n.sql

-- 1. Reset workers table and insert the 5 actual team members
DELETE FROM workers;

INSERT OR REPLACE INTO workers (id, name, is_active, sort_order) VALUES
('wrk_01', '유종욱 실장', 1, 1),
('wrk_02', '박용진 수석', 1, 2),
('wrk_03', 'Thanh Phuong(탄 프엉)', 1, 3),
('wrk_04', 'Manh Cuong(끄엉)', 1, 4),
('wrk_05', 'Quoc Nhut(꾸옥 느엿)', 1, 5);

-- 2. Add status and archive tracking columns to projects
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE projects ADD COLUMN completed_at DATE;
ALTER TABLE projects ADD COLUMN completed_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_status_completed_at ON projects(status, completed_at);

-- 3. Add translation columns to projects
ALTER TABLE projects ADD COLUMN name_ko TEXT;
ALTER TABLE projects ADD COLUMN name_vi TEXT;
ALTER TABLE projects ADD COLUMN source_language TEXT;
ALTER TABLE projects ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE projects ADD COLUMN translation_error TEXT;

UPDATE projects SET name_ko = name, source_language = 'ko' WHERE name_ko IS NULL;

-- 4. Add translation columns to tasks
ALTER TABLE tasks ADD COLUMN task_name_ko TEXT;
ALTER TABLE tasks ADD COLUMN task_name_vi TEXT;
ALTER TABLE tasks ADD COLUMN source_language TEXT;
ALTER TABLE tasks ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE tasks ADD COLUMN translation_error TEXT;

UPDATE tasks SET task_name_ko = task_name, source_language = 'ko' WHERE task_name_ko IS NULL;
