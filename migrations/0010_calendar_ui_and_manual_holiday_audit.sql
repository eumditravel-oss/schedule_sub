-- migrations/0010_calendar_ui_and_manual_holiday_audit.sql

ALTER TABLE country_holidays ADD COLUMN created_by_name TEXT;
ALTER TABLE country_holidays ADD COLUMN updated_by_name TEXT;
ALTER TABLE country_holidays ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;
