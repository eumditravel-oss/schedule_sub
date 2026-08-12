# Dependency Proposal and Review — Checkpoint 3A

## Proposal

The proposal service examines deterministic WBS adjacency, TaskGroup, Baseline/Forecast non-overlap, and Primary relationship. It stores only `PROPOSED` rows with `HIGH`, `MEDIUM`, or `LOW` confidence and an evidence array.

Overlapping dates, the same start date, recognizable frontend/backend parallel pairs, and otherwise ambiguous adjacency are protected as parallel candidates and not forced into a dependency.

## Review

- Manager: list, generate, confirm, reject, set nonnegative lag, batch confirm/reject.
- CEO/COO: list only.
- Employee: only edges related through their assignments, read-only.

Before confirmation, all confirmed edges plus selected proposals are graph-validated. Any cycle, self-reference, duplicate, missing Task, cross-project edge, or negative lag aborts the write with a stable code. Edges are preserved as historical statuses rather than deleted.

## Stable codes

- `DEPENDENCY_PERMISSION_DENIED`
- `DEPENDENCY_CYCLE_DETECTED`
- `DEPENDENCY_SELF_REFERENCE`
- `DEPENDENCY_DUPLICATE`
- `DEPENDENCY_TASK_NOT_FOUND`
- `DEPENDENCY_CROSS_PROJECT_NOT_SUPPORTED`
- `INVALID_DEPENDENCY_LAG`
