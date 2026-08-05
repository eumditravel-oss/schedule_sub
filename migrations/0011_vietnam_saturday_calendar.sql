-- migrations/0011_vietnam_saturday_calendar.sql

-- 1. Add can_manage_country_calendar permission column to workers table
ALTER TABLE workers ADD COLUMN can_manage_country_calendar INTEGER NOT NULL DEFAULT 0;

-- 2. Grant country calendar management permission to Yo Jong-wook and Park Yong-jin
UPDATE workers
SET can_manage_country_calendar = 1
WHERE id IN ('wrk_01', 'wrk_02')
   OR name IN ('유종욱 실장', '박용진 수석');

-- 3. Create country_calendar_batch_events table
CREATE TABLE IF NOT EXISTS country_calendar_batch_events (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'VN_SATURDAY_OFF_BATCH',
  selected_dates_json TEXT NOT NULL,
  affected_worker_count INTEGER NOT NULL DEFAULT 0,
  affected_project_count INTEGER NOT NULL DEFAULT 0,
  affected_task_count INTEGER NOT NULL DEFAULT 0,
  changed_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  restored_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_country_batch_events_country_ym
ON country_calendar_batch_events(country_code, year, month);
