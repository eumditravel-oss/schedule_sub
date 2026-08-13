-- Developer Scheduler V3 - Checkpoint 3B follow-up
-- QA safety patch for environments where 0031 was already applied before
-- the application-current race guard was added to the source migration.
-- Additive only; no historical Forecast, Baseline, Actual, or Shadow row is
-- changed by this migration.

CREATE TRIGGER IF NOT EXISTS trg_shadow_forecast_application_current_guard
BEFORE INSERT ON shadow_forecast_applications
BEGIN
  SELECT RAISE(ABORT, 'SHADOW_STALE')
  WHERE NOT EXISTS (
    SELECT 1 FROM shadow_schedule_versions
    WHERE shadow_version_id=NEW.shadow_version_id
      AND status='CURRENT'
      AND COALESCE(apply_status,'NOT_APPLIED')='NOT_APPLIED'
  );
END;
