# Checkpoint 2 — Daily Worklog API and Capacity Foundation

## Scope

Checkpoint 2 records Morning plans, EOD Actual facts, employee daily capacity, corrections, audit history, and effective Task/Project Actual progress. It intentionally performs no Baseline/Forecast date update and creates no schedule-adjustment event.

## Schema and state machine

Migration `0027_daily_worklog_capacity_foundation.sql` adds `daily_worklogs`, `daily_worklog_revisions`, `daily_worklog_entries`, `worklog_audit_events`, `employee_capacity_events`, `overtime_candidates`, `task_actual_contributions`, `task_actual_aggregates`, `worklog_correction_requests`, `temporary_primary_assignments`, and `worklog_idempotency_keys`. Logical states are `NOT_CREATED`, `MORNING_SUBMITTED`, `EOD_SUBMITTED`, `SELF_REVISED`, `RETROACTIVE_PENDING_REVIEW`, `CORRECTION_REQUESTED`, `MANAGER_CORRECTED`, and `VOIDED` (reserved).

## API

- `GET /api/v3/worklogs/context`
- `POST /api/v3/worklogs/morning`
- `GET /api/v3/worklogs/:worklogId`
- `POST /api/v3/worklogs/:worklogId/eod`
- `POST /api/v3/worklogs/:worklogId/revisions`
- `POST /api/v3/worklogs/:worklogId/correction-requests`
- `GET /api/v3/worklogs`
- `GET /api/v3/capacity/day`
- `GET /api/v3/tasks/:taskId/actual`

All writes require `Idempotency-Key`. The same key/payload replays the stored response; different payload returns `IDEMPOTENCY_CONFLICT`. EOD and revision use append-only Revision rows and a D1 batch transaction for header, entries, audit, contribution aggregate, capacity/overtime facts, and idempotency record.

## Role matrix

| Role | Own minutes | Task progress | Revision | Manager correction | Writes |
|---|---:|---:|---:|---:|---:|
| Primary / Temporary Primary | yes | yes | before cutoff | no | yes |
| Support | yes | no | before cutoff | no | yes |
| Team manager capability | yes | only as audited correction | yes | 15-minute increments | yes |
| CEO/COO viewer | read/print | read | no | no | HTTP 403 |

TEST ACTOR (`x-actor-employee-id`) is distinct from selected view (`x-selected-view-employee-id`). View selection never grants subject write permission.

## Timezone and office policy

Stored timestamps are UTC; `local_work_date` is employee-office local. VN uses `Asia/Ho_Chi_Minh`, 08:00–17:00, lunch 12:00–13:00, capacity 480, Morning normal through 09:00. KR uses `Asia/Seoul`, 09:00–17:00, lunch 12:00–13:00, capacity 420, Morning normal through 10:00.

## Capacity, gap, leave, and overtime

Calendar non-work days have zero capacity unless a valid WORK override restores office capacity. Effective capacity applies unique capacity events once; a full-day zero-capacity result is not reduced again. Approved/Emergency leave entries reduce capacity by their recorded minutes; Emergency leave requires manager review.

`abs(actual-capacity) <= 30` passes without a gap reason. A shortage beyond 30 requires a stable gap code and text. Excess preserves raw Actual and creates a `PENDING_REVIEW` overtime candidate with reason/evidence; it does not become forecast scheduling capacity.

## Revision and Actual aggregation

Accepted entries are never updated or deleted. A later effective revision marks former Revision/contributions superseded and inserts replacements. Task minutes sum effective per-employee contributions. Task progress/remaining/completion comes only from the latest effective Primary contribution; Support progress is forbidden. `task_actual_aggregates` is preferred by overview, project detail, Task API, print consumers, and progress-foundation calculation. Legacy Bootstrap remains provenance/fallback and is excluded from daily worklog/capacity/overtime counts.

## Validation and stable errors

The implementation returns the required stable errors: `WORKLOG_PERMISSION_DENIED`, `WORKLOG_READ_ONLY_ACTOR`, `WORKLOG_ALREADY_EXISTS`, `IDEMPOTENCY_CONFLICT`, `VERSION_CONFLICT`, `INVALID_TIME_INCREMENT`, `INVALID_LOCAL_WORK_DATE`, `ENTRY_TIME_OVERLAP`, `PRIMARY_PROGRESS_REQUIRED`, `SUPPORT_PROGRESS_FORBIDDEN`, `PROGRESS_DECREASE_REQUIRES_CORRECTION`, `PROGRESS_100_REQUIRES_ZERO_REMAINING`, `ZERO_REMAINING_REQUIRES_COMPLETION`, `GAP_REASON_REQUIRED`, `OVERTIME_REASON_REQUIRED`, `RETROACTIVE_REVIEW_REQUIRED`, `TASK_ALREADY_COMPLETED`, `LEAVE_LINK_REQUIRED`, and `MEETING_RECORD_REQUIRED`.

## Test and QA evidence contract

Policy tests cover timezone deadlines, 30/15-minute increments, Primary completion/decrease constraints, interval/lunch overlap, and stable payload fingerprints. Integration/E2E must additionally prove missing-Morning EOD, Support/Executive guards, gap/overtime, partial leave/holiday/work override, next valid workday cutoff, idempotent replay, revision replacement (300 not 540), Task/Project Actual parity, and zero Forecast date change. The temporary non-menu harness is `/qa/daily-worklog`.

## Deferred scope

Schedule engine recalculation, dependency movement, adjustment approval UI, notifications, the final worklog drawer, and Baseline/Forecast/Actual three-layer Gantt are deferred to later checkpoints.
