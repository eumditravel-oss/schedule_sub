# Shadow Forecast Data Model — Checkpoint 3A

Migrations `0028_shadow_schedule_recalculation.sql` and `0029_shadow_engine_idempotency.sql` are additive.

| Entity | Purpose |
|---|---|
| `task_dependencies` | Candidate/reviewed dependency history |
| `task_constraints` | Effective Task scheduling constraint history |
| `project_priorities` | Manager-defined capacity collision priority |
| `schedule_recalculation_requests` | Trigger lifecycle separated from Worklog success |
| `schedule_recalculation_runs` | Engine version, fingerprints, validation, official-data hashes |
| `schedule_engine_input_snapshots` | Canonical immutable run input |
| `shadow_schedule_versions` | Project-level candidate dates/classification |
| `shadow_schedule_tasks` | Task before/after candidate and explanation |
| `shadow_capacity_allocations` | Employee/local-day integer-minute allocation |
| `shadow_impact_summaries` | One grouped cross-project summary |
| `shadow_impact_task_diffs` | Task-level Before/After diff |
| `shadow_engine_audit_events` | Actor/reason/audit trail |
| `shadow_engine_idempotency_keys` | Stable replay/conflict guard for manager writes |

`schedule_versions` and `schedule_version_tasks` continue to represent official Forecast. Shadow data never reuses their status fields and never updates them.

All Shadow versions identify their source official Forecast version. Status values are `CURRENT`, `STALE`, `INVALIDATED`, `BLOCKED`, or `EXPIRED`; none means approved/applied.
