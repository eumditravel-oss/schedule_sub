-- 0003_add_workers_and_editor_tracking.sql

-- 1. Workers Table
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial worker records from existing task worker names
INSERT OR IGNORE INTO workers (id, name, sort_order) VALUES
('wrk_1', '김개발', 1),
('wrk_2', '박개발', 2),
('wrk_3', '이프론트', 3),
('wrk_4', '최백엔드', 4),
('wrk_5', '정검증', 5);

-- 2. Add editor tracking columns to tasks
ALTER TABLE tasks ADD COLUMN created_by_name TEXT;
ALTER TABLE tasks ADD COLUMN updated_by_name TEXT;

-- 3. Add editor tracking column to daily_status
ALTER TABLE daily_status ADD COLUMN updated_by_name TEXT;

-- 4. Set default values for existing rows
UPDATE tasks SET created_by_name = worker_name WHERE created_by_name IS NULL;
UPDATE tasks SET updated_by_name = worker_name WHERE updated_by_name IS NULL;
