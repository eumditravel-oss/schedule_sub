-- Developer Scheduler V3 - Checkpoint 3B follow-up
-- Official Forecast history is append-only. The Foundation foreign keys use
-- cascading cleanup for pre-forecast data, but persisted snapshots must never
-- be removed through a task or project deletion.

CREATE TRIGGER IF NOT EXISTS trg_forecast_history_protect_task_delete
BEFORE DELETE ON tasks
WHEN EXISTS (
  SELECT 1 FROM schedule_version_tasks svt
  WHERE svt.project_id=OLD.project_id AND svt.task_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'OFFICIAL_FORECAST_HISTORY_PROTECTED');
END;

CREATE TRIGGER IF NOT EXISTS trg_forecast_history_protect_project_delete
BEFORE DELETE ON projects
WHEN EXISTS (
  SELECT 1 FROM schedule_versions sv WHERE sv.project_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'OFFICIAL_FORECAST_HISTORY_PROTECTED');
END;
