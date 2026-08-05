-- 0012_manual_country_holidays_only.sql
-- 1. Remove all automatic holidays (KASI, NAGER)
DELETE FROM country_holidays WHERE source IN ('KASI', 'NAGER');

-- 2. Ensure UNIQUE index on country_code + holiday_date
CREATE UNIQUE INDEX IF NOT EXISTS uq_country_holidays_code_date ON country_holidays(country_code, holiday_date);

-- 3. Create table for tracking country holiday shift logs and restoration
CREATE TABLE IF NOT EXISTS country_holiday_shift_logs (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    holiday_date TEXT NOT NULL,
    action_type TEXT NOT NULL,
    affected_tasks_json TEXT NOT NULL,
    created_by_id TEXT,
    created_by_name TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_country_holiday_shift_logs_code_ym
ON country_holiday_shift_logs(country_code, year, month);
