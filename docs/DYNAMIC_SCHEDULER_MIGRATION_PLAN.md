# Developer Scheduler V3 — D1 Migration and Rollout Plan

## 0. Checkpoint 0.5/1 execution contract

- Migration ledger reconciliation is governed by `MIGRATION_LEDGER_RECONCILIATION_0015_0025.md`.
- 0015–0025 DDL is never replayed. QA and Production are schema-equivalent through 0025 while their ledger currently ends at 0014.
- The next unique file is `0026_v3_foundation.sql` after guarded ledger reconciliation.
- Migration is additive only: no DROP, date bulk update, progress bulk update, completion deletion, or Baseline overwrite.
- Minimal entities: `schedule_versions`, `schedule_version_tasks`, `task_actuals`, `task_completion_events`, `progress_snapshots`; centralized office policy and migration-run audit support are allowed only where needed by these entities.
- `V3_CUTOVER_DATE` is an environment/migration parameter with initial value `2026-08-11`.
- GROUPWARE exact snapshot target is 29 Tasks, 2026-08-05–2026-11-10. Baseline V1 is immutable and Forecast V1 is an identical `INITIAL_BASELINE_CLONE` with zero-workday variance.
- Legacy Bootstrap follows deterministic Rules A–D and unique `(project_id, task_id, cutover_date, source_type)`. A second run produces insert 0, update 0, duplicate 0.
- Bootstrap facts never masquerade as employee worklogs and are excluded from attendance, employee capacity use, overtime, missing-worklog, and digest metrics.
- Initial planned effort is `PROPOSED` from baseline valid workdays × office daily task minutes (VN 480, KR 420); deferred workforce weighting is excluded.
- Actual/completion and actor provenance are append-only. `TEST_SELECTOR` writes retain actor mode/session; CEO/COO are read/export-only.

## 1. Migration objectives

- Preserve every current project, Task, WBS group, assignment, date, progress value, completion record, calendar, and audit row.
- Create an immutable Baseline Version 1 from the exact current schedule.
- Create initial Confirmed Forecast Version 1 identical to that baseline/current schedule.
- Add worklog/actual/capacity/dependency/approval/notification structures without destructive table rebuilds.
- Keep the current UI/API operational during a staged dual-read/dual-write transition.
- Permit rollback before and after feature activation.

Execution status is recorded per environment in the release evidence. The design text below does not itself authorize replay of any SQL; only the guarded QA → Production procedure in this checkpoint does.

## 2. Current schema constraints

### Existing structures to reuse

- `projects`, `task_groups`, `tasks`, `task_assignees`, `workers`
- `country_holidays`, `calendar_overrides`, `calendar_override_groups`
- `project_baselines`, `task_baselines`
- `project_worker_allocations` and history
- project/leave/holiday/task/completion change logs
- integration request IDs/logging patterns

### Structures that must not be duplicated

- Do not add a separate `schedule_baselines` table. Strengthen `project_baselines`/`task_baselines`.
- Do not treat `daily_status` as a worklog. Retain it for compatibility until the new actual projection is live.
- Do not reuse leave-shift logs as generalized forecast versions. Retain them as legacy audit records linked from migration metadata when applicable.

### Schema ledger prerequisite

Production's migration ledger stops at `0014`, while actual tables/columns include repository work through `0025`. Before any V3 DDL:

1. export production and QA schema-only snapshots;
2. compute normalized table/index/column fingerprints;
3. map each present object to intended migration ownership;
4. create a reconciliation record without replaying DDL;
5. reserve a new unambiguous migration sequence after the current highest repository number;
6. prohibit duplicate numeric migration prefixes.

## 3. Proposed schema map

The table names below are proposals, not executable migrations.

### 3.1 Extend existing tables additively

| Existing table | Additive proposal | Purpose |
|---|---|---|
| `workers` | `office_id`, `timezone`, `base_daily_capacity_minutes` | Employee-local work date and minute capacity |
| `projects` | `current_confirmed_forecast_version_id`, `schedule_policy_id`, `priority` | Compatibility pointer and policy |
| `tasks` | `planned_effort_minutes`, `explicit_weight`, `criticality`, `actual_state` | Task effort/progress inputs; existing dates remain compatibility forecast projection |
| `task_assignees` | `effective_from`, `effective_to`, `is_acting_primary` | Primary history/temporary replacement |
| `project_baselines` | `status`, `approved_at/by`, `source_type`, `idempotency_key`, `schema_fingerprint`, `build_sha` | Immutable approved baseline header |
| `task_baselines` | WBS/order, effort, explicit weight, assignment snapshot, task name snapshot, constraint/dependency snapshot reference | Reproducible baseline facts |

Add a unique `(project_id, version)` constraint for future baseline inserts only after verifying no duplicates. Convenience baseline columns become read projections of the selected baseline and are not updated by worklogs.

### 3.2 Forecast and engine tables

#### `schedule_policies`

- ID, scope/project, mode (`AUTO_APPLY`, `HYBRID_APPROVAL`, `ALWAYS_APPROVAL`)
- movement thresholds, retroactive policy, priority policy, policy version
- created/updated actor/timestamps

#### `schedule_versions`

- ID, project ID, monotonic version number
- parent version ID, baseline ID
- status (`CALCULATING`, `TENTATIVE`, `CONFIRMED`, `SUPERSEDED`, `REJECTED`, `REVERTED`, `FAILED`)
- source adjustment/worklog, engine policy version and input hash
- project forecast start/end
- created/calculated/confirmed timestamps and actors
- unique `(project_id, version_number)` and unique engine idempotency key

#### `schedule_version_tasks`

- version ID, task ID
- forecast start/end
- remaining effort minutes and estimate source/confidence
- allocated assignment/capacity summary
- predecessor-ready date, constraint-ready date
- critical/slack minutes and explanation JSON
- unique `(schedule_version_id, task_id)`

#### `task_dependencies`

- predecessor/successor IDs
- type (`FINISH_TO_START`, later `START_TO_START`, `FINISH_TO_FINISH`)
- lag work minutes
- status (`PROPOSED`, `CONFIRMED`, `REJECTED`, `RETIRED`)
- proposal source/confidence, reviewed by/at
- unique active predecessor/successor/type relation

#### `task_constraints`

- task ID, type, constraint local date/time, severity (`HARD`, `SOFT`)
- source/status, approved by/at, effective period

### 3.3 Worklog, actual, and capacity tables

#### `daily_worklogs`

- ID, employee ID, local work date, timezone snapshot
- workflow status and revision
- morning/EOD idempotency keys and submission timestamps
- submitted-by user, on-behalf-of employee
- missing/late/retroactive flags
- current correlation/adjustment link
- unique `(employee_id, local_work_date)` and unique submission idempotency keys

#### `daily_worklog_entries`

- worklog ID, phase, employee/project/task/assignment
- work category, outside-schedule flag
- planned/actual minutes, target/progress before/after
- remaining estimated minutes and estimate source
- expected deliverable, work result, deliverable, blocker, exception reason
- completion reported/source candidate
- meeting minutes/evidence and attachment reference
- authoritative-progress flag
- unique task per worklog phase

#### `employee_capacity_events`

- employee, local date/start/end minute, signed capacity minutes
- type (leave, duty, meeting, training, overtime, override)
- approval state and source entity/worklog entry
- actor/subject/timezone and timestamps
- idempotency key

#### `task_actuals`

- task ID, actual state/progress
- actual start/completion timestamps and local dates
- remaining effort and source/confidence
- authoritative worklog/manager/inspection event
- revision and updated timestamp

This is a rebuildable current projection. Immutable source facts remain worklog/completion events.

#### `task_completion_events`

- task, source, actual completion date/time
- reported/accepted by, subject employee
- worklog/inspection/migration reference
- status/reversal link and reason

#### `progress_snapshots`

- scope type/ID, reference date/time
- baseline planned, actual overall, variance
- weight/source/confidence JSON, source version/build

### 3.4 Adjustment, approval, and notification tables

#### `schedule_adjustment_events`

Use the requested fields: adjustment/correlation/project/employee/worklog/source/reason, actor/subject, created/applied timestamps, approval state, before/after forecast versions and project ends, workday delta, snapshots, and revert metadata. Add engine input hash and policy version.

#### `schedule_adjustment_impacts`

- adjustment ID, impact scope/type/ID
- task/project/employee IDs
- before/after dates, remaining effort, delta work minutes/days
- reason/constraint/dependency codes
- approval-critical flag

Queryable rows are authoritative for UI/notifications. Header JSON snapshots remain recovery evidence.

#### `adjustment_approvals`

- adjustment ID, decision sequence, decision, actor, role, comment, timestamp
- expected tentative version and optimistic-lock token

#### Identity/organization

- `app_users`: authenticated identity subject and status
- `worker_user_links`: user-to-employee mapping
- `role_assignments`: scoped roles
- `offices`: timezone and base capacity policy
- `supervisor_relationships`: effective-dated manager/team relationships

#### Notifications

- `notification_subscriptions`: recipient, scope, event types, channels, digest preference
- `notifications`: one grouped adjustment summary per recipient
- `notification_outbox`: delivery channel, attempt count, next retry, delivered/dead-letter state

Recipients are resolved from relationships/subscriptions. Employee names never appear in authorization or routing conditions.

## 4. Baseline Version 1 snapshot procedure

### 4.1 Preconditions

- approved maintenance/read-only window for schedule mutations;
- production D1 export/backup checksum;
- current build SHA and API build fingerprint captured;
- schema fingerprint reconciled;
- duplicate project/task IDs and invalid date ranges reported;
- stakeholder sign-off that current dates are the approved baseline.

### 4.2 Idempotent snapshot key

Recommended key: `BASELINE_V1:<project_id>:<migration_run_id>`, with a unique project/version constraint. Rerun behavior:

- matching baseline hash: return existing Version 1;
- different hash for existing Version 1: stop with `BASELINE_HASH_MISMATCH`;
- never overwrite Version 1.

### 4.3 Snapshot contents

For every project, copy exact current project/task dates and WBS/assignment/effort facts. Do not regenerate dates from calendars. Preserve completed lifecycle and task completion records as migration completion facts.

For GROUPWARE specifically, Version 1 must reflect:

- project `2026-08-05` → `2026-11-10`;
- all current 29 Tasks with exact dates, group/order, names, assignments, modes, progress values, and completion flags;
- zero invented daily worklogs before activation.

### 4.4 Initial forecast

Create Confirmed Forecast Version 1 by copying Baseline Version 1 exactly. Set the project's current confirmed forecast pointer and compatibility task/project dates to those identical values. The initial adjustment reason is `MIGRATION_INITIAL_FORECAST`, delta zero.

## 5. Existing progress and completion preservation

- Preserve raw `tasks.progress`, `projects.progress`, `progress_mode`, `daily_status`, `completion_confirmed`, project status, and completed date.
- Create `task_actuals` with migration provenance:
  - explicitly confirmed/completed existing tasks → `MIGRATED_EXISTING_COMPLETION`;
  - incomplete tasks → preserve percentage as `MIGRATED_LEGACY_PROGRESS` with confidence, not as worklog-derived actual;
  - AUTO_TIME calculated DTO values are not written as actual facts.
- Completed projects retain lifecycle completion and receive migration completion-event references.
- Do not generate historical worklogs from `daily_status` or elapsed dates.

## 6. Dependency candidate migration

1. Generate candidates from explicit blocker IDs, stable WBS adjacency, non-overlapping date sequence, and task naming only as evidence.
2. Store all inferred relations as `PROPOSED` with confidence and source explanation.
3. Manager review UI confirms/rejects candidates.
4. Engine ignores candidates until `CONFIRMED`.
5. No blanket chain is created from WBS order.

## 7. Rollout checkpoints

### Phase A — Schema shadow

- Add tables/columns/indexes only.
- Feature flags off.
- Verify current APIs/UI byte-for-byte behavior where feasible.
- No Baseline/Forecast pointer changes.

### Phase B — Snapshot and shadow projections

- Create idempotent Baseline V1 and Forecast V1 in QA.
- Compare every project/task date and count.
- Build task actual projections from legacy facts without worklogs.
- Shadow engine computes diffs but cannot apply.

### Phase C — Worklog facts only

- Enable Morning/EOD for a pilot team/project.
- Save actual facts and capacity events.
- Engine preview only; current Gantt dates unchanged.
- Verify idempotency and actor/delegation audit.

### Phase D — Tentative forecast

- Persist tentative versions and manager approvals.
- Main Gantt remains legacy/confirmed compatibility dates.
- Compare engine output with manager expectation for a defined observation period.

### Phase E — Confirmed forecast projection

- Enable auto-apply only for low-risk HYBRID cases.
- Confirmed versions update compatibility `start_date/end_date` in the same transaction.
- Add baseline/forecast/actual layers and KPIs.

### Phase F — Full pilot, then broader rollout

- Pilot GROUPWARE/Viet QS first.
- Expand after success/error thresholds, missing worklog handling, notification reliability, and manager acceptance pass.

## 8. QA and production deployment sequence

For every checkpoint:

1. pre-change D1 backup and schema/data checksum;
2. apply migration to isolated/local D1 and test idempotency;
3. apply to QA;
4. verify schema fingerprint and zero unexpected row changes;
5. run unit/integration/browser suites and migration verification;
6. verify QA runtime/build SHA and screenshots;
7. obtain explicit production approval;
8. production backup;
9. production migration with write freeze where required;
10. post-migration counts/hashes and build fingerprint;
11. enable feature flags separately from DDL.

Never report localhost results as live QA/production evidence.

## 9. Verification matrix

| Invariant | Verification |
|---|---|
| No current rows lost | before/after counts by table and project |
| Baseline exact | project/task date hash equals pre-migration current schedule hash |
| Forecast V1 exact | Forecast V1 task-date hash equals Baseline V1 hash |
| Completion preserved | completed project/task IDs and dates match before/after |
| No invented worklogs | no worklog local date before activation date |
| Idempotent rerun | second snapshot produces zero new baseline/version rows |
| Current UI preserved | existing critical browser suite and screenshots |
| Actor separation | selected view employee cannot change write authorization |
| No auto completion | expired incomplete Task remains delayed/overdue |
| Build identity | Git, frontend, backend, QA, production fingerprints match |

## 10. Rollback strategy

### Before feature activation

- Disable flags and ignore shadow tables.
- Existing application continues reading current tables.
- Additive schema may remain; no destructive rollback is required.

### After worklog activation but before forecast apply

- Disable worklog writes/engine preview.
- Preserve submitted facts for audit; do not delete them.
- Existing schedule dates remain unchanged.

### After confirmed forecast activation

- Disable auto-apply.
- Create a restoration forecast version from the last known safe confirmed version.
- Atomically repoint the current confirmed version and compatibility dates.
- Record a revert adjustment; never delete versions or actual facts.

### Database restore

Use D1 backup restore only for catastrophic migration corruption, not normal business rollback. Any restore requires read-only mode, verified backup checksum, replay plan for facts submitted after backup, and a new build fingerprint verification.

## 11. Migration stop conditions

- schema fingerprint differs from reviewed expectation;
- Baseline Version 1 already exists with a different hash;
- task/project count or ID set changes unexpectedly;
- unresolved duplicate migration prefix/ledger ownership;
- authenticated identity is unavailable when enabling writes;
- completion/date hash differs after snapshot;
- engine produces non-zero diff for initial Forecast V1;
- QA build/runtime SHA mismatch;
- idempotency or rollback simulation fails.

## 12. Explicit non-actions for this design phase

- No DDL or migration file was created.
- No D1 migration was applied.
- No baseline or forecast row was created.
- No production data was modified.
- No feature flag or deployment was changed.
