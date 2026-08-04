-- Migration: 0006_worker_calendar_holidays_and_leave.sql

-- 1. Add country_code and workweek_profile columns to workers table
ALTER TABLE workers ADD COLUMN country_code TEXT NOT NULL DEFAULT 'KR';
ALTER TABLE workers ADD COLUMN workweek_profile TEXT NOT NULL DEFAULT 'MON_FRI';

-- 2. Update country_code and workweek_profile for 7 active workers
UPDATE workers SET country_code = 'KR', workweek_profile = 'MON_FRI' WHERE id IN ('wrk_00_ceo', 'wrk_00_coo', 'wrk_01', 'wrk_02') OR name IN ('CEO', 'COO', '유종욱 실장', '박용진 수석');
UPDATE workers SET country_code = 'VN', workweek_profile = 'MON_SAT' WHERE id IN ('wrk_03', 'wrk_04', 'wrk_05') OR name IN ('Thanh Phuong(탄 프엉)', 'Manh Cuong(끄엉)', 'Quoc Nhut(꾸옥 느엿)');

-- 3. Create country_holidays table
CREATE TABLE IF NOT EXISTS country_holidays (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  name_local TEXT NOT NULL,
  name_ko TEXT,
  name_vi TEXT,
  source TEXT NOT NULL,
  source_year INTEGER NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_country_holidays_country_date
ON country_holidays(country_code, holiday_date);

-- 4. Create calendar_overrides table
CREATE TABLE IF NOT EXISTS calendar_overrides (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  work_date DATE NOT NULL,
  override_type TEXT NOT NULL,
  label_ko TEXT,
  label_vi TEXT,
  note TEXT,
  created_by_name TEXT NOT NULL,
  updated_by_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope_type, scope_key, work_date)
);
