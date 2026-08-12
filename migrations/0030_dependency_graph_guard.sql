-- Developer Scheduler V3 - Checkpoint 3A
-- Serialize confirmed Dependency graph mutations with an additive global CAS guard.

CREATE TABLE IF NOT EXISTS dependency_graph_guard (
  guard_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  lock_token TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (guard_id = 'GLOBAL'),
  CHECK (revision >= 0)
);

INSERT OR IGNORE INTO dependency_graph_guard (guard_id, revision, lock_token)
VALUES ('GLOBAL', 0, NULL);

-- Every authoritative schedule input advances this token. Shadow persistence
-- carries the revision it calculated from; the insert trigger below aborts the
-- whole D1 batch if any authority changed between snapshot and persistence.
CREATE TABLE IF NOT EXISTS shadow_schedule_authority_guard (
  guard_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  lock_token TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (guard_id = 'GLOBAL'),
  CHECK (revision >= 0)
);

INSERT OR IGNORE INTO shadow_schedule_authority_guard (guard_id, revision, lock_token)
VALUES ('GLOBAL', 0, NULL);

ALTER TABLE schedule_recalculation_runs ADD COLUMN authority_revision INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER IF NOT EXISTS trg_shadow_run_authority_guard
BEFORE INSERT ON schedule_recalculation_runs
WHEN NEW.authority_revision <> (SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL')
BEGIN
  SELECT RAISE(ABORT, 'SHADOW_RUN_INPUT_CHANGED');
END;

-- Additive authority triggers. Shadow result/audit/request tables are
-- intentionally excluded because they are outputs, not calculation inputs.
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_workers_i AFTER INSERT ON workers BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_workers_u AFTER UPDATE ON workers BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_workers_d AFTER DELETE ON workers BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_projects_i AFTER INSERT ON projects BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_projects_u AFTER UPDATE ON projects BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_projects_d AFTER DELETE ON projects BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_tasks_i AFTER INSERT ON tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_tasks_u AFTER UPDATE ON tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_tasks_d AFTER DELETE ON tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_groups_i AFTER INSERT ON task_groups BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_groups_u AFTER UPDATE ON task_groups BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_groups_d AFTER DELETE ON task_groups BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_project_baselines_i AFTER INSERT ON project_baselines BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_project_baselines_u AFTER UPDATE ON project_baselines BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_project_baselines_d AFTER DELETE ON project_baselines BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_baselines_i AFTER INSERT ON task_baselines BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_baselines_u AFTER UPDATE ON task_baselines BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_baselines_d AFTER DELETE ON task_baselines BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_schedule_versions_i AFTER INSERT ON schedule_versions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_schedule_versions_u AFTER UPDATE ON schedule_versions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_schedule_versions_d AFTER DELETE ON schedule_versions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_schedule_version_tasks_i AFTER INSERT ON schedule_version_tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_schedule_version_tasks_u AFTER UPDATE ON schedule_version_tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_schedule_version_tasks_d AFTER DELETE ON schedule_version_tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_office_policies_i AFTER INSERT ON office_work_policies BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_office_policies_u AFTER UPDATE ON office_work_policies BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_office_policies_d AFTER DELETE ON office_work_policies BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_country_holidays_i AFTER INSERT ON country_holidays BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_country_holidays_u AFTER UPDATE ON country_holidays BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_country_holidays_d AFTER DELETE ON country_holidays BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_calendar_overrides_i AFTER INSERT ON calendar_overrides BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_calendar_overrides_u AFTER UPDATE ON calendar_overrides BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_calendar_overrides_d AFTER DELETE ON calendar_overrides BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_assignees_i AFTER INSERT ON task_assignees BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_assignees_u AFTER UPDATE ON task_assignees BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_assignees_d AFTER DELETE ON task_assignees BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_temp_primary_i AFTER INSERT ON temporary_primary_assignments BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_temp_primary_u AFTER UPDATE ON temporary_primary_assignments BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_temp_primary_d AFTER DELETE ON temporary_primary_assignments BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_dependencies_i AFTER INSERT ON task_dependencies BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_dependencies_u AFTER UPDATE ON task_dependencies BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_dependencies_d AFTER DELETE ON task_dependencies BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_constraints_i AFTER INSERT ON task_constraints BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_constraints_u AFTER UPDATE ON task_constraints BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_constraints_d AFTER DELETE ON task_constraints BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_priorities_i AFTER INSERT ON project_priorities BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_priorities_u AFTER UPDATE ON project_priorities BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_priorities_d AFTER DELETE ON project_priorities BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_worklogs_i AFTER INSERT ON daily_worklogs BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_worklogs_u AFTER UPDATE ON daily_worklogs BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_worklogs_d AFTER DELETE ON daily_worklogs BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_revisions_i AFTER INSERT ON daily_worklog_revisions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_revisions_u AFTER UPDATE ON daily_worklog_revisions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_revisions_d AFTER DELETE ON daily_worklog_revisions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_entries_i AFTER INSERT ON daily_worklog_entries BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_entries_u AFTER UPDATE ON daily_worklog_entries BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_entries_d AFTER DELETE ON daily_worklog_entries BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_contributions_i AFTER INSERT ON task_actual_contributions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_contributions_u AFTER UPDATE ON task_actual_contributions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_contributions_d AFTER DELETE ON task_actual_contributions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_aggregates_i AFTER INSERT ON task_actual_aggregates BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_aggregates_u AFTER UPDATE ON task_actual_aggregates BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_aggregates_d AFTER DELETE ON task_actual_aggregates BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_capacity_i AFTER INSERT ON employee_capacity_events BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_capacity_u AFTER UPDATE ON employee_capacity_events BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_capacity_d AFTER DELETE ON employee_capacity_events BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_overtime_i AFTER INSERT ON overtime_candidates BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_overtime_u AFTER UPDATE ON overtime_candidates BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_overtime_d AFTER DELETE ON overtime_candidates BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_actuals_i AFTER INSERT ON task_actuals BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_actuals_u AFTER UPDATE ON task_actuals BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_task_actuals_d AFTER DELETE ON task_actuals BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_completion_i AFTER INSERT ON task_completion_events BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_completion_u AFTER UPDATE ON task_completion_events BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER IF NOT EXISTS trg_shadow_auth_completion_d AFTER DELETE ON task_completion_events BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL'; END;
