# Developer Scheduler V3 — Checkpoint 3A Shadow Schedule Engine

## Outcome

Checkpoint 3A adds a read/compute/persist-only Shadow scheduling path. Additive migrations `0028` and `0029` create dependency proposals, confirmed dependency/constraint/priority inputs, deterministic employee-minute allocations, Shadow versions, task diffs, impact summaries, and mutation idempotency.

It never changes Baseline V1, official Forecast V1, `projects.start_date/end_date`, `tasks.start_date/end_date`, official progress, completion facts, or schedule-adjustment events.

## Feature flags

| Flag | Checkpoint 3A value |
|---|---|
| `DYNAMIC_SCHEDULER_SHADOW_ENABLED` | `true` |
| `DYNAMIC_SCHEDULER_DEPENDENCY_REVIEW_ENABLED` | `true` |
| `DYNAMIC_SCHEDULER_OFFICIAL_APPLY_ENABLED` | `false` |

The Worker refuses a Shadow run if the official-apply flag is true. There is no official apply, final approval/rejection, restore, or schedule-adjustment application endpoint.

## Data flow

```text
Effective EOD Worklog / manager manual trigger
→ append Recalculation Request
→ canonical input snapshot + SHA-256 fingerprint
→ confirmed dependency graph validation
→ employee-local capacity calendar
→ authoritative Primary remaining effort
→ deterministic minute allocation
→ Shadow Project/Task Version + Diff + Allocation + Impact Summary
→ official-data fingerprint comparison
```

An EOD save is never rolled back by recalculation failure. It returns a separate `shadowRecalculation` status and `officialForecastChanged: false`.

## API

- `GET /api/v3/dependencies`
- `POST /api/v3/dependencies/proposals/generate`
- `POST /api/v3/dependencies/:id/confirm`
- `POST /api/v3/dependencies/:id/reject`
- `POST /api/v3/dependencies/batch-review`
- `GET/POST /api/v3/tasks/:taskId/constraints`
- `GET/POST /api/v3/project-priorities`
- `POST /api/v3/schedule-shadow/validate`
- `POST /api/v3/schedule-shadow/runs`
- `GET /api/v3/schedule-shadow/runs/:runId`
- `GET /api/v3/schedule-shadow/runs/:runId/impacts`
- `GET /api/v3/schedule-shadow/runs/:runId/allocations`
- `GET /api/v3/schedule-shadow/projects/:projectId/current`

Manager authority comes from `workers.can_manage_schedule_engine`, seeded from existing manager relationship permissions. Names are not authorization logic. CEO/COO can read Shadow data but cannot propose, confirm/reject, set constraints/priorities, or execute a run.

## Idempotency and staleness

- A request key is bound to a stable request fingerprint; same key/different request returns `IDEMPOTENCY_CONFLICT`.
- Engine result reuse is keyed by `(engine_version, input_fingerprint)`.
- Reuse creates no new Shadow Task, Allocation, or Diff rows.
- A new effective Worklog revision marks earlier versions for that Worklog stale and appends a new request.
- Historical Shadow versions remain for audit.

## Verification

- `tests/shadowScheduleEngine.test.ts`: named A–Z simulations plus proposal/canonicalization rules.
- `tests/shadowScheduleLocalD1.integration.test.ts`: restored-D1 proposal/role guard, Shadow persistence, reuse, idempotency conflict, and official-data fingerprint invariance.
- Existing Gantt, grid, holiday hatch, today line, print, progress, Worklog, and executive guards remain part of the regression suite.

## Explicitly deferred to Checkpoint 3B

- official Forecast apply;
- HYBRID auto apply;
- approval/rejection finalization;
- Forecast restore;
- schedule-adjustment application;
- rebaseline.
