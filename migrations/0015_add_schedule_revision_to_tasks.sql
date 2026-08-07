-- 0015_add_schedule_revision_to_tasks.sql
-- Safely add schedule_revision column to tasks table

ALTER TABLE tasks ADD COLUMN schedule_revision INTEGER NOT NULL DEFAULT 0;
