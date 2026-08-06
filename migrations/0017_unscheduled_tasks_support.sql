-- migrations/0017_unscheduled_tasks_support.sql
-- Add schedule_status column to tasks table for unscheduled/backlog tasks support
ALTER TABLE tasks ADD COLUMN schedule_status TEXT NOT NULL DEFAULT 'SCHEDULED';
