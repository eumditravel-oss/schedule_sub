-- Controlled ledger-only reconciliation for the already-applied 0015-0025 schema.
--
-- Preconditions outside this statement:
--   1. A fresh full D1 export exists and its SHA-256 has been recorded.
--   2. Semantic schema fingerprint equals
--      e3f4e50e61a773910de265e3e2a30a97c58b9963f2da301272ccd04cb4666d17.
--   3. The repository migration hashes equal the values recorded in
--      docs/MIGRATION_LEDGER_RECONCILIATION_0015_0025.md.
--
-- This statement changes d1_migrations only. It inserts nothing unless the
-- ledger is exactly the known 0001-0014 prefix and all 0015-0025 structural
-- effects used by the forensic classification are present.

WITH
expected_prefix(name) AS (
  VALUES
    ('0001_initial_schema.sql'),
    ('0002_seed_data.sql'),
    ('0003_add_workers_and_editor_tracking.sql'),
    ('0004_actual_workers_project_archive_i18n.sql'),
    ('0005_add_executives_and_remove_demo_data.sql'),
    ('0006_worker_calendar_holidays_and_leave.sql'),
    ('0007_worker_access_role_and_ui_language.sql'),
    ('0008_project_schedule_shift_log.sql'),
    ('0009_leave_schedule_cascade_and_restore.sql'),
    ('0010_calendar_ui_and_manual_holiday_audit.sql'),
    ('0011_vietnam_saturday_calendar.sql'),
    ('0012_manual_country_holidays_only.sql'),
    ('0013_manual_country_holidays_cascade_v2.sql'),
    ('0014_task_multi_assignees_and_progress_mode.sql')
),
reconciled(ord, name) AS (
  VALUES
    (15, '0015_add_schedule_revision_to_tasks.sql'),
    (16, '0015_task_groups_hierarchy.sql'),
    (17, '0016_task_structure_change_logs.sql'),
    (18, '0017_unscheduled_tasks_support.sql'),
    (19, '0018_rebuild_tasks_table_nullable_dates.sql'),
    (20, '0019_cross_project_conflict_acknowledgements.sql'),
    (21, '0020_integration_tables_and_worker_permission.sql'),
    (22, '0021_project_worker_allocations.sql'),
    (23, '0022_baseline_and_blocker.sql'),
    (24, '0023_integration_sync_runs.sql'),
    (25, '0024_project_completion_audit_logs.sql'),
    (26, '0025_allocation_history.sql')
),
required_tables(name) AS (
  VALUES
    ('task_groups'),
    ('task_structure_change_logs'),
    ('conflict_acknowledgements'),
    ('integration_api_keys'),
    ('integration_entity_links'),
    ('integration_api_logs'),
    ('integration_rate_limits'),
    ('project_worker_allocations'),
    ('project_baselines'),
    ('task_baselines'),
    ('integration_sync_runs'),
    ('project_completion_logs'),
    ('project_worker_allocation_history')
),
required_task_columns(name) AS (
  VALUES
    ('task_group_id'),
    ('task_sort_order'),
    ('schedule_status'),
    ('schedule_revision'),
    ('baseline_start_date'),
    ('baseline_end_date'),
    ('is_blocked'),
    ('blocked_reason'),
    ('blocked_by_task_ids')
),
required_project_columns(name) AS (
  VALUES ('baseline_start_date'), ('baseline_end_date')
),
ledger_gate(ok) AS (
  SELECT
    (SELECT COUNT(*) FROM d1_migrations) = 14
    AND (SELECT MIN(id) FROM d1_migrations) = 1
    AND (SELECT MAX(id) FROM d1_migrations) = 14
    AND NOT EXISTS (
      SELECT 1
      FROM expected_prefix expected
      WHERE NOT EXISTS (
        SELECT 1 FROM d1_migrations actual WHERE actual.name = expected.name
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM d1_migrations actual
      WHERE NOT EXISTS (
        SELECT 1 FROM expected_prefix expected WHERE expected.name = actual.name
      )
    ) AS ok
),
schema_gate(ok) AS (
  SELECT
    NOT EXISTS (
      SELECT required.name
      FROM required_tables required
      WHERE NOT EXISTS (
        SELECT 1
        FROM sqlite_master object
        WHERE object.type = 'table' AND object.name = required.name
      )
    )
    AND NOT EXISTS (
      SELECT required.name
      FROM required_task_columns required
      WHERE NOT EXISTS (
        SELECT 1 FROM pragma_table_info('tasks') column_info
        WHERE column_info.name = required.name
      )
    )
    AND EXISTS (
      SELECT 1 FROM pragma_table_info('workers')
      WHERE name = 'can_manage_integrations'
    )
    AND NOT EXISTS (
      SELECT required.name
      FROM required_project_columns required
      WHERE NOT EXISTS (
        SELECT 1 FROM pragma_table_info('projects') column_info
        WHERE column_info.name = required.name
      )
    ) AS ok
)
INSERT INTO d1_migrations (name, applied_at)
SELECT reconciled.name, CURRENT_TIMESTAMP
FROM reconciled
WHERE (SELECT ok FROM ledger_gate) = 1
  AND (SELECT ok FROM schema_gate) = 1
  AND NOT EXISTS (
    SELECT 1 FROM d1_migrations existing WHERE existing.name = reconciled.name
  )
ORDER BY reconciled.ord;

SELECT
  changes() AS inserted_rows,
  COUNT(*) AS ledger_rows,
  MIN(id) AS first_id,
  MAX(id) AS last_id,
  MIN(CASE WHEN id = 15 THEN name END) AS id_15_name,
  MIN(CASE WHEN id = 26 THEN name END) AS id_26_name
FROM d1_migrations;
